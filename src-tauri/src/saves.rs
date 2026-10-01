//! Saves: Save, Export JSON and Export HTML write into a `BrainrotSaves` folder next to the exe (not
//! Downloads), so a portable copy keeps its games with it. Where the exe's folder can't be written (e.g.
//! Program Files), they go to Documents\BrainrotSaves instead.

use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub const FOLDER: &str = "BrainrotSaves";

/// What can be saved: game packs, plain JSON games, playable HTML files.
const EXTENSIONS: [&str; 4] = ["brainrot", "jbr", "json", "html"];

/// What Open lists and opens: games, including exported .html files (the game pack inside them opens).
pub const GAMES: [&str; 4] = ["brainrot", "jbr", "json", "html"];

/// How many earlier versions a save that replaces itself keeps: `Game.brainrot.bak` (the one before),
/// then `Game.brainrot.bak2`.
pub const BACKUPS: usize = 2;

/// A partial file left by a save that never finished (the app or the PC stopped mid-save) is removed
/// once it's this old: younger ones may still be being written.
const STALE_PART: Duration = Duration::from_secs(10 * 60);

/// Names Windows keeps for devices: a file can't be called that, whatever its extension.
fn is_reserved(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or(name).trim_end().to_ascii_uppercase();
    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ((stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.len() == 4
            && matches!(stem.as_bytes()[3], b'1'..=b'9'))
}

/// A save's file name as the page asked for it, if it's a plain file name (no folders, nothing hidden)
/// with an allowed extension. The page can't write anywhere else. A name Windows keeps for a device
/// (`Con.brainrot`) gets a `_` in front.
pub fn clean_name(name: &str) -> Option<String> {
    let name = name.trim();
    // Counted as Windows does (UTF-16 units), so a title in any language fits.
    if name.is_empty()
        || name.encode_utf16().count() > 160
        || name.starts_with('.')
        || name.contains("..")
        || name.chars().any(|c| matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control())
    {
        return None;
    }
    let ext = Path::new(name).extension()?.to_str()?.to_ascii_lowercase();
    if !EXTENSIONS.contains(&ext.as_str()) {
        return None;
    }
    Some(if is_reserved(name) { format!("_{name}") } else { name.to_string() })
}

/// `BrainrotSaves` next to the running exe.
pub fn beside_exe() -> Option<PathBuf> {
    std::env::current_exe().ok()?.parent().map(|dir| dir.join(FOLDER))
}

/// Where a save's `n`th earlier version is kept (1: the one just before).
pub fn backup_name(name: &str, n: usize) -> String {
    if n <= 1 {
        format!("{name}.bak")
    } else {
        format!("{name}.bak{n}")
    }
}

/// Keep the save that's about to be replaced as `.bak`, moving the older backups along (the oldest is
/// dropped). The save itself stays in place until the new one replaces it.
fn keep_backup(dir: &Path, name: &str, backups: usize) -> io::Result<()> {
    let path = dir.join(name);
    if backups == 0 || !path.is_file() {
        return Ok(());
    }
    for n in (1..backups).rev() {
        let from = dir.join(backup_name(name, n));
        if from.exists() {
            fs::rename(&from, dir.join(backup_name(name, n + 1)))?;
        }
    }
    let first = dir.join(backup_name(name, 1));
    match fs::remove_file(&first) {
        Err(err) if err.kind() != io::ErrorKind::NotFound => return Err(err),
        _ => {}
    }
    // A second name for the same file is instant; a drive that can't do that (FAT USB sticks) gets a copy.
    fs::hard_link(&path, &first).or_else(|_| fs::copy(&path, &first).map(|_| ()))
}

/// Write a save into `dir` (made if needed). An older save with the same name is replaced only once the
/// new one is fully written and on disk, so a failed save (or a power cut) never loses the last good one;
/// with `backups`, it's kept as `.bak` too (see BACKUPS).
pub fn write_save(dir: &Path, name: &str, data: &[u8], backups: usize) -> io::Result<PathBuf> {
    fs::create_dir_all(dir)?;
    let path = dir.join(name);
    let part = dir.join(format!(".{name}.part"));
    let written = fs::File::create(&part).and_then(|mut file| {
        file.write_all(data)?;
        file.sync_all()
    });
    // A failed backup never stops the save itself.
    let kept = written.map(|()| keep_backup(dir, name, backups));
    // On Windows, rename replaces an existing file (MOVEFILE_REPLACE_EXISTING).
    match kept.and_then(|backup| fs::rename(&part, &path).map(|()| backup)) {
        Ok(backup) => {
            if let Err(err) = backup {
                eprintln!("couldn't keep a backup of {name}: {err}");
            }
            Ok(path)
        }
        Err(err) => {
            let _ = fs::remove_file(&part);
            Err(err)
        }
    }
}

/// A name for a new save that doesn't replace one already there: `Game.brainrot`, else `Game (2).brainrot`,
/// `Game (3).brainrot`…
pub fn unused_name(dir: &Path, name: &str) -> String {
    if !dir.join(name).exists() {
        return name.to_string();
    }
    let path = Path::new(name);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or(name);
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
    // "Game (2)" saved again becomes "Game (3)", not "Game (2) (2)".
    let base = match stem.rsplit_once(" (") {
        Some((b, n)) if n.ends_with(')') && n[..n.len() - 1].parse::<u32>().is_ok() => b,
        _ => stem,
    };
    (2..)
        .map(|n| format!("{base} ({n}).{ext}"))
        .find(|candidate| !dir.join(candidate).exists())
        .unwrap_or_else(|| name.to_string())
}

/// An autosave the app wrote ("Game (autosave 2, 1a2b3c).brainrot"): the only saves the page may delete
/// (the ones past the number of autosaves kept).
pub fn is_autosave(name: &str) -> bool {
    name.ends_with(").brainrot") && name.contains(" (autosave ")
}

#[derive(Debug, PartialEq)]
pub struct SaveInfo {
    pub name: String,
    pub size: u64,
    /// Last written, in ms since 1970 (0 if unknown).
    pub modified: u64,
}

pub fn is_game(name: &str) -> bool {
    Path::new(name)
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| GAMES.contains(&ext.to_ascii_lowercase().as_str()))
}

