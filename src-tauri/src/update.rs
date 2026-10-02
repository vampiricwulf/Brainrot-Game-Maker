//! Updating the portable .exe in place: the new one is downloaded from a GitHub release, its signature checked against
//! the public key built into this one (so only a release signed with the project's key is ever run), and it takes the
//! running file's place. Windows lets a running program's file be renamed (not overwritten): the old one moves aside
//! to "<name>.old" and is deleted on the next start.

use base64::Engine;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri_plugin_http::reqwest;

/// The public key releases are signed with (`npx tauri signer generate`'s, as printed), given to the build by
/// CI. A build without one can't update itself: the page offers the download instead.
pub const PUBLIC_KEY: Option<&str> = option_env!("BRAINROT_UPDATE_PUBKEY");

/// Downloads only come from GitHub releases.
const RELEASES: &str = "https://github.com/";
/// A sane upper bound for the app's .exe.
const MAX_BYTES: usize = 200 * 1024 * 1024;

fn decode(text: &str) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(text.trim())
        .map_err(|_| "The update's signature isn't readable.".to_string())?;
    String::from_utf8(bytes).map_err(|_| "The update's signature isn't readable.".to_string())
}

/// Is `bytes` signed by the key? `signature` and `key` as `tauri signer` writes them (base64 of minisign's text).
pub fn verify(bytes: &[u8], signature: &str, key: &str) -> Result<(), String> {
    let key = minisign_verify::PublicKey::decode(&decode(key)?).map_err(|_| "This app's update key isn't readable.")?;
    let signature = minisign_verify::Signature::decode(&decode(signature)?).map_err(|_| "The update's signature isn't readable.")?;
    key.verify(bytes, &signature, true)
        .map_err(|_| "The download isn't signed by Brainrot Games Maker's key: it wasn't installed.".to_string())
}

fn beside(exe: &Path, suffix: &str) -> PathBuf {
    let mut name = exe.as_os_str().to_owned();
    name.push(suffix);
    PathBuf::from(name)
}

/// Put `bytes` in place of the program file `exe` (kept as "<exe>.old" until the next start). On failure, the program
/// file is left as it was.
pub fn replace_exe(exe: &Path, bytes: &[u8]) -> Result<(), String> {
    let new = beside(exe, ".new");
    let old = beside(exe, ".old");
    let cant = |err: std::io::Error| {
        format!(
            "Couldn't put the new version in place of this one ({}). Download it and put it in place of this .exe yourself.",
            crate::saves::plain_error(&err)
        )
    };
    fs::write(&new, bytes).map_err(cant)?;
    let _ = fs::remove_file(&old);
    if let Err(err) = fs::rename(exe, &old) {
        let _ = fs::remove_file(&new);
        return Err(cant(err));
    }
    if let Err(err) = fs::rename(&new, exe) {
        let _ = fs::rename(&old, exe);
        let _ = fs::remove_file(&new);
        return Err(cant(err));
    }
    Ok(())
}

/// The previous version's file, left by an update: deleted once its process has gone (it may still be closing).
pub fn clean_up_after_update() {
    let Ok(exe) = std::env::current_exe() else { return };
    let old = beside(&exe, ".old");
    if !old.exists() {
        return;
    }
    std::thread::spawn(move || {
        for _ in 0..30 {
            if fs::remove_file(&old).is_ok() || !old.exists() {
                return;
            }
            std::thread::sleep(Duration::from_secs(1));
        }
    });
}

async fn download(client: &reqwest::Client, url: &str) -> Result<Vec<u8>, String> {
    if !url.starts_with(RELEASES) || !url.contains("/releases/download/") {
        return Err("Updates only come from the app's GitHub releases.".into());
    }
    let failed = |err: reqwest::Error| format!("The download failed ({err}). Check the connection and try again.");
    let response = client.get(url).send().await.map_err(failed)?.error_for_status().map_err(failed)?;
    let bytes = response.bytes().await.map_err(failed)?;
    if bytes.len() > MAX_BYTES {
        return Err("The download is far bigger than the app: it wasn't installed.".into());
    }
    Ok(bytes.to_vec())
}

/// Download the release's .exe and its signature, check it, and put it in place of this one. The page restarts the
/// app afterwards (once its game is saved).
pub async fn install(exe_url: &str, signature_url: &str) -> Result<(), String> {
    let key = PUBLIC_KEY.ok_or("This copy of the app can't update itself: download the new version instead.")?;
    let client = reqwest::Client::builder()
        .user_agent("Brainrot Games Maker updater")
        .build()
        .map_err(|err| format!("Couldn't start the download ({err}). Download the new version instead."))?;
    let exe = download(&client, exe_url).await?;
    let signature = String::from_utf8(download(&client, signature_url).await?)
        .map_err(|_| "The update's signature isn't readable.".to_string())?;
    verify(&exe, &signature, key)?;
    if !exe.starts_with(b"MZ") {
        return Err("The download isn't a Windows program: it wasn't installed.".into());
    }
    let path = std::env::current_exe()
        .map_err(|err| format!("Couldn't find where this app is ({err}). Download the new version instead."))?;
    replace_exe(&path, &exe)
}

#[cfg(test)]
mod tests {
    use super::*;

    // A key made for these tests only (`npx tauri signer generate`), and its signature of b"hello" (`tauri signer sign`).
    const TEST_KEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDA1NjA1NDFBOUU1MDgyNEMKUldSTWdsQ2VHbFJnQlI2d1pVZGNjRmp2KzY1UmFnQVdPaXgyMnJNeTEycVVrU2diTUp6L2Fmd3AK";
    const HELLO_SIGNATURE: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSTWdsQ2VHbFJnQlFsTU9nUmdkZTBVR3VMZjJIMmx6U2VPOHhHTmRVTzZsVDhuOEVKSmdJNEgrb29ieGlPR2ZMM2EzZmxLZEt5emZpa2tZL3VxN29BUlljaVY3c3ZPY1FBPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkwODg4NjU1CWZpbGU6aGVsbG8uYmluClVTQUE1Wk9Gc1dsOWE4NVU5WWF1WDNTVkF0WlZmK1lyNzhYYS9jdVp6cmQ3QmFLaGJQZnVaR1l2RU4wVVR5VWpSdjFzbHI4WXJRdmhtckd6RGpqSERBPT0K";

    #[test]
    fn a_signed_download_passes_and_anything_else_is_refused() {
        assert!(verify(b"hello", HELLO_SIGNATURE, TEST_KEY).is_ok());
        assert!(verify(b"hellO", HELLO_SIGNATURE, TEST_KEY).is_err());
    }

    #[test]
    fn replace_keeps_the_old_file_aside() {
        let dir = std::env::temp_dir().join(format!("brainrot-update-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let exe = dir.join("app.exe");
        fs::write(&exe, b"MZ old").unwrap();
        replace_exe(&exe, b"MZ new").unwrap();
        assert_eq!(fs::read(&exe).unwrap(), b"MZ new");
        assert_eq!(fs::read(beside(&exe, ".old")).unwrap(), b"MZ old");
        assert!(!beside(&exe, ".new").exists());
        // Again: the older .old is replaced.
        replace_exe(&exe, b"MZ newer").unwrap();
        assert_eq!(fs::read(beside(&exe, ".old")).unwrap(), b"MZ new");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn unreadable_keys_and_signatures_are_refused() {
        assert!(verify(b"hello", "not base64!", "also not").is_err());
        let junk = base64::engine::general_purpose::STANDARD.encode("untrusted comment: x\nnope");
        assert!(verify(b"hello", &junk, &junk).is_err());
    }
}
