"""Constants and a tiny JSON settings file (stored in %APPDATA%\\InactivityAlarm)."""

import json
import os
from dataclasses import asdict, dataclass

APP_NAME = "Inactivity Alarm"
APP_VERSION = "1.1.0"          # used by build.py for the exe and installer
PUBLISHER = "Inactivity Alarm"  # shown in exe properties and Settings > Apps

PRESET_MINUTES = (1, 2, 5, 10, 15)
DEFAULT_MINUTES = 5
MIN_MINUTES = 0.5   # custom values may be fractional, e.g. 1.5 = 90 seconds
MAX_MINUTES = 999

MODE_ONCE = "once"              # play the alarm once, then stay quiet
MODE_CONTINUOUS = "continuous"  # keep alarming until activity or dismiss
MODES = (MODE_ONCE, MODE_CONTINUOUS)


@dataclass
class Settings:
    minutes: float = DEFAULT_MINUTES
    mode: str = MODE_CONTINUOUS
    sound: bool = True


def settings_path() -> str:
    base = os.environ.get("APPDATA") or os.path.expanduser("~")
    return os.path.join(base, "InactivityAlarm", "settings.json")


def valid_minutes(value) -> bool:
    return (isinstance(value, (int, float)) and not isinstance(value, bool)
            and MIN_MINUTES <= value <= MAX_MINUTES)


def parse_minutes(text: str):
    """Parse user input like '7', '7 min', '1.5', '2,5 minutes'. None if invalid."""
    s = str(text).strip().lower().replace(",", ".")
    for suffix in ("minutes", "minute", "mins", "min", "m"):
        if s.endswith(suffix):
            s = s[: -len(suffix)].strip()
            break
    try:
        value = float(s)
    except ValueError:
        return None
    if not valid_minutes(value):  # also rejects nan/inf
        return None
    return int(value) if value.is_integer() else round(value, 2)


def format_minutes(minutes: float) -> str:
    return f"{minutes:g}"


def load(path: str = None) -> Settings:
    """Load settings; any missing/invalid field falls back to its default."""
    settings = Settings()
    try:
        with open(path or settings_path(), "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return settings
    if not isinstance(data, dict):
        return settings
    if valid_minutes(data.get("minutes")):
        settings.minutes = data["minutes"]
    if data.get("mode") in MODES:
        settings.mode = data["mode"]
    if isinstance(data.get("sound"), bool):
        settings.sound = data["sound"]
    return settings


def save(settings: Settings, path: str = None) -> bool:
    """Write settings atomically. Returns False (never raises) on failure."""
    path = path or settings_path()
    tmp = path + ".tmp"
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(asdict(settings), f, indent=2)
        os.replace(tmp, path)
        return True
    except OSError:
        return False
