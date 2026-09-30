// Moving the data of "Jeopardy Builder" (the program's old name) to Brainrot Games Maker's folders.
//
// The app's folders are named after its identifier: %LOCALAPPDATA%\<identifier> holds WebView2's data
// (the autosave, games in progress and stored media) and %APPDATA%\<identifier> the Discord audio fix's
// files. The identifier changed with the rename, so on the first start the old folders are moved to the
// new names, before any window (and so WebView2) is created. The page's origin doesn't depend on the
// identifier, so the moved WebView2 folder carries everything over as it was.
//
// Nothing is merged or overwritten: if the new folder already has data of its own, the old one is left
// where it is (ℹ About lists it, so it can be looked at and deleted by hand).

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// The identifier the app had as Jeopardy Builder.
pub const OLD_IDENTIFIER: &str = "com.jeopardybuilder.brainrot";

/// Written into a folder moved by copying, so a later start knows the old folder is a leftover copy
/// it may delete (it couldn't be deleted right after the copy, e.g. because a file was in use).
pub const MARKER: &str = "moved-from-jeopardy-builder.txt";

#[derive(Debug, PartialEq, Eq)]
pub enum Outcome {
    /// There was no old folder.
    NothingToMove,
    /// The old folder is now the new one.
    Moved,
    /// Copied over, but the old folder couldn't be deleted yet (it's retried on later starts).
    MovedLeftover,
    /// A leftover copy from an earlier move was deleted now.
    Cleaned,
    /// Still can't delete a leftover copy from an earlier move.
    StillLeftover,
    /// The new folder already has its own data, so the old one was left alone.
    KeptBoth,
}

/// The old folder next to `new` (same parent, the old identifier as its name).
pub fn old_for(new: &Path) -> Option<PathBuf> {
    new.parent().map(|parent| parent.join(OLD_IDENTIFIER))
}

fn is_empty_dir(dir: &Path) -> bool {
    fs::read_dir(dir)
        .map(|mut entries| entries.next().is_none())
        .unwrap_or(false)
}

fn copy_dir_all(from: &Path, to: &Path) -> io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_all(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

/// Move `old` to `new` if there's something to move. An error means nothing changed: the old folder
/// couldn't be read or moved (usually because the old app is still running and holds its files).
pub fn move_folder(old: &Path, new: &Path) -> io::Result<Outcome> {
    if !old.is_dir() {
        return Ok(Outcome::NothingToMove);
    }
    if new.join(MARKER).exists() {
        // Copied on an earlier start: the old folder is a leftover copy.
        return Ok(if fs::remove_dir_all(old).is_ok() {
            Outcome::Cleaned
        } else {
            Outcome::StillLeftover
        });
    }
    if new.exists() {
        if !is_empty_dir(new) {
            return Ok(Outcome::KeptBoth);
        }
        fs::remove_dir(new)?;
    }
    if let Some(parent) = new.parent() {
        fs::create_dir_all(parent)?;
    }
    // Same drive (the usual case): instant, and all or nothing.
    if fs::rename(old, new).is_ok() {
        return Ok(Outcome::Moved);
    }
    // Otherwise copy into a temporary name first, so a failed copy never leaves a half-filled new folder.
    let staging = new.with_extension("moving");
    let _ = fs::remove_dir_all(&staging);
    if let Err(err) = copy_dir_all(old, &staging) {
        let _ = fs::remove_dir_all(&staging);
        return Err(err);
    }
    fs::write(staging.join(MARKER), old.display().to_string())?;
    fs::rename(&staging, new)?;
    Ok(if fs::remove_dir_all(old).is_ok() {
        Outcome::Moved
    } else {
        Outcome::MovedLeftover
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TempDir(PathBuf);
    impl TempDir {
        fn new(test: &str) -> Self {
            let dir =
                std::env::temp_dir().join(format!("bgm-migrate-{test}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            TempDir(dir)
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn write(path: &Path, text: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    #[test]
    fn nothing_to_move_without_an_old_folder() {
        let t = TempDir::new("none");
        let new = t.0.join("com.brainrotgames.maker");
        assert_eq!(
            move_folder(&t.0.join(OLD_IDENTIFIER), &new).unwrap(),
            Outcome::NothingToMove
        );
        assert!(!new.exists());
    }

    #[test]
    fn moves_the_old_folder_with_everything_in_it() {
        let t = TempDir::new("move");
        let old = t.0.join(OLD_IDENTIFIER);
        let new = t.0.join("com.brainrotgames.maker");
        write(&old.join("EBWebView/Default/IndexedDB/db"), "games");
        assert_eq!(old_for(&new).unwrap(), old);
        assert_eq!(move_folder(&old, &new).unwrap(), Outcome::Moved);
        assert!(!old.exists());
        assert_eq!(
            fs::read_to_string(new.join("EBWebView/Default/IndexedDB/db")).unwrap(),
            "games"
        );
        // Nothing left to do on the next start.
        assert_eq!(move_folder(&old, &new).unwrap(), Outcome::NothingToMove);
    }

    #[test]
    fn an_empty_new_folder_doesnt_block_the_move() {
        let t = TempDir::new("empty-new");
        let old = t.0.join(OLD_IDENTIFIER);
        let new = t.0.join("com.brainrotgames.maker");
        write(&old.join("discord-audio-fix-off"), "");
        fs::create_dir_all(&new).unwrap();
        assert_eq!(move_folder(&old, &new).unwrap(), Outcome::Moved);
        assert!(new.join("discord-audio-fix-off").exists());
    }

    #[test]
    fn never_overwrites_data_the_new_folder_already_has() {
        let t = TempDir::new("kept");
        let old = t.0.join(OLD_IDENTIFIER);
        let new = t.0.join("com.brainrotgames.maker");
        write(&old.join("a"), "old");
        write(&new.join("a"), "new");
        assert_eq!(move_folder(&old, &new).unwrap(), Outcome::KeptBoth);
        assert_eq!(fs::read_to_string(new.join("a")).unwrap(), "new");
        assert_eq!(fs::read_to_string(old.join("a")).unwrap(), "old");
    }

    #[test]
    fn a_leftover_copy_is_deleted_on_a_later_start() {
        let t = TempDir::new("leftover");
        let old = t.0.join(OLD_IDENTIFIER);
        let new = t.0.join("com.brainrotgames.maker");
        write(&old.join("a"), "old");
        write(&new.join("a"), "old");
        write(&new.join(MARKER), "");
        assert_eq!(move_folder(&old, &new).unwrap(), Outcome::Cleaned);
        assert!(!old.exists());
        assert!(new.join("a").exists());
    }
}
