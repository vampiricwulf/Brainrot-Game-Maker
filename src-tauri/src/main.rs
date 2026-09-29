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
// - a start that WebView2 refuses with one set of switches falls back to the other (start_main);
// - if WebView2's browser process crashes with the fix on, the app restarts without it and the
//   host page offers to try it again (watch_for_crash);
// - it can be switched off from outside the app: an empty `discord-audio-fix-off` file in the
//   settings folder, or starting the app with --no-audio-fix (see README.md).

// Hides the console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::ffi::OsStr;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::OnceLock;
use std::time::Duration;

use tauri::webview::{NewWindowFeatures, NewWindowResponse};
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};

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

/// In the app's settings folder (%APPDATA%\com.jeopardybuilder.brainrot on Windows), the fix is on
/// unless one of these (empty) files exists. The .txt is what Explorer's New › Text Document makes
/// when file extensions are hidden.
const FIX_OFF_FILES: [&str; 2] = ["discord-audio-fix-off", "discord-audio-fix-off.txt"];

/// The file that turned the fix on while it was opt-in (it's on by default now).
const LEGACY_FIX_ON_FILE: &str = "discord-audio-fix";

/// Written when WebView2's browser process dies with the fix on. Until the host tries the fix
/// again, the app starts without it; the saved setting itself is left alone.
const FIX_CRASHED_FILE: &str = "discord-audio-fix-crashed";

/// Attempts at starting the host window with the wanted switches before trying the other ones,
/// RETRY_DELAY apart (about 4 s): right after a restart, the old copy's WebView2 processes can
/// still hold the data folder with the old switches.
const START_TRIES: u32 = 17;
const RETRY_DELAY: Duration = Duration::from_millis(250);

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
    /// It's switched on, but WebView2 crashed with it: this run starts without it.
    crashed: bool,
}

impl Plan {
    /// The switches to start with (None: wry's defaults).
    fn args(&self) -> Option<&'static str> {
        (self.fix_saved && !self.crashed).then_some(AUDIO_FIX_ARGS)
    }
}

