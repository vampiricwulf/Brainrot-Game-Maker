// Desktop wrapper (spec §2): the same single-file web app in a native window.
//
// The app opens extra windows with `window.open` (the audience window for OBS, and the
// "Open on YouTube" fallback). A plain webview blocks those, so every `window.open` request
// gets a real Tauri window. Creating it ourselves (instead of letting WebView2 make a bare
// popup) matters for two reasons: the new window can load the app's own pages (served by
// Tauri's custom protocol, which a bare popup wouldn't have), and it stays linked to the host
// window as `window.opener`, which the host ⇄ audience sync relies on.
//
// Streaming the sound (Discord, OBS): the game's sound is played by WebView2's own processes,
// not by this exe, and screen-share tools capture sound per program. So:
// - a second launch focuses the running app instead of starting a copy that shares its
//   WebView2 processes;
// - the host page is told when the app runs as administrator or in compatibility mode (WebView2
//   then starts its processes outside this app, where per-app capture can't see them);
// - the "Discord audio fix" (on unless the host turns it off) plays the sound in WebView2's main
//   process, a direct child of this exe, which is what Discord needs to capture it (tested on Windows).
//
// The fix must never keep the app from working:
// - a start that WebView2 keeps refusing with one set of switches alternates with the other
//   (start_main, Plan::attempt);
// - if WebView2's browser process crashes with the fix on, the app restarts without it and the
//   host page offers to try it again (watch_for_crash). Until then the fix's switches aren't used,
//   not even as a fallback, so a crash can't become a restart loop;
// - it can be switched off from outside the app: an empty `discord-audio-fix-off` file in the
//   settings folder, or starting the app with --no-audio-fix (see README.md).

// Hides the console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::ffi::OsStr;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

mod migrate;
mod saves;
mod update;

use tauri::webview::{NewWindowFeatures, NewWindowResponse};
use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};

/// Unique labels for windows opened by the page (matches the "popup-*" capability).
static POPUPS: AtomicUsize = AtomicUsize::new(0);

/// WebView2 switches for the Discord audio fix. Setting any switches replaces wry's defaults, so
/// those are repeated here (no Edge mini menu, PDF toolbar or SmartScreen; autoplay with sound).
/// All features must stay in ONE --disable-features switch: a second one replaces the first.
/// AudioServiceOutOfProcess plays the sound in the WebView2 browser process, a direct child of
/// this exe, instead of a separate audio process one level further down.
/// The page's own copy (for windows it creates) arrives as `window.__JB_BROWSER_ARGS`.
const AUDIO_FIX_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,AudioServiceOutOfProcess --autoplay-policy=no-user-gesture-required";

/// The switches the main window started with (unset: wry's defaults). Every webview that shares
/// the WebView2 data folder must use exactly the same ones, or WebView2 refuses to create it.
static ACTIVE_ARGS: OnceLock<&'static str> = OnceLock::new();

/// Launch switch that turns the Discord audio fix off (saved, like unticking it in the app), for
/// when the app won't open or its window stays blank with it. Given to a second launch, it also
/// restarts the running copy without the fix.
const NO_AUDIO_FIX_SWITCH: &str = "--no-audio-fix";

/// In the app's settings folder (%APPDATA%\com.brainrotgames.maker on Windows), the fix is on
/// unless one of these (empty) files exists. The .txt is what Explorer's New › Text Document makes
/// when file extensions are hidden.
const FIX_OFF_FILES: [&str; 2] = ["discord-audio-fix-off", "discord-audio-fix-off.txt"];

/// The file that turned the fix on while it was opt-in (it's on by default now).
const LEGACY_FIX_ON_FILE: &str = "discord-audio-fix";

/// Written when WebView2's browser process dies with the fix on. Until the host tries the fix
/// again, the app starts without it (and never falls back to it); the saved setting itself is
/// left alone.
const FIX_CRASHED_FILE: &str = "discord-audio-fix-crashed";

/// Attempts at starting the host window with the wanted switches before trying the other ones,
/// RETRY_DELAY apart (about 4 s): right after a restart, the old copy's WebView2 processes can
/// still hold the data folder with the old switches.
const START_TRIES: u32 = 17;
/// Further attempts, alternating between the other switches and the wanted ones (about 3 s more),
/// before giving up: either set may work once the old processes are gone.
const MORE_TRIES: u32 = 12;
const RETRY_DELAY: Duration = Duration::from_millis(250);

/// How long the page's autosave may lag behind an edit, plus a margin: a restart the page didn't
/// ask for waits this long first (the page's own restartApp waits the same).
const AUTOSAVE_WAIT: Duration = Duration::from_millis(800);

/// Event for the host page: a second launch with --no-audio-fix switched the fix off. Payload: whether
/// the app restarts without it (see src/lib/desktop.svelte.ts).
const FIX_OFF_EVENT: &str = "audio-fix-off";

fn is_audience(url: &Url) -> bool {
    url.fragment() == Some("audience")
}

/// The app's settings folder, where the fix's files live.
fn settings_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok()
}

fn remove_if_there(path: &Path) -> io::Result<()> {
    match std::fs::remove_file(path) {
        Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(()),
        other => other,
    }
}

/// Whether the Discord audio fix is switched on (the default) in settings folder `dir`.
fn fix_wanted_in(dir: &Path) -> bool {
    !FIX_OFF_FILES.iter().any(|name| dir.join(name).exists())
}

/// Save the Discord audio fix as on or off in settings folder `dir`. It applies from the next start.
fn save_fix_in(dir: &Path, on: bool) -> io::Result<()> {
    if on {
        FIX_OFF_FILES
            .iter()
            .try_for_each(|name| remove_if_there(&dir.join(name)))
    } else {
        std::fs::create_dir_all(dir)?;
        std::fs::write(dir.join(FIX_OFF_FILES[0]), b"")
    }
}

/// Remove the opt-in file from before the fix was on by default (it means nothing now).
fn drop_legacy_flag_in(dir: &Path) {
    if let Err(err) = remove_if_there(&dir.join(LEGACY_FIX_ON_FILE)) {
        eprintln!("couldn't remove the old Discord audio fix file: {err}");
    }
}

/// Whether WebView2 crashed with the fix on, and the host hasn't tried the fix again since.
fn crashed_in(dir: &Path) -> bool {
    dir.join(FIX_CRASHED_FILE).exists()
}

// Only the WebView2 crash handler (Windows) writes the note.
#[cfg_attr(not(windows), allow(dead_code))]
fn mark_crashed_in(dir: &Path) -> io::Result<()> {
    std::fs::create_dir_all(dir)?;
    std::fs::write(dir.join(FIX_CRASHED_FILE), b"")
}

fn clear_crashed_in(dir: &Path) -> io::Result<()> {
    remove_if_there(&dir.join(FIX_CRASHED_FILE))
}

fn is_no_fix_switch(arg: &OsStr) -> bool {
    arg.to_str()
        .is_some_and(|arg| arg.eq_ignore_ascii_case(NO_AUDIO_FIX_SWITCH))
}

fn has_no_fix_switch<I: IntoIterator<Item = S>, S: AsRef<OsStr>>(args: I) -> bool {
    args.into_iter().any(|arg| is_no_fix_switch(arg.as_ref()))
}

