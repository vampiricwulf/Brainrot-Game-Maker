//! Saves: Save, Export JSON and Export HTML write into a `BrainrotSaves` folder next to the exe (not
//! Downloads), so a portable copy keeps its games with it. Where the exe's folder can't be written (e.g.
//! Program Files), they go to Documents\BrainrotSaves instead.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

pub const FOLDER: &str = "BrainrotSaves";

/// What can be saved: game packs, plain JSON games, playable HTML files, item lists (CSV).
const EXTENSIONS: [&str; 5] = ["brainrot", "jbr", "json", "html", "csv"];

/// What Open lists: games. An exported .html only plays; it can't be opened for editing.
const GAMES: [&str; 3] = ["brainrot", "jbr", "json"];

/// A save's file name as the page asked for it, if it's a plain file name (no folders, nothing hidden)
/// with an allowed extension. The page can't write anywhere else.
pub fn clean_name(name: &str) -> Option<String> {
    let name = name.trim();
    // Counted as Windows does (UTF-16 units), so a title in any language fits.
    if name.is_empty()
        || name.encode_utf16().count() > 150
        || name.starts_with('.')
        || name.contains("..")
        || name.chars().any(|c| matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control())
    {
        return None;
    }
    let ext = Path::new(name).extension()?.to_str()?.to_ascii_lowercase();
    EXTENSIONS.contains(&ext.as_str()).then(|| name.to_string())
}

/// `BrainrotSaves` next to the running exe.
pub fn beside_exe() -> Option<PathBuf> {
    std::env::current_exe().ok()?.parent().map(|dir| dir.join(FOLDER))
}

/// Write a save into `dir` (made if needed). An older save with the same name is replaced only once the
/// new one is fully written, so a failed save never loses the last good one.
pub fn write_save(dir: &Path, name: &str, data: &[u8]) -> io::Result<PathBuf> {
    fs::create_dir_all(dir)?;
    let path = dir.join(name);
    let part = dir.join(format!(".{name}.part"));
    fs::write(&part, data)?;
    // On Windows, rename replaces an existing file (MOVEFILE_REPLACE_EXISTING).
    if let Err(err) = fs::rename(&part, &path) {
        let _ = fs::remove_file(&part);
        return Err(err);
    }
    Ok(path)
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

#[derive(Debug, PartialEq)]
pub struct SaveInfo {
    pub name: String,
    pub size: u64,
    /// Last written, in ms since 1970 (0 if unknown).
    pub modified: u64,
}

fn is_game(name: &str) -> bool {
    Path::new(name)
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| GAMES.contains(&ext.to_ascii_lowercase().as_str()))
}

/// The games saved in a folder (not exported .html files), newest first.
pub fn list_saves(dir: &Path) -> Vec<SaveInfo> {
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
        assert_eq!(clean_name("Quiz-items.csv").as_deref(), Some("Quiz-items.csv"));
        // 60 letters of any language fit, with " (autosave 12).brainrot" after them.
        let long = format!("{} (autosave 12).brainrot", "𝒜".repeat(60));
        assert_eq!(clean_name(&long).as_deref(), Some(long.as_str()));
        assert_eq!(clean_name(&format!("{}.json", "x".repeat(150))), None);
        for bad in ["", "../x.brainrot", "a/b.json", "a\\b.json", "C:x.json", ".hidden.json", "game.exe", "noext", "x.brainrot\u{0}"] {
            assert_eq!(clean_name(bad), None, "{bad:?}");
        }
    }

    #[test]
    fn writes_into_a_new_folder_and_replaces_an_older_save() {
        let dir = temp("write").join(FOLDER);
        let path = write_save(&dir, "Game.brainrot", b"one").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"one");
        write_save(&dir, "Game.brainrot", b"two!").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"two!");
        // No leftover partial files.
        assert_eq!(list_saves(&dir).len(), 1);
        let _ = fs::remove_dir_all(dir.parent().unwrap());
    }

    #[test]
    fn new_saves_get_the_next_free_number() {
        let dir = temp("unused");
        assert_eq!(unused_name(&dir, "Game.brainrot"), "Game.brainrot");
        write_save(&dir, "Game.brainrot", b"1").unwrap();
        assert_eq!(unused_name(&dir, "Game.brainrot"), "Game (2).brainrot");
        write_save(&dir, "Game (2).brainrot", b"2").unwrap();
        assert_eq!(unused_name(&dir, "Game.brainrot"), "Game (3).brainrot");
        assert_eq!(unused_name(&dir, "Game (2).brainrot"), "Game (3).brainrot");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn lists_saves_newest_first_and_skips_other_files() {
        let dir = temp("list");
        write_save(&dir, "Old.json", b"{}").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        write_save(&dir, "New.brainrot", b"zip").unwrap();
        fs::write(dir.join("notes.txt"), b"x").unwrap();
        // An exported game plays, but Open can't edit it.
        write_save(&dir, "New.html", b"<!doctype html>").unwrap();
        let names: Vec<String> = list_saves(&dir).into_iter().map(|s| s.name).collect();
        assert_eq!(names, ["New.brainrot", "Old.json"]);
        assert_eq!(list_saves(&dir.join("missing")), Vec::new());
        let _ = fs::remove_dir_all(&dir);
    }
}
