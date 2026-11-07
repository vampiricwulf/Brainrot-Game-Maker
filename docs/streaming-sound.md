# Streaming the sound (Discord, OBS)

[← Back to the README](../README.md)

With an audience window open, the game's sound plays from the **audience window**, so that's the window to share.

To check it, open **🔊 Sound** in the host panel (or **🔊 Test the sound…** in ✅ Before you start). It has:

- a **▶ Test sound** button,
- a speaker picker (for example, a virtual cable into OBS),
- step-by-step help for each platform.

## Discord

1. Choose **Share Your Screen › Applications**.
2. Pick the audience window, with **Sound** on.
3. If viewers hear nothing, turn on Discord's *experimental method to capture audio* (**Voice & Video › Screen
   Share**) and restart Discord.

## Desktop app

- Don't run the app as administrator or with compatibility settings. Discord and OBS can't hear it then.
- The **Discord audio fix** is on by default. You can switch it off in the 🔊 Sound help.
- If the window stays blank, turn the fix off in one of these ways, then reopen the app:
  - Start the app with `--no-audio-fix`.
  - Create an empty file named `discord-audio-fix-off` in `%APPDATA%\com.brainrotgames.maker\`:

    ```bat
    mkdir "%APPDATA%\com.brainrotgames.maker" 2>nul & type nul > "%APPDATA%\com.brainrotgames.maker\discord-audio-fix-off"
    ```

## Where the desktop app keeps things

| What | Where |
|---|---|
| The game you're editing, Recent games, a game in progress, media | `%LOCALAPPDATA%\com.brainrotgames.maker` |
| Settings | `%APPDATA%\com.brainrotgames.maker` |
| Your saves, exports and autosaves | **BrainrotSaves**, next to the `.exe` |

**ℹ About** shows and opens all three.

To uninstall, delete the `.exe` and the two `com.brainrotgames.maker` folders. Keep BrainrotSaves (or move it) if you
want your saved games.