/// How this run starts, from the settings folder and the launch switches.
#[derive(Debug, PartialEq)]
struct Plan {
    /// The fix is switched on (saved).
    fix_saved: bool,
    /// WebView2 crashed with the fix's switches and the host hasn't tried them again since. This run
    /// doesn't use them at all, not even as a fallback, so no crash can turn into a restart loop.
    crash_noted: bool,
}

/// One way to start the host window: its WebView2 switches, and what the page is told about them.
#[derive(Debug, PartialEq, Clone, Copy)]
struct Start {
    /// The switches (None: wry's defaults).
    args: Option<&'static str>,
    /// The fix is switched on, but WebView2 wouldn't start with it this time.
    failed: bool,
    /// The fix is switched on, but this run is without it because WebView2 crashed with it.
    crashed: bool,
}

impl Plan {
    /// The start this run asks for.
    fn wanted(&self) -> Start {
        let crashed = self.fix_saved && self.crash_noted;
        Start {
            args: (self.fix_saved && !crashed).then_some(AUDIO_FIX_ARGS),
            failed: false,
            crashed,
        }
    }

    /// The other set of switches, for when WebView2 keeps refusing the wanted ones (the previous
    /// copy's processes can hold the data folder with the other set for a few seconds). None:
    /// there's nothing else to try.
    fn fallback(&self) -> Option<Start> {
        if self.wanted().args.is_some() {
            // Switched on but started without it: the page says so and offers a restart.
            Some(Start {
                args: None,
                failed: true,
                crashed: false,
            })
        } else if self.crash_noted {
            // Those switches just crashed WebView2: never again until the host asks for them.
            None
        } else {
            // Switched off but started with it: the page offers the restart that turns it off.
            Some(Start {
                args: Some(AUDIO_FIX_ARGS),
                failed: false,
                crashed: false,
            })
        }
    }

    /// Attempt `n` (from 0): START_TRIES with the wanted switches, then MORE_TRIES alternating
    /// between the fallback (first) and the wanted ones. None: give up.
    fn attempt(&self, n: u32) -> Option<Start> {
        if n >= START_TRIES + MORE_TRIES {
            return None;
        }
        let other = n >= START_TRIES && (n - START_TRIES).is_multiple_of(2);
        let fallback = if other { self.fallback() } else { None };
        Some(fallback.unwrap_or_else(|| self.wanted()))
    }
}

/// `dir`: the settings folder (None if it can't be found). `no_fix_switch`: started with --no-audio-fix,
/// which turns the fix off for good (it's saved), like unticking it in the app.
fn plan_start(dir: Option<&Path>, no_fix_switch: bool) -> Plan {
    let Some(dir) = dir else {
        return Plan {
            fix_saved: !no_fix_switch,
            crash_noted: false,
        };
    };
    drop_legacy_flag_in(dir);
    if no_fix_switch {
        if let Err(err) = save_fix_in(dir, false) {
            eprintln!("couldn't save the Discord audio fix as off: {err}");
        }
    }
    Plan {
        fix_saved: !no_fix_switch && fix_wanted_in(dir),
        crash_noted: crashed_in(dir),
    }
}

/// Turn the Discord audio fix on or off. It takes effect at the next start.
#[tauri::command]
fn set_audio_fix(app: AppHandle, on: bool) -> Result<(), String> {
    let dir = settings_dir(&app).ok_or("The app's settings folder wasn't found.")?;
    // Switching it on is a fresh try: an earlier crash no longer keeps it off.
    let saved =
        save_fix_in(&dir, on).and_then(|()| if on { clear_crashed_in(&dir) } else { Ok(()) });
    saved.map_err(|err| format!("Couldn't save the setting: {err}"))
}

/// Restart the app. It goes through the normal exit, so the single-instance lock is let go
/// before the new copy starts.
#[tauri::command]
async fn restart_app(app: AppHandle) {
    app.request_restart();
}

/// "Try it again" after WebView2 crashed with the fix on: forget the crash and restart with it.
#[tauri::command]
async fn retry_audio_fix(app: AppHandle) -> Result<(), String> {
    let dir = settings_dir(&app).ok_or("The app's settings folder wasn't found.")?;
    clear_crashed_in(&dir).map_err(|err| format!("Couldn't save the setting: {err}"))?;
    app.request_restart();
    Ok(())
}

/// The folders the app writes to, so the host page can say where its data is (nothing is hidden):
/// `data` is WebView2's data folder, which holds the autosave, stored media and the page's settings
/// (Tauri's default for the webview: %LOCALAPPDATA%\com.brainrotgames.maker on Windows);
/// `settings` holds the Discord audio fix's files (%APPDATA%\com.brainrotgames.maker), and only
/// exists once one was written.
/// `old-data` and `old-settings` are the folders the app had as Jeopardy Builder, while they still
/// exist (see migrate.rs).
fn data_folder(app: &AppHandle, which: &str) -> Option<PathBuf> {
    match which {
        "data" => app.path().app_local_data_dir().ok(),
        "settings" => settings_dir(app),
        "old-data" => data_folder(app, "data").and_then(|dir| migrate::old_for(&dir)),
        "old-settings" => settings_dir(app).and_then(|dir| migrate::old_for(&dir)),
        "saves" => saves::beside_exe(),
        "saves-documents" => app.path().document_dir().ok().map(|dir| dir.join(saves::FOLDER)),
        _ => None,
    }
}

/// This start moved the old Jeopardy Builder folders over (the page says so once).
static MOVED_OLD_DATA: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn data_folders(app: AppHandle) -> serde_json::Value {
    let describe = |which: &str| {
        let path = data_folder(&app, which);
        serde_json::json!({
            "path": path.as_ref().map(|p| p.display().to_string()),
            "exists": path.as_ref().is_some_and(|p| p.is_dir()),
        })
    };
    serde_json::json!({
        "data": describe("data"),
        "settings": describe("settings"),
        "oldData": describe("old-data"),
        "oldSettings": describe("old-settings"),
        "saves": describe("saves"),
        "savesDocuments": describe("saves-documents"),
        "moved": MOVED_OLD_DATA.load(Ordering::SeqCst),
    })
}

/// Before any window exists: move the folders the app had as Jeopardy Builder to the new names. If the
/// old app is still running (its files are in use), ask to close it and retry; Cancel starts without
/// the old data, which then stays where it is (ℹ About lists it).
fn move_old_data(app: &AppHandle) {
    for which in ["data", "settings"] {
        let Some(new) = data_folder(app, which) else {
            continue;
        };
        let Some(old) = migrate::old_for(&new) else {
            continue;
        };
        loop {
            match migrate::move_folder(&old, &new) {
                Ok(migrate::Outcome::Moved | migrate::Outcome::MovedLeftover) => {
                    MOVED_OLD_DATA.store(true, Ordering::SeqCst);
                    break;
                }
                Ok(_) => break,
                Err(err) => {
                    eprintln!(
                        "couldn't move {} to {}: {err}",
                        old.display(),
                        new.display()
                    );
                    #[cfg(windows)]
                    if ask_retry(&format!(
                        "Jeopardy Builder is now Brainrot Games Maker, and your games and media need to move \
                         to its new folder. They can't be moved while the old Jeopardy Builder is open.\n\n\
                         Close Jeopardy Builder, then click Retry. Cancel starts without them (they stay in \
                         {}).\n\nDetails: {err}",
                        old.display()
                    )) {
                        continue;
                    }
                    break;
                }
            }
        }
    }
}