/// `dir`: the settings folder (None if it can't be found). `no_fix_switch`: started with --no-audio-fix,
/// which turns the fix off for good (it's saved), like unticking it in the app.
fn plan_start(dir: Option<&Path>, no_fix_switch: bool) -> Plan {
    let Some(dir) = dir else {
        return Plan {
            fix_saved: !no_fix_switch,
            crashed: false,
        };
    };
    drop_legacy_flag_in(dir);
    if no_fix_switch {
        if let Err(err) = save_fix_in(dir, false) {
            eprintln!("couldn't save the Discord audio fix as off: {err}");
        }
    }
    let fix_saved = !no_fix_switch && fix_wanted_in(dir);
    Plan {
        fix_saved,
        crashed: fix_saved && crashed_in(dir),
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

/// Facts the host page reads at startup (see src/lib/desktop.svelte.ts). `args`: the switches this
/// run uses. `fix_saved`: the fix is switched on. `fix_failed`: it's switched on, but WebView2
/// wouldn't start with it this time (usually the previous copy's WebView2 processes were still
/// closing), so this run is without it and a restart should bring it back. `fix_crashed`: it's
/// switched on, but this run is without it because WebView2 crashed with it last time.
/// Switched off while `args` are the fix's: WebView2 wouldn't start without them this time.
fn page_flags(args: Option<&str>, fix_saved: bool, fix_failed: bool, fix_crashed: bool) -> String {
    let mut js = format!("window.__JB_AUDIO_FIX = {fix_saved};");
    if fix_failed {
        js.push_str("window.__JB_AUDIO_FIX_FAILED = true;");
    }
    if fix_crashed {
        js.push_str("window.__JB_AUDIO_FIX_CRASHED = true;");
    }
    if let Some(args) = args {
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

/// Build a real app window for a `window.open` request from the page.
fn open_popup(
    app: &AppHandle,
    url: Url,
    features: NewWindowFeatures,
) -> NewWindowResponse<tauri::Wry> {
    let n = POPUPS.fetch_add(1, Ordering::SeqCst);
    let title = if is_audience(&url) {
        "Jeopardy Builder · Audience".to_string()
    } else {
        url.to_string()
    };
    let mut builder = WebviewWindowBuilder::new(
        app,
        format!("popup-{n}"),
        // Tauri doesn't navigate a webview whose URL is about:blank, and WebView2 needs the new window
        // un-navigated: it loads the requested URL into it itself once it's attached.
        WebviewUrl::External("about:blank".parse().expect("valid URL")),
    )
    .title(title)
    .inner_size(1280.0, 760.0)
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
            eprintln!("WebView2's browser process exited with the Discord audio fix on");
            // Without the note, the next start would use the fix again and could crash the same way.
            match settings_dir(&app).map(|dir| mark_crashed_in(&dir)) {
                Some(Ok(())) => app.request_restart(),
                Some(Err(err)) => eprintln!("couldn't note the crash: {err}"),
                None => eprintln!("couldn't note the crash: no settings folder"),
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
        .title("Jeopardy Builder")
        .inner_size(1400.0, 900.0)
        .min_inner_size(900.0, 600.0)
        // Shown once its webview exists, so a failed start (retried below) never flashes an empty window.
        .visible(false)
        .initialization_script(page_script)
        .on_new_window(move |url, features| open_popup(&handle, url, features));
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
/// data folder. So each start is retried, then falls back to the other set of switches: neither the
/// fix nor turning it off may keep the app from starting.
fn start_main(app: &AppHandle, plan: &Plan) -> tauri::Result<()> {
    let first = plan.args();
    let script = page_flags(first, plan.fix_saved, false, plan.crashed);
    // Without the WebView2 runtime every attempt fails, and Tauri says so in a message box each
    // time: one attempt, so there's one message.
    if tauri::webview_version().is_err() {
        return build_main(app, first, &script);
    }
    // Every error is retried, not only the data-folder conflict: its error code isn't documented
    // for every WebView2 version, and nothing else shows a message on the way.
    let mut attempt = 1;
    let err = loop {
        match build_main(app, first, &script) {
            Ok(()) => return Ok(()),
            Err(err) if attempt < START_TRIES => {
                eprintln!("main window didn't start ({err}), trying again");
                attempt += 1;
                std::thread::sleep(RETRY_DELAY);
            }
            Err(err) => break err,
        }
    };
    let other = match first {
        Some(_) => None,
        None => Some(AUDIO_FIX_ARGS),
    };
    let with = if other.is_some() { "with" } else { "without" };
    eprintln!("starting {with} the Discord audio fix: {err}");
    // Switched on but started without it: the page says so and offers a restart. Switched off but
    // started with it: the page offers the restart that turns it off.
    let script = page_flags(other, plan.fix_saved, first.is_some(), false);
    build_main(app, other, &script).inspect_err(tell_start_failed)
}

/// Last resort when the host window won't open at all: a windowed app's error is otherwise silent.
fn tell_start_failed(err: &tauri::Error) {
    eprintln!("the main window didn't start: {err}");
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};
        let wide = |text: &str| text.encode_utf16().chain([0]).collect::<Vec<u16>>();
        let text = wide(&format!(
            "Jeopardy Builder couldn't open its window: Microsoft Edge WebView2 didn't start.\n\n\
             Wait a few seconds and open Jeopardy Builder again. If it still won't open, restart your PC.\n\n\
             Details: {err}"
        ));
        let title = wide("Jeopardy Builder");
        // SAFETY: both strings are NUL-terminated UTF-16 that outlive the call; no owner window.
        unsafe {
            MessageBoxW(
                std::ptr::null_mut(),
                text.as_ptr(),
                title.as_ptr(),
                MB_OK | MB_ICONERROR,
            );
        }
    }
}

fn main() {
    // A restart relaunches the app with the command line in this Env (Tauri keeps the first one it's
    // given): without --no-audio-fix, so that ticking the fix again in a copy started with that
    // switch isn't undone by the restart.
    let mut env = tauri::Env::default();
    env.args_os.retain(|arg| !is_no_fix_switch(arg));
    tauri::Builder::default()
        // First, so a second launch hands over to the running app before anything else starts.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Started again with --no-audio-fix, e.g. because the running copy's windows are blank:
            // turn the fix off and restart that copy without it.
            if has_no_fix_switch(&args) {
                match settings_dir(app).map(|dir| save_fix_in(&dir, false)) {
                    Some(Ok(())) if ACTIVE_ARGS.get().is_some() => {
                        app.request_restart();
                        return;
                    }
                    Some(Ok(())) => {}
                    Some(Err(err)) => {
                        eprintln!("couldn't save the Discord audio fix as off: {err}")
                    }
                    None => {
                        eprintln!("couldn't save the Discord audio fix as off: no settings folder")
                    }
                }
            }
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.unminimize();
                let _ = main.set_focus();
            }
        }))
        .manage(env)
        .invoke_handler(tauri::generate_handler![
            set_audio_fix,
            restart_app,
            retry_audio_fix
        ])
        .setup(|app| {
            let handle = app.handle();
            let plan = plan_start(
                settings_dir(handle).as_deref(),
                has_no_fix_switch(std::env::args_os()),
            );
            start_main(handle, &plan)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the host window ends the app, even if the audience window is still open.
            if window.label() == "main" {
                if let WindowEvent::Destroyed = event {
                    window.app_handle().exit(0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Jeopardy Builder");
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
        let folder = dir.0.join("com.jeopardybuilder.brainrot");
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
        let folder = dir.0.join("com.jeopardybuilder.brainrot");
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

    #[test]
    fn plan_by_default() {
        let dir = TempDir::new("plan-default");
        dir.touch("discord-audio-fix");
        let plan = plan_start(Some(&dir.0), false);
        assert_eq!(
            plan,
            Plan {
                fix_saved: true,
                crashed: false
            }
        );
        assert_eq!(plan.args(), Some(AUDIO_FIX_ARGS));
        assert!(
            !dir.has("discord-audio-fix"),
            "the old opt-in file is removed"
        );
        assert_eq!(plan_start(None, false).args(), Some(AUDIO_FIX_ARGS));
    }

    #[test]
    fn plan_after_a_crash() {
        let dir = TempDir::new("plan-crash");
        dir.touch("discord-audio-fix-crashed");
        let plan = plan_start(Some(&dir.0), false);
        assert_eq!(
            plan,
            Plan {
                fix_saved: true,
                crashed: true
            }
        );
        assert_eq!(plan.args(), None, "starts without the fix");
        assert!(
            dir.has("discord-audio-fix-crashed"),
            "until the host tries again"
        );
        // Switched off, the crash doesn't matter.
        dir.touch("discord-audio-fix-off");
        assert_eq!(
            plan_start(Some(&dir.0), false),
            Plan {
                fix_saved: false,
                crashed: false
            }
        );
    }

    #[test]
    fn plan_with_the_no_fix_switch() {
        let dir = TempDir::new("plan-switch");
        let plan = plan_start(Some(&dir.0), true);
        assert_eq!(plan.args(), None);
        assert!(!plan.fix_saved && !plan.crashed);
        assert!(
            dir.has("discord-audio-fix-off"),
            "it's saved, so the next normal start is without it too"
        );
        assert_eq!(plan_start(Some(&dir.0), false).args(), None);
        assert_eq!(plan_start(None, true).args(), None);
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
        let js = page_flags(None, false, false, false);
        assert!(js.contains("window.__JB_AUDIO_FIX = false;"));
        assert!(!js.contains("__JB_AUDIO_FIX_FAILED"));
        assert!(!js.contains("__JB_AUDIO_FIX_CRASHED"));
        // No switches: every window keeps wry's defaults.
        assert!(!js.contains("__JB_BROWSER_ARGS"));
    }

    #[test]
    fn page_flags_with_the_fix() {
        // The default.
        let js = page_flags(Some(AUDIO_FIX_ARGS), true, false, false);
        assert!(js.contains("window.__JB_AUDIO_FIX = true;"));
        assert!(js.contains(&format!("window.__JB_BROWSER_ARGS = \"{AUDIO_FIX_ARGS}\";")));
        assert!(!js.contains("__JB_AUDIO_FIX_FAILED"));
        assert!(!js.contains("__JB_AUDIO_FIX_CRASHED"));
    }

    #[test]
    fn page_flags_switched_off_but_started_with_the_fix() {
        // WebView2 wouldn't start without the switches this time: the page offers the restart that turns it off.
        let js = page_flags(Some(AUDIO_FIX_ARGS), false, false, false);
        assert!(js.contains("window.__JB_AUDIO_FIX = false;"));
        assert!(js.contains(&format!("window.__JB_BROWSER_ARGS = \"{AUDIO_FIX_ARGS}\";")));
        assert!(!js.contains("__JB_AUDIO_FIX_FAILED"));
    }

    #[test]
    fn page_flags_when_the_fix_did_not_start() {
        // Switched on, but this run started without the switches: the page says so and offers a restart.
        let js = page_flags(None, true, true, false);
        assert!(js.contains("window.__JB_AUDIO_FIX = true;"));
        assert!(js.contains("window.__JB_AUDIO_FIX_FAILED = true;"));
        assert!(!js.contains("__JB_AUDIO_FIX_CRASHED"));
        assert!(!js.contains("__JB_BROWSER_ARGS"));
    }

    #[test]
    fn page_flags_after_a_crash() {
        // Switched on, but WebView2 crashed with it: this run is without it, and the page offers to try again.
        let js = page_flags(None, true, false, true);
        assert!(js.contains("window.__JB_AUDIO_FIX = true;"));
        assert!(js.contains("window.__JB_AUDIO_FIX_CRASHED = true;"));
        assert!(!js.contains("__JB_AUDIO_FIX_FAILED"));
        assert!(!js.contains("__JB_BROWSER_ARGS"));
    }

    #[test]
    fn page_flags_every_combination() {
        for args in [None, Some(AUDIO_FIX_ARGS)] {
            for saved in [false, true] {
                for failed in [false, true] {
                    for crashed in [false, true] {
                        let js = page_flags(args, saved, failed, crashed);
                        let case = format!("{args:?} {saved} {failed} {crashed}: {js}");
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
