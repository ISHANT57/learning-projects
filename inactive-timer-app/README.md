# Inactivity Alarm

**Made by Ishant · © 2026 IMPS. All rights reserved.**

A tiny Windows utility that plays an alarm when you haven't touched the keyboard or mouse for a set number of minutes.

- Python 3 + Tkinter, a single small window, runs from the system tray.
- Uses the Windows `GetLastInputInfo` API, which only reports **when** the last input happened.
- Polls once per second, and only while monitoring is on. Measured at about 0.2–0.4 % of one CPU core.

## Ownership, license and fingerprint

**Made by Ishant · © 2026 IMPS. All rights reserved.** See [LICENSE](LICENSE). You may view and study the code and use the official releases. Copying, redistributing or selling it needs written permission.

Every copy of this app carries the fingerprint **`IMPS-IA-E91E8AB6F47B4248`** in several places, so copies can be traced:

| Where | How to check |
|-------|--------------|
| App window | Footer shows *Made by Ishant · © 2026 IMPS* |
| `.exe` and `Setup.exe` properties | Right-click → **Properties → Details** (Copyright, Company, Comments), or in PowerShell: `(Get-Item InactivityAlarm.exe).VersionInfo \| Format-List CompanyName, LegalCopyright, Comments` |
| Settings → Apps | Publisher **IMPS**, with a link to this repo |
| Installer | Shows the license page before installing |
| Every source file | Copyright and fingerprint header on the first lines |
| `assets/alarm.wav` | Copyright, artist and fingerprint in the file's metadata |
| Search for copies | Search GitHub code for `IMPS-IA-E91E8AB6F47B4248` |

These marks make copying **detectable and provable**. They can't make it impossible, because anyone with the code can edit it.

## Privacy

- No keylogging, no mouse-position tracking, no screenshots, no activity history.
- No network access, telemetry or analytics. Everything runs locally.
- The only file written is `%APPDATA%\InactivityAlarm\settings.json`. It holds your minutes, mode and sound settings.

## Download & install (for anyone)