/// Show one of the app's own folders (see data_folder) in the file manager. Only those: the page
/// can't have any other path opened.
#[tauri::command]
fn open_data_folder(app: AppHandle, which: String) -> Result<(), String> {
    let dir = data_folder(&app, &which).ok_or("That folder wasn't found.")?;
    // The saves folder is made on first use; opening it before the first save makes it.
    if which == "saves" && !dir.is_dir() {
        let _ = std::fs::create_dir_all(&dir);
    }
    if !dir.is_dir() {
        return Err(format!("{} doesn't exist yet.", dir.display()));
    }
    #[cfg(windows)]
    let program = "explorer";
    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(all(unix, not(target_os = "macos")))]
    let program = "xdg-open";
    // Explorer's exit code says nothing about whether the window opened, so only a failed start counts.
    std::process::Command::new(program)
        .arg(&dir)
        .spawn()
        .map(|_| ())
        .map_err(|err| format!("Couldn't open {}: {err}", dir.display()))
}

/// Save a file (a .brainrot pack, a .json game or an exported .html) into BrainrotSaves next to the exe,
/// or Documents\BrainrotSaves when the app may not write in the exe's folder. The bytes come as the raw request
/// body (big packs), the file name in the `x-name` header (URI-encoded). `x-mode: new` never replaces a save
/// (it becomes "Game (2).brainrot"…); `backup` replaces a save of that name and keeps the one it replaces as
/// "Game.brainrot.bak" (and the one before as .bak2); anything else (autosaves) just replaces it. `x-docs-name`
/// and `x-docs-mode`: the same for Documents (the page knows which saves there are this game's), else as above.
/// Returns where it went. Async, so the window doesn't freeze while a big file is written.
#[tauri::command]
async fn save_file(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<serde_json::Value, String> {
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else {
        return Err("Nothing to save.".into());
    };
    let header = |key: &str| request.headers().get(key).and_then(|v| v.to_str().ok());
    let file_name = |key: &str| header(key).and_then(urlencoding_decode).and_then(|v| saves::clean_name(&v));
    let name = file_name("x-name").ok_or("That isn't a file name the app can save.")?;
    let mode = header("x-mode");
    let docs_name = file_name("x-docs-name").unwrap_or_else(|| name.clone());
    let docs_mode = header("x-docs-mode").or(mode);
    let write = |dir: &Path, name: &str, mode: Option<&str>| match mode {
        Some("new") => saves::write_save(dir, &saves::unused_name(dir, name), data, 0),
        Some("backup") => saves::write_save(dir, name, data, saves::BACKUPS),
        _ => saves::write_save(dir, name, data, 0),
    };
    let beside = data_folder(&app, "saves");
    let first_err = match beside.as_deref().map(|dir| write(dir, &name, mode)) {
        Some(Ok(path)) => return Ok(serde_json::json!({ "path": path.display().to_string(), "fallback": false })),
        // Only a folder the app may not write in sends the save to Documents: a full disk or a file another
        // program holds open is said as it is (a save in Documents would leave versions in two folders).
        Some(Err(err)) if !saves::may_fall_back(&err) => return Err(format!("Couldn't save {name}: {err}")),
        Some(Err(err)) => Some(err),
        None => None,
    };
    let docs = data_folder(&app, "saves-documents").ok_or("No folder to save in.")?;
    match write(&docs, &docs_name, docs_mode) {
        Ok(path) => Ok(serde_json::json!({ "path": path.display().to_string(), "fallback": true })),
        Err(err) => Err(format!(
            "Couldn't save {name}: {}",
            first_err.map_or_else(|| err.to_string(), |first| format!("{first}; and in Documents: {err}"))
        )),
    }
}

/// Run file work off the main thread (a big file would freeze the window meanwhile).
async fn off_main<T: Send + 'static>(work: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|err| format!("Couldn't finish: {err}"))?
}

/// `%20`-style decoding of the file name header (headers are ASCII; names may not be).
fn urlencoding_decode(v: &str) -> Option<String> {
    let bytes = v.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// The saves in BrainrotSaves (beside the exe, then Documents), newest first, for the Open list.
#[tauri::command]
fn list_saves(app: AppHandle) -> serde_json::Value {
    let mut out = Vec::new();
    for (place, which) in [("app", "saves"), ("documents", "saves-documents")] {
        let Some(dir) = data_folder(&app, which) else {
            continue;
        };
        for s in saves::list_saves(&dir) {
            out.push(serde_json::json!({ "name": s.name, "size": s.size, "modified": s.modified, "place": place }));
        }
    }
    serde_json::json!(out)
}

/// One save's bytes (for Open), from BrainrotSaves beside the exe or in Documents.
#[tauri::command]
async fn read_save(app: AppHandle, name: String, place: String) -> Result<tauri::ipc::Response, String> {
    let name = saves::clean_name(&name).ok_or("That isn't a save.")?;
    let dir = saves_folder(&app, &place)?;
    off_main(move || {
        std::fs::read(dir.join(&name))
            .map(tauri::ipc::Response::new)
            .map_err(|err| format!("Couldn't open {name}: {err}"))
    })
    .await
}

/// BrainrotSaves beside the exe ("app") or in Documents ("documents").
fn saves_folder(app: &AppHandle, place: &str) -> Result<PathBuf, String> {
    let which = if place == "documents" { "saves-documents" } else { "saves" };
    data_folder(app, which).ok_or_else(|| "No saves folder.".into())
}

/// Delete an autosave past the number kept (see src/lib/autosave.ts). Nothing else can be deleted.
#[tauri::command]
fn delete_save(app: AppHandle, name: String, place: String) -> Result<(), String> {
    let name = saves::clean_name(&name)
        .filter(|name| saves::is_autosave(name))
        .ok_or("Only old autosaves can be deleted.")?;
    remove_if_there(&saves_folder(&app, &place)?.join(&name)).map_err(|err| format!("Couldn't delete {name}: {err}"))
}

/// The game file the app was opened with ("Open with", or dropped on the exe), or that a second launch was
/// given, until the host page takes it. The page can only read this one file, not any path it likes.
static OPENED: Mutex<Option<PathBuf>> = Mutex::new(None);

/// Event for the host page: a second launch was given a game file to open (take_opened_file).
const OPEN_EVENT: &str = "open-file";

/// A launch argument that's a game file (relative to `cwd`).
fn game_file_arg(arg: &OsStr, cwd: &Path) -> Option<PathBuf> {
    let path = Path::new(arg);
    let name = path.file_name()?.to_str()?;
    saves::is_game(name).then(|| cwd.join(path)).filter(|p| p.is_file())
}

/// The first game file among the launch arguments (after the exe's own path).
fn opened_file_arg<I: IntoIterator<Item = S>, S: AsRef<OsStr>>(args: I, cwd: &Path) -> Option<PathBuf> {
    args.into_iter().skip(1).find_map(|arg| game_file_arg(arg.as_ref(), cwd))
}

/// Keep a file to open for the host page. Returns whether there was one.
fn note_opened_file<I: IntoIterator<Item = S>, S: AsRef<OsStr>>(args: I, cwd: &Path) -> bool {
    let Some(path) = opened_file_arg(args, cwd) else {
        return false;
    };
    *OPENED.lock().unwrap_or_else(|e| e.into_inner()) = Some(path);
    true
}

/// The name of the game file waiting to be opened, if any (take_opened_file reads it).
#[tauri::command]
fn opened_file() -> Option<String> {
    let opened = OPENED.lock().unwrap_or_else(|e| e.into_inner());
    opened.as_ref()?.file_name()?.to_str().map(str::to_string)
}

/// The waiting game file's bytes; it's no longer waiting afterwards.
#[tauri::command]
async fn take_opened_file() -> Result<tauri::ipc::Response, String> {
    let path = OPENED.lock().unwrap_or_else(|e| e.into_inner()).take().ok_or("No file to open.")?;
    off_main(move || {
        std::fs::read(&path)
            .map(tauri::ipc::Response::new)
            .map_err(|err| format!("Couldn't open {}: {err}", path.display()))
    })
    .await
}

/// The host page writes what's still pending (the last edits, the game in play) when the window is closed:
/// it says so at startup, and closes the window itself once that's done (close_app).
static PAGE_FLUSHES: AtomicBool = AtomicBool::new(false);
/// The host window's ✕ was clicked once: the page is writing; a second click closes at once.
static CLOSING: AtomicBool = AtomicBool::new(false);
/// Event for the host page: write what's pending, then call close_app.
const CLOSE_EVENT: &str = "close-requested";
/// How long the page gets for that before the window closes anyway (unless it says it's waiting for a save: hold_close).
const CLOSE_WAIT: Duration = Duration::from_secs(3);
/// Counts the clicks on ✕ the page was told about; the page holding the window open says which one it answered.
static CLOSE_ASKED: AtomicUsize = AtomicUsize::new(0);
static CLOSE_HELD: AtomicUsize = AtomicUsize::new(0);

#[tauri::command]
fn flush_on_close() {
    PAGE_FLUSHES.store(true, Ordering::SeqCst);
}

/// The host page has written what was pending: close the host window (which ends the app).
#[tauri::command]
fn close_app(app: AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.destroy();
    }
}

