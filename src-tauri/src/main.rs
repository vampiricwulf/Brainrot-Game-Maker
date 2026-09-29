// Desktop wrapper (spec §2, P2): the same single-file web app in a native window.
// Hides the console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Jeopardy Builder");
}