/// Remove partial files of saves that never finished (see STALE_PART).
fn drop_stale_parts(dir: &Path, now: SystemTime) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        if !(name.starts_with('.') && name.ends_with(".part")) {
            continue;
        }
        let modified = entry.metadata().and_then(|m| m.modified());
        if modified.is_ok_and(|t| now.duration_since(t).is_ok_and(|age| age >= STALE_PART)) {
            if let Err(err) = fs::remove_file(entry.path()) {
                eprintln!("couldn't remove the unfinished save {name}: {err}");
            }
        }
    }
}

/// The games saved in a folder (not their backups), newest first. Unfinished saves left behind are cleaned up.
pub fn list_saves(dir: &Path) -> Vec<SaveInfo> {
    drop_stale_parts(dir, SystemTime::now());
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out: Vec<SaveInfo> = entries
        .flatten()
        .filter_map(|entry| {
            let name = clean_name(entry.file_name().to_str()?).filter(|name| is_game(name))?;
            let meta = entry.metadata().ok().filter(|m| m.is_file())?;
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |d| d.as_millis() as u64);
            Some(SaveInfo { name, size: meta.len(), modified })
        })
        .collect();
    out.sort_by(|a, b| b.modified.cmp(&a.modified).then_with(|| a.name.cmp(&b.name)));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("brainrot-saves-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn only_plain_file_names_with_known_extensions() {
        assert_eq!(clean_name("My Game.brainrot").as_deref(), Some("My Game.brainrot"));
        assert_eq!(clean_name(" Quiz.HTML ").as_deref(), Some("Quiz.HTML"));
        // 60 letters of any language fit, with " (autosave 12, 1a2b3c).brainrot" after them.
        let long = format!("{} (autosave 12, 1a2b3c).brainrot", "𝒜".repeat(60));
        assert_eq!(clean_name(&long).as_deref(), Some(long.as_str()));
        assert_eq!(clean_name(&format!("{}.json", "x".repeat(160))), None);
        for bad in ["", "../x.brainrot", "a/b.json", "a\\b.json", "C:x.json", ".hidden.json", "game.exe", "noext", "x.brainrot\u{0}", "Game.brainrot.bak"] {
            assert_eq!(clean_name(bad), None, "{bad:?}");
        }
    }

    #[test]
    fn names_windows_keeps_for_devices_get_an_underscore() {
        for (asked, saved) in [
            ("Con.brainrot", "_Con.brainrot"),
            ("aux.json", "_aux.json"),
            ("NUL.html", "_NUL.html"),
            ("COM1.brainrot", "_COM1.brainrot"),
            ("lpt9.brainrot", "_lpt9.brainrot"),
            ("CON.tar.brainrot", "_CON.tar.brainrot"),
            ("Con (autosave 1, 1a2b3c).brainrot", "Con (autosave 1, 1a2b3c).brainrot"),
            ("Console.brainrot", "Console.brainrot"),
            ("COM0.brainrot", "COM0.brainrot"),
            ("COM10.brainrot", "COM10.brainrot"),
        ] {
            assert_eq!(clean_name(asked).as_deref(), Some(saved), "{asked:?}");
        }
    }

    #[test]
    fn writes_into_a_new_folder_and_replaces_an_older_save() {
        let dir = temp("write").join(FOLDER);
        let path = write_save(&dir, "Game.brainrot", b"one", 0).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"one");
        write_save(&dir, "Game.brainrot", b"two!", 0).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"two!");
        // No leftover partial files, and no backups unless asked.
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        let _ = fs::remove_dir_all(dir.parent().unwrap());
    }

    #[test]
    fn a_save_that_replaces_itself_keeps_the_last_two_as_backups() {
        let dir = temp("backup");
        let read = |name: &str| fs::read_to_string(dir.join(name)).ok();
        write_save(&dir, "Game.brainrot", b"1", BACKUPS).unwrap();
        assert_eq!(read("Game.brainrot.bak"), None);
        write_save(&dir, "Game.brainrot", b"2", BACKUPS).unwrap();
        assert_eq!((read("Game.brainrot").as_deref(), read("Game.brainrot.bak").as_deref()), (Some("2"), Some("1")));
        write_save(&dir, "Game.brainrot", b"3", BACKUPS).unwrap();
        write_save(&dir, "Game.brainrot", b"4", BACKUPS).unwrap();
        assert_eq!(read("Game.brainrot").as_deref(), Some("4"));
        assert_eq!(read("Game.brainrot.bak").as_deref(), Some("3"));
        assert_eq!(read("Game.brainrot.bak2").as_deref(), Some("2"));
        assert_eq!(read("Game.brainrot.bak3"), None);
        // Backups aren't listed in Open (Browse… opens them).
        let names: Vec<String> = list_saves(&dir).into_iter().map(|s| s.name).collect();
        assert_eq!(names, ["Game.brainrot"]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn new_saves_get_the_next_free_number() {
        let dir = temp("unused");
        assert_eq!(unused_name(&dir, "Game.brainrot"), "Game.brainrot");
        write_save(&dir, "Game.brainrot", b"1", 0).unwrap();
        assert_eq!(unused_name(&dir, "Game.brainrot"), "Game (2).brainrot");
        write_save(&dir, "Game (2).brainrot", b"2", 0).unwrap();
        assert_eq!(unused_name(&dir, "Game.brainrot"), "Game (3).brainrot");
        assert_eq!(unused_name(&dir, "Game (2).brainrot"), "Game (3).brainrot");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn lists_games_newest_first_and_skips_other_files() {
        let dir = temp("list");
        write_save(&dir, "Old.json", b"{}", 0).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        write_save(&dir, "New.brainrot", b"zip", 0).unwrap();
        fs::write(dir.join("notes.txt"), b"x").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        // An exported game opens too (its game pack is inside).
        write_save(&dir, "New.html", b"<!doctype html>", 0).unwrap();
        let names: Vec<String> = list_saves(&dir).into_iter().map(|s| s.name).collect();
        assert_eq!(names, ["New.html", "New.brainrot", "Old.json"]);
        assert_eq!(list_saves(&dir.join("missing")), Vec::new());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn unfinished_saves_are_cleaned_up_once_old() {
        let dir = temp("parts");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(".Game.brainrot.part"), b"half").unwrap();
        fs::write(dir.join("Keep.brainrot"), b"zip").unwrap();
        // Just written: it may still be being saved.
        drop_stale_parts(&dir, SystemTime::now());
        assert!(dir.join(".Game.brainrot.part").exists());
        drop_stale_parts(&dir, SystemTime::now() + STALE_PART);
        assert!(!dir.join(".Game.brainrot.part").exists());
        assert!(dir.join("Keep.brainrot").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn only_autosaves_can_be_deleted() {
        assert!(is_autosave("Game (autosave 4, 1a2b3c).brainrot"));
        assert!(is_autosave("Game (autosave 4).brainrot"));
        assert!(!is_autosave("Game.brainrot"));
        assert!(!is_autosave("Game (autosave 4).json"));
    }
}