/// The page is writing a save and asks the host to wait (it calls close_app once it's done, or told to close
/// anyway): the window stays open past CLOSE_WAIT, and the next ✕ asks the page again.
#[tauri::command]
fn hold_close() {
    hold_this_close();
}

fn hold_this_close() {
    CLOSE_HELD.store(CLOSE_ASKED.load(Ordering::SeqCst), Ordering::SeqCst);
    CLOSING.store(false, Ordering::SeqCst);
}

/// Whether a click on the host window's ✕ waits for the page first (and tells it to write), or closes now.
/// Returns which click it is, for close_after_wait.
fn wait_for_page_on_close() -> Option<usize> {
    (PAGE_FLUSHES.load(Ordering::SeqCst) && !CLOSING.swap(true, Ordering::SeqCst))
        .then(|| CLOSE_ASKED.fetch_add(1, Ordering::SeqCst) + 1)
}

/// After CLOSE_WAIT: close the window, unless the page held it open since that click (a save is being written,
/// and the page answered: it's alive and closes the window itself).
fn close_after_wait(click: usize) -> bool {
    CLOSE_HELD.load(Ordering::SeqCst) != click
}

/// The project's own pages (ℹ About's links); `open_link` opens nothing else.
const REPO_URL: &str = "https://github.com/vampiricwulf/Brainrot-Game-Maker";

fn is_repo_link(url: &str) -> bool {
    url == REPO_URL
        || url
            .strip_prefix(REPO_URL)
            .is_some_and(|rest| rest.starts_with('/'))
}

/// Open one of the project's pages (source, releases, issues) in the default browser rather than
/// in an app window.
#[tauri::command]
fn open_link(url: String) -> Result<(), String> {
    if !is_repo_link(&url) {
        return Err("Only the project's own pages can be opened this way.".into());
    }
    #[cfg(windows)]
    let program = "explorer";
    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(all(unix, not(target_os = "macos")))]
    let program = "xdg-open";
    std::process::Command::new(program)
        .arg(&url)
        .spawn()
        .map(|_| ())
        .map_err(|err| format!("Couldn't open {url}: {err}"))
}

/// Whether this process runs elevated ("Run as administrator").
#[cfg(windows)]
fn is_elevated() -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::Security::{
        GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY,
    };
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
    // SAFETY: reads this process's own token into a correctly sized struct, then closes it.
    unsafe {
        let mut token: HANDLE = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return false;
        }
        let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
        let mut len = 0u32;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            (&mut elevation as *mut TOKEN_ELEVATION).cast(),
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut len,
        );
        CloseHandle(token);
        ok != 0 && elevation.TokenIsElevated != 0
    }
}

/// Why Discord and OBS may stream no game sound: WebView2 starts its processes outside this app
/// when it runs as administrator or with a compatibility setting (Windows sets __COMPAT_LAYER for
/// those), and per-app sound capture only follows the app's own processes.
fn capture_problem() -> Option<serde_json::Value> {
    #[cfg(windows)]
    {
        let elevated = is_elevated();
        let compat = std::env::var("__COMPAT_LAYER")
            .ok()
            .filter(|v| !v.trim().is_empty());
        if elevated || compat.is_some() {
            return Some(serde_json::json!({ "elevated": elevated, "compat": compat }));
        }
    }
    None
}

/// Facts the host page reads at startup (see src/lib/desktop.svelte.ts). `start`: how this run
/// started: its switches, and whether the fix is off for this run because WebView2 wouldn't start
/// with it this time (usually the previous copy's WebView2 processes were still closing; a restart
/// should bring it back) or because it crashed with it. `fix_saved`: the fix is switched on.
/// Switched off while the switches are the fix's: WebView2 wouldn't start without them this time.
fn page_flags(start: Start, fix_saved: bool) -> String {
    let mut js = format!("window.__JB_AUDIO_FIX = {fix_saved};");
    if start.failed {
        js.push_str("window.__JB_AUDIO_FIX_FAILED = true;");
    }
    if start.crashed {
        js.push_str("window.__JB_AUDIO_FIX_CRASHED = true;");
    }
    if let Some(args) = start.args {
        js.push_str(&format!(
            "window.__JB_BROWSER_ARGS = {};",
            serde_json::Value::from(args)
        ));
    }
    if let Some(problem) = capture_problem() {
        js.push_str(&format!("window.__JB_CAPTURE = {problem};"));
    }
    js
}

/// This build can update itself in place (it carries the key releases are signed with).
#[tauri::command]
fn can_self_update() -> bool {
    update::PUBLIC_KEY.is_some()
}

/// Download a release's .exe, check its signature, and put it in place of this one (update.rs). The page restarts the
/// app afterwards, once its game is saved.
#[tauri::command]
async fn install_update(exe_url: String, signature_url: String) -> Result<(), String> {
    update::install(&exe_url, &signature_url).await
}

/// Close the audience windows the page opened (Exit, Close audience window): a window opened through `window.open` may
/// not close from the page's side, and after a reload of the host page it no longer has a handle on it at all.
#[tauri::command]
fn close_audience(app: AppHandle) {
    for (label, window) in app.webview_windows() {
        if label.starts_with("popup-") && window.url().is_ok_and(|url| is_audience(&url)) {
            let _ = window.close();
        }
    }
}

