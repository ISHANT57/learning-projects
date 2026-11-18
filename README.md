# Learning Projects

A collection of small projects I build to learn new tools, languages and concepts. Each project lives in its own folder with its own README.

| Project | What it is | Tech |
|---------|------------|------|
| [Inactive Timer App](inactive-timer-app/) | Windows app that sounds an alarm when you haven't touched the keyboard or mouse for a set time. Runs in the background from the system tray. [Download](https://github.com/ISHANT57/learning-projects/releases/tag/inactive-timer-app-v1.1.0) | Python, Tkinter, Windows API, PyInstaller, Inno Setup |
| [VaultSync Password Manager](vaultsync/) | Chrome extension (MV3) that captures, encrypts (AES-256-GCM) and auto-fills logins, with optional encrypted Google Drive backup and a Markdown activity log. | TypeScript, Vite, Web Crypto, Chrome Extension APIs, Google Drive API |
| [Teardown](teardown/) | Framework (copy of elvarofficial/teardown) for interactive 3D simulators of real machines. | Three.js, esbuild, Playwright, JavaScript |
| [Laptop Teardown](laptop-teardown/) ([live](https://ishant57.github.io/learning-projects/)) | Interactive 3D laptop you can take apart: 36 inspectable parts and six visualizations (power flow, CPU and RAM, SSD to RAM, CPU execution, cooling, boot). One offline HTML file, built on Teardown. | Three.js, JavaScript |
| [Phone Teardown](nord-ce4-lite-teardown/) ([live](https://ishant57.github.io/learning-projects/phone/)) | Interactive 3D phone teardown (internals traced from a real Nord 2020 teardown, with your Nord CE4 Lite 5G specs beside every part) and 11 demonstrations: boot, CPU, RAM, UFS, touch, camera, Wi-Fi and 5G, GPS, charging, thermal, frame rendering. One offline HTML file. | Three.js, JavaScript |

## Repository layout

```
learning-projects/
├── inactive-timer-app/     Inactivity Alarm (Windows desktop app)
├── vaultsync/              VaultSync Password Manager (Chrome extension)
├── teardown/               Teardown framework for 3D machine simulators
├── laptop-teardown/        Interactive laptop breakdown (3D, offline HTML)
└── nord-ce4-lite-teardown/ Interactive phone breakdown and 11 demonstrations
```

New projects get their own folder and a row in the table above.

## License

Each project has its own `LICENSE` file. Unless a project says otherwise, all work here is **© 2026 IMPS. All rights reserved.** Made by Ishant.
