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
// - an opt-in, experimental "Discord audio fix" plays the sound in WebView2's main process.

// Hides the console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
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

fn is_audience(url: &Url) -> bool {
    url.fragment() == Some("audience")
}

/// The Discord audio fix is on while this (empty) file exists in the app's settings folder.
fn audio_fix_flag(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join("discord-audio-fix"))
}

/// Turn the Discord audio fix on or off. It takes effect at the next start.
#[tauri::command]
fn set_audio_fix(app: AppHandle, on: bool) -> Result<(), String> {
    let flag = audio_fix_flag(&app).ok_or("The app's settings folder wasn't found.")?;
    let result = if on {
        flag.parent()
            .map_or(Ok(()), std::fs::create_dir_all)
            .and_then(|()| std::fs::write(&flag, b""))
    } else if flag.exists() {
        std::fs::remove_file(&flag)
    } else {
        Ok(())
    };
    result.map_err(|err| format!("Couldn't save the setting: {err}"))
}

/// Restart the app. It goes through the normal exit, so the single-instance lock is let go
/// before the new copy starts.
#[tauri::command]
async fn restart_app(app: AppHandle) {
    app.request_restart();
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

/// Facts the host page reads at startup (see src/lib/desktop.svelte.ts).
fn page_flags(args: Option<&str>, fix_saved: bool) -> String {
    let mut js = format!("window.__JB_AUDIO_FIX = {fix_saved};");
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

/// The host window. `args`: WebView2 switches to use instead of wry's defaults.
fn build_main(app: &AppHandle, args: Option<&'static str>, fix_saved: bool) -> tauri::Result<()> {
    let handle = app.clone();
    let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("Jeopardy Builder")
        .inner_size(1400.0, 900.0)
        .min_inner_size(900.0, 600.0)
        // Shown once its webview exists, so a failed start (retried below) never flashes an empty window.
        .visible(false)
        .initialization_script(page_flags(args, fix_saved))
        .on_new_window(move |url, features| open_popup(&handle, url, features));
    if let Some(args) = args {
        builder = builder.additional_browser_args(args);
    }
    let window = builder.build()?;
    if let Some(args) = args {
        let _ = ACTIVE_ARGS.set(args);
    }
    // The window exists now: a failure here must not send the caller into another start.
    if let Err(err) = window.show() {
        eprintln!("couldn't show the main window: {err}");
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        // First, so a second launch hands over to the running app before anything else starts.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.unminimize();
                let _ = main.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![set_audio_fix, restart_app])
        .setup(|app| {
            let handle = app.handle().clone();
            let fix_saved = audio_fix_flag(&handle).is_some_and(|flag| flag.exists());
            let args = fix_saved.then_some(AUDIO_FIX_ARGS);
            // Right after a restart, the old copy's WebView2 processes can still hold the data folder
            // with other switches, and WebView2 won't start with different ones until they've quit.
            let mut tries = 0;
            loop {
                match build_main(&handle, args, fix_saved) {
                    Ok(()) => break,
                    Err(err) if tries < 16 => {
                        tries += 1;
                        eprintln!("main window didn't start ({err}), trying again");
                        std::thread::sleep(Duration::from_millis(250));
                    }
                    // The experimental fix must never keep the app from starting.
                    Err(err) if args.is_some() => {
                        eprintln!("starting without the Discord audio fix: {err}");
                        build_main(&handle, None, fix_saved)?;
                        break;
                    }
                    Err(err) => return Err(err.into()),
                }
            }
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

    #[test]
    fn page_flags_without_the_fix() {
        let js = page_flags(None, false);
        assert!(js.contains("window.__JB_AUDIO_FIX = false;"));
        // No switches: every window keeps wry's defaults.
        assert!(!js.contains("__JB_BROWSER_ARGS"));
    }

    #[test]
    fn page_flags_with_the_fix() {
        let js = page_flags(Some(AUDIO_FIX_ARGS), true);
        assert!(js.contains("window.__JB_AUDIO_FIX = true;"));
        assert!(js.contains(&format!("window.__JB_BROWSER_ARGS = \"{AUDIO_FIX_ARGS}\";")));
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