/// Build a real app window for a `window.open` request from the page.
fn open_popup(
    app: &AppHandle,
    url: Url,
    features: NewWindowFeatures,
) -> NewWindowResponse<tauri::Wry> {
    let n = POPUPS.fetch_add(1, Ordering::SeqCst);
    let title = if is_audience(&url) {
        "Brainrot Games Maker · Audience".to_string()
    } else {
        url.to_string()
    };
    // Unlike the host window's, Tauri's drop handler stays on: nothing in these windows takes drops, so a file dropped
    // on the audience window by mistake is ignored instead of replacing the page on stream.
    let mut builder = WebviewWindowBuilder::new(
        app,
        format!("popup-{n}"),
        // Tauri doesn't navigate a webview whose URL is about:blank, and WebView2 needs the new window
        // un-navigated: it loads the requested URL into it itself once it's attached.
        WebviewUrl::External("about:blank".parse().expect("valid URL")),
    )
    .title(title)
    .inner_size(1280.0, 720.0)
    .min_inner_size(320.0, 180.0)
    .resizable(true)
    // Applies the requested size/position and, crucially, shares the opener's webview environment.
    .window_features(features)
    // Windows opened by the page can open windows too (e.g. "Open on YouTube" clicked in the audience window).
    .on_new_window({
        let app = app.clone();
        move |url, features| open_popup(&app, url, features)
    })
    .on_document_title_changed(|window, title| {
        if !title.trim().is_empty() {
            let _ = window.set_title(&title);
        }
    });
    if let Some(args) = ACTIVE_ARGS.get() {
        // The shared environment above already carries these; set them anyway so they can never differ.
        builder = builder.additional_browser_args(args);
    }
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone()).expect("window icon");
    }
    match builder.build() {
        Ok(window) => NewWindowResponse::Create { window },
        Err(err) => {
            eprintln!("could not open a window for {url}: {err}");
            NewWindowResponse::Deny
        }
    }
}

/// A native message box with the app's name as its title; returns the button clicked. Blocks until it's closed.
#[cfg(windows)]
fn native_box(text: &str, style: windows_sys::Win32::UI::WindowsAndMessaging::MESSAGEBOX_STYLE) -> i32 {
    use windows_sys::Win32::UI::WindowsAndMessaging::MessageBoxW;
    let wide = |text: &str| text.encode_utf16().chain([0]).collect::<Vec<u16>>();
    let (text, title) = (wide(text), wide("Brainrot Games Maker"));
    // SAFETY: both strings are NUL-terminated UTF-16 that outlive the call; no owner window.
    unsafe { MessageBoxW(std::ptr::null_mut(), text.as_ptr(), title.as_ptr(), style) }
}

/// A native message box, for what a windowed app can't otherwise say (its console output goes
/// nowhere). Blocks until it's closed.
#[cfg(windows)]
fn message_box(text: &str) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{MB_ICONERROR, MB_OK};
    native_box(text, MB_OK | MB_ICONERROR);
}

/// A Retry/Cancel message box; true = Retry.
#[cfg(windows)]
fn ask_retry(text: &str) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{IDRETRY, MB_ICONWARNING, MB_RETRYCANCEL};
    native_box(text, MB_RETRYCANCEL | MB_ICONWARNING) == IDRETRY
}

/// A message box on its own thread, for callers on the UI thread: its modal loop must not run
/// inside their event handler. `then` runs once it's closed.
#[cfg(windows)]
fn message_box_later(text: String, then: impl FnOnce() + Send + 'static) {
    std::thread::spawn(move || {
        message_box(&text);
        then();
    });
}

/// Windows is shutting down or signing out, which can end WebView2's processes before this exe.
#[cfg(windows)]
fn windows_shutting_down() -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_SHUTTINGDOWN};
    // SAFETY: reads one system metric; no pointers involved.
    unsafe { GetSystemMetrics(SM_SHUTTINGDOWN) != 0 }
}

/// With the fix on, the sound (and any audio software that hooks into it) runs inside WebView2's
/// browser process, so a crash there takes every window down: they go blank. Then note the crash
/// and restart: the next start leaves the fix off (plan_start) and the host page offers to try it
/// again.
#[cfg(windows)]
fn watch_for_crash(window: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_PROCESS_FAILED_KIND, COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED,
    };
    use webview2_com::ProcessFailedEventHandler;

    let app = window.app_handle().clone();
    // with_webview runs this on the UI thread that owns the webview, where WebView2's COM calls belong.
    let result = window.with_webview(move |webview| {
        let handler = ProcessFailedEventHandler::create(Box::new(move |_webview, args| {
            let Some(args) = args else { return Ok(()) };
            let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND::default();
            // SAFETY: `args` is the live event argument; the getter writes one value into `kind`.
            unsafe { args.ProcessFailedKind(&mut kind)? };
            // A crashed page or helper process only affects one window (WebView2 reports or recovers
            // it); the browser process exiting ends them all.
            if kind != COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED {
                return Ok(());
            }
            // Not a crash: Windows ends WebView2 along with everything else.
            if windows_shutting_down() {
                return Ok(());
            }
            eprintln!("WebView2's browser process exited with the Discord audio fix on");
            // Without the note, the next start would use the fix again and could crash the same way,
            // over and over: so no restart without it.
            let noted = settings_dir(&app)
                .ok_or_else(|| "no settings folder".to_string())
                .and_then(|dir| mark_crashed_in(&dir).map_err(|err| err.to_string()));
            match noted {
                Ok(()) => app.request_restart(),
                Err(why) => {
                    eprintln!("couldn't note the crash: {why}");
                    let app = app.clone();
                    message_box_later(
                        format!(
                            "Brainrot Games Maker's windows went blank: Microsoft Edge WebView2 stopped while the \
                             Discord audio fix was on, and Brainrot Games Maker couldn't note that to start without \
                             the fix next time.\n\n\
                             Brainrot Games Maker closes now. Open it again with --no-audio-fix at the end of a \
                             shortcut's Target, e.g. \"C:\\Users\\you\\Downloads\\brainrot-game-maker-portable.exe\" \
                             --no-audio-fix\n\n\
                             Details: {why}"
                        ),
                        move || app.exit(0),
                    );
                }
            }
            Ok(())
        }));
        let mut token = 0i64;
        // SAFETY: the controller is live (we're inside with_webview, on its thread); add_ProcessFailed
        // keeps its own reference to the handler, which lives as long as the webview.
        let added = unsafe {
            webview
                .controller()
                .CoreWebView2()
                .and_then(|core| core.add_ProcessFailed(&handler, &mut token))
        };
        if let Err(err) = added {
            eprintln!("couldn't watch WebView2 for crashes: {err}");
        }
    });
    if let Err(err) = result {
        eprintln!("couldn't watch WebView2 for crashes: {err}");
    }
}

/// The host window. `args`: WebView2 switches to use instead of wry's defaults. `page_script`: page_flags.
fn build_main(app: &AppHandle, args: Option<&'static str>, page_script: &str) -> tauri::Result<()> {
    let handle = app.clone();
    let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("Brainrot Games Maker")
        .inner_size(1400.0, 900.0)
        .min_inner_size(900.0, 600.0)
        // Shown once its webview exists, so a failed start (retried below) never flashes an empty window.
        .visible(false)
        // The page takes its own drops (files onto slides, tiles and the Media page, dragging layers): on Windows,
        // Tauri's handler would take every drop instead.
        .disable_drag_drop_handler()
        .initialization_script(page_script)
        .on_new_window(move |url, features| open_popup(&handle, url, features))
        // The game's title in the title bar (and the taskbar), as the page sets it.
        .on_document_title_changed(|window, title| {
            if !title.trim().is_empty() {
                let _ = window.set_title(&title);
            }
        });
    if let Some(args) = args {
        builder = builder.additional_browser_args(args);
    }
    let window = builder.build()?;
    if let Some(args) = args {
        let _ = ACTIVE_ARGS.set(args);
        #[cfg(windows)]
        watch_for_crash(&window);
    }
    // The window exists now: a failure here must not send the caller into another start.
    if let Err(err) = window.show() {
        eprintln!("couldn't show the main window: {err}");
    }
    Ok(())
}

