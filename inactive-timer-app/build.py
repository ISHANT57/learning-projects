"""Build the shareable release files into release/:

  InactivityAlarm-Setup-<version>.exe     installer (recommended for sharing)
  InactivityAlarm-Portable-<version>.exe  single exe, runs without installing

Requires: pip install -r requirements.txt, and Inno Setup 6 for the installer
(winget install JRSoftware.InnoSetup). Version/publisher come from config.py.
"""

import os
import shutil
import subprocess
import sys

import PyInstaller.__main__

import config

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "build")
DIST = os.path.join(HERE, "dist")
RELEASE = os.path.join(HERE, "release")
NAME = "InactivityAlarm"
VERSION = config.APP_VERSION

VERSION_TEMPLATE = """VSVersionInfo(
  ffi=FixedFileInfo(filevers={t}, prodvers={t}, mask=0x3f, flags=0x0, OS=0x40004,
                    fileType=0x1, subtype=0x0, date=(0, 0)),
  kids=[
    StringFileInfo([StringTable('040904B0', [
      StringStruct('CompanyName', {pub!r}),
      StringStruct('FileDescription', {app!r}),
      StringStruct('FileVersion', {ver!r}),
      StringStruct('InternalName', {name!r}),
      StringStruct('OriginalFilename', {exe!r}),
      StringStruct('ProductName', {app!r}),
      StringStruct('ProductVersion', {ver!r})])]),
    VarFileInfo([VarStruct('Translation', [1033, 1200])])
  ]
)
"""


def write_version_file() -> str:
    parts = [int(p) for p in VERSION.split(".")][:4]
    parts += [0] * (4 - len(parts))
    path = os.path.join(BUILD, "version_info.txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write(VERSION_TEMPLATE.format(t=tuple(parts), pub=config.PUBLISHER, app=config.APP_NAME,
                                        ver=VERSION, name=NAME, exe=NAME + ".exe"))
    return path


def pyinstaller(mode: str, version_file: str) -> None:
    PyInstaller.__main__.run([
        "--noconfirm", "--clean", "--log-level", "WARN",
        mode, "--windowed",
        "--name", NAME,
        "--icon", os.path.join(HERE, "assets", "icon.ico"),
        "--add-data", os.path.join(HERE, "assets") + os.pathsep + "assets",
        "--version-file", version_file,
        "--distpath", os.path.join(DIST, mode.lstrip("-")),
        "--workpath", os.path.join(BUILD, mode.lstrip("-")),
        "--specpath", BUILD,
        os.path.join(HERE, "main.py"),
    ])


def find_iscc():
    candidates = [
        os.environ.get("ISCC", ""),
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"),
        os.path.expandvars(r"%ProgramFiles%\Inno Setup 6\ISCC.exe"),
    ]
    return next((c for c in candidates if c and os.path.isfile(c)), shutil.which("ISCC"))


def main() -> int:
    for d in (BUILD, DIST):
        shutil.rmtree(d, ignore_errors=True)
    os.makedirs(BUILD)
    os.makedirs(RELEASE, exist_ok=True)
    version_file = write_version_file()

    print("== Building portable exe (one file)")
    pyinstaller("--onefile", version_file)
    portable = os.path.join(RELEASE, f"{NAME}-Portable-{VERSION}.exe")
    shutil.copy2(os.path.join(DIST, "onefile", NAME + ".exe"), portable)
    print("   ->", portable)

    print("== Building app folder for the installer")
    pyinstaller("--onedir", version_file)

    iscc = find_iscc()
    if not iscc:
        print("!! Inno Setup not found - skipped the installer. "
              "Install it with: winget install JRSoftware.InnoSetup")
        return 1
    print("== Building installer")
    subprocess.run([iscc, "/Q", f"/DAppVersion={VERSION}", f"/DAppPublisher={config.PUBLISHER}",
                    os.path.join(HERE, "installer.iss")], check=True)
    print("   ->", os.path.join(RELEASE, f"{NAME}-Setup-{VERSION}.exe"))

    shutil.rmtree(BUILD, ignore_errors=True)
    print("Done. Share the files in", RELEASE)
    return 0


if __name__ == "__main__":
    sys.exit(main())
