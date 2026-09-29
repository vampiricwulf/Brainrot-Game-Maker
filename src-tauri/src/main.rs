// Desktop wrapper (spec §2): the same single-file web app in a native window.
//
// The app opens extra windows with `window.open` (the audience window for OBS, and the
// "Open on YouTube" fallback). A plain webview blocks those, so every `window.open` request
// gets a real Tauri window. Creating it ourselves (instead of letting WebView2 make a bare
// popup) matters for two reasons: the new window can load the app's own pages (served by
// Tauri's custom protocol, which a bare popup wouldn't have), and it stays linked to the host
// window as `window.opener`, which the host ⇄ audience sync relies on.

// Hides the console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicUsize, Ordering};

use tauri::webview::{NewWindowFeatures, NewWindowResponse};
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};

/// Unique labels for windows opened by the page (matches the "popup-*" capability).
static POPUPS: AtomicUsize = AtomicUsize::new(0);

fn is_audience(url: &Url) -> bool {
    url.fragment() == Some("audience")
}

/// Build a real app window for a `window.open` request from the page.
fn open_popup(app: &AppHandle, url: Url, features: NewWindowFeatures) -> NewWindowResponse<tauri::Wry> {
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

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Jeopardy Builder")
                .inner_size(1400.0, 900.0)
                .min_inner_size(900.0, 600.0)
                .on_new_window(move |url, features| open_popup(&handle, url, features))
                .build()?;
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