/// Open the host window. WebView2 only starts with other switches than the ones its running
/// processes use once those have quit, and right after a restart the old copy's may still hold the
/// data folder. So each start is retried, then alternates with the other set of switches
/// (Plan::attempt): neither the fix nor turning it off may keep the app from starting.
fn start_main(app: &AppHandle, plan: &Plan) -> tauri::Result<()> {
    // The page is always told about the switches the attempt that worked used.
    let build = |start: Start| build_main(app, start.args, &page_flags(start, plan.fix_saved));
    // Without the WebView2 runtime every attempt fails, and Tauri says so in a message box each
    // time: one attempt, so there's one message.
    if tauri::webview_version().is_err() {
        return build(plan.wanted());
    }
    // Every error is retried, not only the data-folder conflict: its error code isn't documented
    // for every WebView2 version, and nothing else shows a message on the way.
    let (mut start, mut n) = (plan.wanted(), 0);
    loop {
        let Err(err) = build(start) else {
            return Ok(());
        };
        n += 1;
        let Some(next) = plan.attempt(n) else {
            tell_start_failed(&err);
            return Err(err);
        };
        if next.args == start.args {
            eprintln!("main window didn't start ({err}), trying again");
        } else {
            let with = if next.args.is_some() {
                "with"
            } else {
                "without"
            };
            eprintln!("main window didn't start ({err}), trying {with} the Discord audio fix");
        }
        start = next;
        std::thread::sleep(RETRY_DELAY);
    }
}

/// Last resort when the host window won't open at all: a windowed app's error is otherwise silent.
fn tell_start_failed(err: &tauri::Error) {
    eprintln!("the main window didn't start: {err}");
    #[cfg(windows)]
    message_box(&format!(
        "Brainrot Games Maker couldn't open its window: Microsoft Edge WebView2 didn't start.\n\n\
         Wait a few seconds and open Brainrot Games Maker again. If it still won't open, restart your PC.\n\n\
         Details: {err}"
    ));
}

/// A second launch with --no-audio-fix, e.g. because this copy's windows are blank: save the fix as
/// off, tell the host page, and if this copy runs with the fix's switches, restart it without them.
fn fix_off_from_second_launch(app: &AppHandle) {
    let saved = settings_dir(app)
        .ok_or_else(|| "no settings folder".to_string())
        .and_then(|dir| save_fix_in(&dir, false).map_err(|err| err.to_string()));
    if let Err(why) = saved {
        eprintln!("couldn't save the Discord audio fix as off: {why}");
        // A restart would start with the fix again. A copy started with the switch runs without it.
        #[cfg(windows)]
        message_box_later(
            format!(
                "Brainrot Games Maker couldn't switch the Discord audio fix off.\n\n\
                 Close Brainrot Games Maker (end it in Task Manager if its window is blank), then open it \
                 again with --no-audio-fix.\n\n\
                 Details: {why}"
            ),
            || {},
        );
        return;
    }
    let restart = ACTIVE_ARGS.get().is_some();
    // So the page's Sound help and warnings match the saved setting.
    if let Err(err) = app.emit_to("main", FIX_OFF_EVENT, restart) {
        eprintln!("couldn't tell the page the Discord audio fix is off: {err}");
    }
    if restart {
        let app = app.clone();
        // Its own thread: this runs on the UI thread, which must keep going meanwhile.
        std::thread::spawn(move || {
            // Like the page's own restart: the last autosave gets written first.
            std::thread::sleep(AUTOSAVE_WAIT);
            app.request_restart();
        });
    }
}

