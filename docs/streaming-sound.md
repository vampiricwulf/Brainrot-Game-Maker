# Streaming the sound (Discord, OBS)

[← Back to the README](../README.md)

In dual-window mode, the sound plays from the **audience window**. **🔊 Sound** in the host panel (and **🔊 Test the
sound…** before the game, in ✅ Before you start) has a **Test sound** button, a speaker picker (e.g. for a virtual cable
into OBS), and step-by-step help.

**Discord:**

1. **Share Your Screen › Applications**.
2. Pick the audience window, with **Sound** on.
3. If viewers hear nothing, turn on Discord's *experimental method to capture audio* (**Voice & Video › Screen Share**)
   and restart Discord.

**Desktop app:**

- Don't run it as administrator or with compatibility settings. Discord and OBS can't hear it then.
- The **Discord audio fix** is on by default. Switch it off in the 🔊 Sound help.
- If the window stays blank, turn the fix off in either of these ways, then reopen the app:
  - Start the app with `--no-audio-fix`.
  - Create an empty file named `discord-audio-fix-off` in `%APPDATA%\com.brainrotgames.maker\`.

  ```bat
  mkdir "%APPDATA%\com.brainrotgames.maker" 2>nul & type nul > "%APPDATA%\com.brainrotgames.maker\discord-audio-fix-off"
  ```

The desktop app keeps its data in `%LOCALAPPDATA%\com.brainrotgames.maker`: the game you're editing, Recent games, a
game in progress and media. Settings go in `%APPDATA%\com.brainrotgames.maker`. Your saves, exports and autosaves are in
**BrainrotSaves** next to the `.exe`. **ℹ About** shows and opens all three (the editor's first screen says so, with **ℹ
See where**). To uninstall, delete the `.exe` and the two
`com.brainrotgames.maker` folders; keep BrainrotSaves (or move it) if you want your saved games.