**[⬇ Download the latest version](https://github.com/ISHANT57/learning-projects/releases/tag/inactive-timer-app-v1.1.0)** from the GitHub Releases page.

There are two files (building the project yourself also creates them in the `release\` folder). Share either one. Recipients don't need Python or anything else, just 64-bit Windows 10 or 11.

| File | What it is |
|------|------------|
| **`InactivityAlarm-Setup-1.1.0.exe`** (recommended) | Normal Windows installer. No admin rights needed. Adds a Start Menu entry and a Desktop icon, and starts the app automatically when you sign in. You can untick either option in the wizard. Uninstall from **Settings → Apps → Installed apps**. |
| `InactivityAlarm-Portable-1.1.0.exe` | Single file that runs without installing. Good for a USB stick or a quick try. |

**First-run warning:** the app isn't code-signed, so Windows may show *"Windows protected your PC"*. Click **More info → Run anyway**. Some antivirus tools are also wary of unsigned PyInstaller apps.

Uninstalling removes the program, its shortcuts, the startup entry and the settings file.

## Run from source (developers)

Python 3.10+ on Windows:

```bat
pip install -r requirements.txt
python main.py
```

`pystray` and `Pillow` are only used for the tray icon. Without them, the app still works and minimizes to the taskbar instead.

## Usage

1. Pick **Alert after N minutes** from the presets (1, 2, 5, 10, 15), or type your own and press **Enter**. Custom values can be anything from 0.5 to 999: `3`, `7 min` and `1.5` (90 seconds) all work. The default is 5. You can change the duration while monitoring and it applies immediately.
2. Choose a mode:
   - **Alert once**: the alarm plays once.
   - **Keep alarming until I'm active**: the alarm loops until you move the mouse, press a key or click **Dismiss Alarm**.
3. Optionally untick **Alarm sound enabled**. You'll still get the red on-screen alert and a tray notification.
4. Click **Start Monitoring**.

The window shows the status (grey = off, green = monitoring, red = ALARM), how long you've been idle, and the time of your last activity.

When the alarm fires:
- the window pops to the front, even if it was hidden in the tray
- a tray notification appears
- the sound plays

Any keyboard or mouse input stops the alarm and resets the timer. The alarm fires only once per idle period and re-arms after you're active again.

### Runs in the background

Inactivity Alarm is a **background app**. It lives in the system tray (the icons near the clock; on Windows 11 they may be under the `^` arrow).

- **Close** (`X`) or **minimize** (`_`) just hides the window. Monitoring keeps running.
- **Double-click the tray icon**, or open the app again from the Start Menu or Desktop, to bring the window back.
- **Right-click the tray icon** for **Open**, **Start/Stop monitoring** and **Quit**.
- **To exit completely**, right-click the tray icon and choose **Quit**.
- Only one copy runs at a time. Launching it again opens the existing window.

### Command-line options

| Option        | Effect                              |
|---------------|-------------------------------------|
| `--minimized` | Start hidden in the system tray     |
| `--start`     | Start monitoring immediately        |

## Run at Windows startup (optional)

The easiest way is to tick **"Start automatically when I sign in"** in the installer. To turn it off later, go to **Settings → Apps → Startup** (or Task Manager → Startup apps) and switch off *Inactivity Alarm*.

For the portable exe, press `Win + R`, type `shell:startup`, and put a shortcut there with the target
`"C:\path\to\InactivityAlarm-Portable-1.1.0.exe" --minimized --start`.

## Build the release files

Requirements:
- Python with `pip install -r requirements.txt`
- [Inno Setup 6](https://jrsoftware.org/isinfo.php) for the installer: `winget install JRSoftware.InnoSetup`

Then run:

```bat
build.bat
```

The output goes to `release\`:
- a portable one-file exe
- the installer, built from a folder-based PyInstaller build, which starts faster and is flagged by antivirus less often

To release a new version, change `APP_VERSION` (and `PUBLISHER` if you like) in `config.py` and rebuild. Installing a new version over an old one upgrades it in place and closes any running copy first.

`python make_assets.py` regenerates `assets\alarm.wav` and `assets\icon.ico`.

**Removing the SmartScreen warning** requires signing the exe and installer with a code-signing certificate. Options include a commercial certificate or Microsoft's Azure Trusted Signing. This project doesn't include one.

## Tests

```bat
python -m unittest discover tests -v
```

The tests cover the tick-wraparound maths, the alarm state machine (fires once, re-arms after activity, start/stop, API errors) and settings loading/saving.

## Project layout

```
main.py               Tkinter UI, tray icon, background behaviour, single-instance guard
inactivity_monitor.py GetLastInputInfo wrapper + alarm state machine (no UI)
alarm.py              Non-blocking sound playback (winsound)
config.py             Constants and settings file
make_assets.py        Generates assets/alarm.wav and assets/icon.ico
build.py / build.bat  Builds release/ (portable exe + installer)
installer.iss         Inno Setup installer script
PROJECT_GUIDE.md      Plain-English guide to how everything works
make_guide_pdf.py     Turns PROJECT_GUIDE.md into "Inactivity Alarm - Project Guide.pdf"
tests/                Unit tests
```

## Known limitations

These come from how Windows reports input:

- Idle time is per Windows session. Input from other users or sessions isn't seen.
- **Synthetic input counts as activity.** This includes remote-desktop input, mouse-jiggler or macro tools, and some game-controller software.
- Input on the lock screen or a UAC prompt isn't visible to the app.
- The 32-bit tick counter wraps every ~49.7 days of uptime. This is handled, but idle periods longer than ~24 days can't be measured.
- Tray notifications can be hidden by Windows Focus Assist / Do Not Disturb. The sound and the pop-up window still work.