fn main() {
    // A restart relaunches the app with the command line in this Env (Tauri keeps the first one it's
    // given): without --no-audio-fix, so that ticking the fix again in a copy started with that
    // switch isn't undone by the restart.
    // A game file it was opened with is opened once, not again after a restart.
    let cwd = std::env::current_dir().unwrap_or_default();
    note_opened_file(std::env::args_os(), &cwd);
    let mut env = tauri::Env::default();
    env.args_os.retain(|arg| !is_no_fix_switch(arg) && game_file_arg(arg, &cwd).is_none());
    tauri::Builder::default()
        // First, so a second launch hands over to the running app before anything else starts.
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            if has_no_fix_switch(&args) {
                fix_off_from_second_launch(app);
            }
            if note_opened_file(&args, Path::new(&cwd)) {
                if let Err(err) = app.emit_to("main", OPEN_EVENT, ()) {
                    eprintln!("couldn't tell the page to open a file: {err}");
                }
            }
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.unminimize();
                let _ = main.set_focus();
            }
        }))
        .manage(env)
        // Downloads online media links into the game natively (the page's own fetch is limited by
        // CORS). What it may reach is set in capabilities/http.json.
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            set_audio_fix,
            restart_app,
            retry_audio_fix,
            data_folders,
            open_data_folder,
            open_link,
            save_file,
            list_saves,
            read_save,
            delete_save,
            opened_file,
            take_opened_file,
            flush_on_close,
            close_app,
            hold_close,
            close_audience,
            can_self_update,
            install_update
        ])
        .setup(|app| {
            update::clean_up_after_update();
            let handle = app.handle();
            move_old_data(handle);
            let plan = plan_start(
                settings_dir(handle).as_deref(),
                has_no_fix_switch(std::env::args_os()),
            );
            start_main(handle, &plan)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            match event {
                // The page writes its last edits first (it closes the window itself), within CLOSE_WAIT.
                WindowEvent::CloseRequested { api, .. } => {
                    let Some(click) = wait_for_page_on_close() else {
                        return;
                    };
                    api.prevent_close();
                    if let Err(err) = window.emit_to("main", CLOSE_EVENT, ()) {
                        eprintln!("couldn't tell the page the window is closing: {err}");
                    }
                    let window = window.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(CLOSE_WAIT);
                        if close_after_wait(click) {
                            let _ = window.destroy();
                        }
                    });
                }
                // Closing the host window ends the app, even if the audience window is still open.
                WindowEvent::Destroyed => window.app_handle().exit(0),
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Brainrot Games Maker");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// An empty folder under the system temp folder, removed afterwards.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new(test: &str) -> Self {
            let dir =
                std::env::temp_dir().join(format!("jb-audio-fix-{test}-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).expect("temp folder");
            Self(dir)
        }

        fn touch(&self, name: &str) {
            std::fs::write(self.0.join(name), b"").expect("write test file");
        }

        fn has(&self, name: &str) -> bool {
            self.0.join(name).exists()
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn closing_while_a_save_is_written_waits_for_it() {
        // (The only test that touches these.)
        PAGE_FLUSHES.store(true, Ordering::SeqCst);
        let first = wait_for_page_on_close().expect("the page is told first");
        // A second click before the page answers closes at once.
        assert_eq!(wait_for_page_on_close(), None);
        // The page answers that a save is being written: the window stays open past CLOSE_WAIT…
        hold_this_close();
        assert!(!close_after_wait(first));
        // …and the next click tells the page again, closing after CLOSE_WAIT if it doesn't answer this time.
        let second = wait_for_page_on_close().expect("the page is told again");
        assert!(close_after_wait(second));
        hold_this_close();
        assert!(!close_after_wait(second));
    }

    #[test]
    fn a_game_file_given_at_launch_is_found() {
        let dir = TempDir::new("opened");
        dir.touch("Quiz.brainrot");
        dir.touch("Show.HTML");
        dir.touch("notes.txt");
        let exe = "C:\\Apps\\brainrot.exe";
        // "Open with" passes the full path; a shortcut or a terminal may pass one relative to its folder.
        let full = dir.0.join("Quiz.brainrot");
        assert_eq!(opened_file_arg([exe.as_ref(), full.as_os_str()], Path::new("/elsewhere")), Some(full.clone()));
        assert_eq!(opened_file_arg([exe, "--no-audio-fix", "Quiz.brainrot"], &dir.0), Some(full));
        assert_eq!(opened_file_arg([exe, "Show.HTML"], &dir.0), Some(dir.0.join("Show.HTML")));
        // Not a game, missing, or only the exe itself.
        assert_eq!(opened_file_arg([exe, "notes.txt"], &dir.0), None);
        assert_eq!(opened_file_arg([exe, "Gone.brainrot"], &dir.0), None);
        assert_eq!(opened_file_arg([dir.0.join("Quiz.brainrot")], &dir.0), None);
        assert!(game_file_arg(OsStr::new("--no-audio-fix"), &dir.0).is_none());
    }

    #[test]
    fn open_link_only_opens_the_projects_pages() {
        assert!(is_repo_link(REPO_URL));
        assert!(is_repo_link(&format!("{REPO_URL}/releases/latest")));
        assert!(is_repo_link(&format!("{REPO_URL}/issues")));
        assert!(!is_repo_link(&format!("{REPO_URL}.evil.example/x")));
        assert!(!is_repo_link(&format!("{REPO_URL}-fork")));
        assert!(!is_repo_link("https://example.com/"));
        assert!(!is_repo_link("file:///C:/Windows/System32/calc.exe"));
    }

    #[test]
    fn the_fix_is_on_by_default() {
        let dir = TempDir::new("default");
        assert!(fix_wanted_in(&dir.0));
        // A settings folder that doesn't exist yet (first start).
        assert!(fix_wanted_in(&dir.0.join("missing")));
    }

    #[test]
    fn the_off_file_turns_it_off() {
        let dir = TempDir::new("off");
        dir.touch("discord-audio-fix-off");
        assert!(!fix_wanted_in(&dir.0));
    }

    #[test]
    fn an_off_file_made_in_explorer_turns_it_off() {
        // New › Text Document, renamed with extensions hidden.
        let dir = TempDir::new("off-txt");
        dir.touch("discord-audio-fix-off.txt");
        assert!(!fix_wanted_in(&dir.0));
    }

    #[test]
    fn saving_off_then_on() {
        let dir = TempDir::new("save");
        let folder = dir.0.join("com.brainrotgames.maker");
        save_fix_in(&folder, false).expect("save off");
        assert!(
            !fix_wanted_in(&folder),
            "off, in a folder that didn't exist yet"
        );
        std::fs::write(folder.join("discord-audio-fix-off.txt"), b"").unwrap();
        save_fix_in(&folder, true).expect("save on");
        assert!(fix_wanted_in(&folder), "on again");
        assert!(!folder.join("discord-audio-fix-off").exists());
        assert!(!folder.join("discord-audio-fix-off.txt").exists());
        save_fix_in(&folder, true).expect("saving on twice is fine");
        save_fix_in(&dir.0.join("missing"), true).expect("on, with no settings folder yet");
    }

    #[test]
    fn the_old_opt_in_file_is_ignored_and_removed() {
        let dir = TempDir::new("legacy");
        dir.touch("discord-audio-fix");
        assert!(fix_wanted_in(&dir.0));
        dir.touch("discord-audio-fix-off");
        assert!(!fix_wanted_in(&dir.0), "the off file still wins");
        drop_legacy_flag_in(&dir.0);
        assert!(!dir.has("discord-audio-fix"));
        drop_legacy_flag_in(&dir.0);
        assert!(dir.has("discord-audio-fix-off"), "only the old file goes");
    }

    #[test]
    fn crash_marker() {
        let dir = TempDir::new("crash");
        assert!(!crashed_in(&dir.0));
        let folder = dir.0.join("com.brainrotgames.maker");
        mark_crashed_in(&folder).expect("mark");
        assert!(crashed_in(&folder));
        assert!(
            fix_wanted_in(&folder),
            "a crash leaves the saved setting alone"
        );
        clear_crashed_in(&folder).expect("clear");
        assert!(!crashed_in(&folder));
        clear_crashed_in(&folder).expect("clearing twice is fine");
    }

    /// The fix switched on (the default), switched off, and switched on or off after a crash with it.
    const FIX_ON: Plan = Plan {
        fix_saved: true,
        crash_noted: false,
    };
    const FIX_OFF: Plan = Plan {
        fix_saved: false,
        crash_noted: false,
    };
    const CRASHED: Plan = Plan {
        fix_saved: true,
        crash_noted: true,
    };
    const OFF_AFTER_A_CRASH: Plan = Plan {
        fix_saved: false,
        crash_noted: true,
    };

    /// Starting with the fix's switches, or with wry's defaults.
    const WITH: Start = Start {
        args: Some(AUDIO_FIX_ARGS),
        failed: false,
        crashed: false,
    };
    const WITHOUT: Start = Start {
        args: None,
        failed: false,
        crashed: false,
    };

    #[test]
    fn plan_by_default() {
        let dir = TempDir::new("plan-default");
        dir.touch("discord-audio-fix");
        let plan = plan_start(Some(&dir.0), false);
        assert_eq!(plan, FIX_ON);
        assert_eq!(plan.wanted(), WITH);
        assert!(
            !dir.has("discord-audio-fix"),
            "the old opt-in file is removed"
        );
        assert_eq!(plan_start(None, false), FIX_ON);
    }

    #[test]
    fn plan_after_a_crash() {
        let dir = TempDir::new("plan-crash");
        dir.touch("discord-audio-fix-crashed");
        let plan = plan_start(Some(&dir.0), false);
        assert_eq!(plan, CRASHED);
        assert_eq!(
            plan.wanted(),
            Start {
                crashed: true,
                ..WITHOUT
            },
            "starts without the fix, and the page is told why"
        );
        assert!(
            dir.has("discord-audio-fix-crashed"),
            "until the host tries again"
        );
        // Switched off, the page isn't told about the crash, but the note still counts.
        dir.touch("discord-audio-fix-off");
        let plan = plan_start(Some(&dir.0), false);
        assert_eq!(plan, OFF_AFTER_A_CRASH);
        assert_eq!(plan.wanted(), WITHOUT);
    }

    #[test]
    fn plan_with_the_no_fix_switch() {
        let dir = TempDir::new("plan-switch");
        assert_eq!(plan_start(Some(&dir.0), true), FIX_OFF);
        assert!(
            dir.has("discord-audio-fix-off"),
            "it's saved, so the next normal start is without it too"
        );
        assert_eq!(plan_start(Some(&dir.0), false), FIX_OFF);
        assert_eq!(plan_start(None, true), FIX_OFF);
    }

    #[test]
    fn fallback_with_the_fix_on() {
        // Switched on but started without it: the page says it didn't start this time.
        assert_eq!(
            FIX_ON.fallback(),
            Some(Start {
                failed: true,
                ..WITHOUT
            })
        );
    }

    #[test]
    fn fallback_with_the_fix_off() {
        // Switched off but started with it: the page offers the restart that turns it off.
        assert_eq!(FIX_OFF.fallback(), Some(WITH));
    }

    #[test]
    fn no_fallback_to_switches_that_crashed() {
        // They'd watch for crashes again: another crash, another restart, over and over.
        assert_eq!(CRASHED.fallback(), None);
        assert_eq!(OFF_AFTER_A_CRASH.fallback(), None);
    }

    #[test]
    fn attempts() {
        for plan in [FIX_ON, FIX_OFF, CRASHED, OFF_AFTER_A_CRASH] {
            let starts: Vec<Start> = (0..).map_while(|n| plan.attempt(n)).collect();
            assert_eq!(
                starts.len(),
                (START_TRIES + MORE_TRIES) as usize,
                "{plan:?}"
            );
            let (first, more) = starts.split_at(START_TRIES as usize);
            assert!(
                first.iter().all(|start| *start == plan.wanted()),
                "{plan:?}: the wanted switches first"
            );
            match plan.fallback() {
                Some(other) => {
                    assert_ne!(other.args, plan.wanted().args, "{plan:?}");
                    // Then both sets in turn, the other one first.
                    for (i, start) in more.iter().enumerate() {
                        let expected = if i % 2 == 0 { other } else { plan.wanted() };
                        assert_eq!(*start, expected, "{plan:?}: attempt {}", first.len() + i);
                    }
                }
                None => assert!(
                    more.iter().all(|start| *start == plan.wanted()),
                    "{plan:?}: only the wanted switches"
                ),
            }
        }
    }

    #[test]
    fn no_attempt_uses_switches_that_crashed() {
        for plan in [CRASHED, OFF_AFTER_A_CRASH] {
            assert!(
                (0..)
                    .map_while(|n| plan.attempt(n))
                    .all(|start| start.args.is_none()),
                "{plan:?}"
            );
        }
    }

    #[test]
    fn the_no_fix_switch() {
        assert!(has_no_fix_switch(["app.exe", "--no-audio-fix"]));
        assert!(has_no_fix_switch(["app.exe", "--No-Audio-Fix"]));
        assert!(!has_no_fix_switch(["app.exe"]));
        assert!(!has_no_fix_switch(["app.exe", "--no-audio-fix-please"]));
        let args = vec!["C:\\app.exe".to_string(), "--no-audio-fix".to_string()];
        assert!(
            has_no_fix_switch(&args),
            "the single-instance callback's args"
        );
    }

    #[test]
    fn page_flags_without_the_fix() {
        let js = page_flags(FIX_OFF.wanted(), false);
        assert!(js.contains("window.__JB_AUDIO_FIX = false;"));
        assert!(!js.contains("__JB_AUDIO_FIX_FAILED"));
        assert!(!js.contains("__JB_AUDIO_FIX_CRASHED"));
        // No switches: every window keeps wry's defaults.
        assert!(!js.contains("__JB_BROWSER_ARGS"));
    }

    #[test]
    fn page_flags_with_the_fix() {
        // The default.
        let js = page_flags(FIX_ON.wanted(), true);
        assert!(js.contains("window.__JB_AUDIO_FIX = true;"));
        assert!(js.contains(&format!("window.__JB_BROWSER_ARGS = \"{AUDIO_FIX_ARGS}\";")));
        assert!(!js.contains("__JB_AUDIO_FIX_FAILED"));
        assert!(!js.contains("__JB_AUDIO_FIX_CRASHED"));
    }

    #[test]
    fn page_flags_switched_off_but_started_with_the_fix() {
        // WebView2 wouldn't start without the switches this time: the page offers the restart that turns it off.
        let js = page_flags(FIX_OFF.fallback().expect("a fallback"), false);
        assert!(js.contains("window.__JB_AUDIO_FIX = false;"));
        assert!(js.contains(&format!("window.__JB_BROWSER_ARGS = \"{AUDIO_FIX_ARGS}\";")));
        assert!(!js.contains("__JB_AUDIO_FIX_FAILED"));
        assert!(!js.contains("__JB_AUDIO_FIX_CRASHED"));
    }

    #[test]
    fn page_flags_when_the_fix_did_not_start() {
        // Switched on, but this run started without the switches: the page says so and offers a restart.
        let js = page_flags(FIX_ON.fallback().expect("a fallback"), true);
        assert!(js.contains("window.__JB_AUDIO_FIX = true;"));
        assert!(js.contains("window.__JB_AUDIO_FIX_FAILED = true;"));
        assert!(!js.contains("__JB_AUDIO_FIX_CRASHED"));
        assert!(!js.contains("__JB_BROWSER_ARGS"));
    }

    #[test]
    fn page_flags_after_a_crash() {
        // Switched on, but WebView2 crashed with it: this run is without it, and the page offers to try again.
        let js = page_flags(CRASHED.wanted(), true);
        assert!(js.contains("window.__JB_AUDIO_FIX = true;"));
        assert!(js.contains("window.__JB_AUDIO_FIX_CRASHED = true;"));
        assert!(!js.contains("__JB_AUDIO_FIX_FAILED"));
        assert!(!js.contains("__JB_BROWSER_ARGS"));
        // Switched off after the crash: nothing to report.
        let js = page_flags(OFF_AFTER_A_CRASH.wanted(), false);
        assert!(js.contains("window.__JB_AUDIO_FIX = false;"));
        assert!(!js.contains("__JB_AUDIO_FIX_CRASHED"));
    }

    #[test]
    fn page_flags_every_combination() {
        for args in [None, Some(AUDIO_FIX_ARGS)] {
            for saved in [false, true] {
                for failed in [false, true] {
                    for crashed in [false, true] {
                        let start = Start {
                            args,
                            failed,
                            crashed,
                        };
                        let js = page_flags(start, saved);
                        let case = format!("{start:?} {saved}: {js}");
                        assert!(
                            js.contains(&format!("window.__JB_AUDIO_FIX = {saved};")),
                            "{case}"
                        );
                        assert_eq!(
                            js.contains("window.__JB_AUDIO_FIX_FAILED = true;"),
                            failed,
                            "{case}"
                        );
                        assert_eq!(
                            js.contains("window.__JB_AUDIO_FIX_CRASHED = true;"),
                            crashed,
                            "{case}"
                        );
                        assert_eq!(
                            js.contains("window.__JB_BROWSER_ARGS = "),
                            args.is_some(),
                            "{case}"
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn audio_fix_args_keep_one_disable_features_switch() {
        // A second --disable-features would replace the first, dropping wry's defaults.
        assert_eq!(AUDIO_FIX_ARGS.matches("--disable-features=").count(), 1);
        for feature in [
            "msWebOOUI",
            "msPdfOOUI",
            "msSmartScreenProtection",
            "AudioServiceOutOfProcess",
        ] {
            assert!(AUDIO_FIX_ARGS.contains(feature), "{feature} missing");
        }
        assert!(AUDIO_FIX_ARGS.contains("--autoplay-policy=no-user-gesture-required"));
    }
}
