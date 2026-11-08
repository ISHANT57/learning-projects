"""System-wide idle detection via the Windows GetLastInputInfo API.

Privacy: GetLastInputInfo only reports *when* the last keyboard/mouse input
happened. No keystrokes, mouse positions or history are ever read or stored.
"""

import sys
from dataclasses import dataclass
from typing import Callable, Optional

_TICK_MASK = 0xFFFFFFFF
_HALF_RANGE = 0x80000000

ALARM = "alarm"      # idle time just reached the threshold
RESUMED = "resumed"  # activity detected after an alarm fired


class IdleDetectionError(Exception):
    pass


def tick_diff_ms(now: int, last: int) -> int:
    """Milliseconds from `last` to `now` on the 32-bit tick counter.

    Masking handles the ~49.7-day wraparound. If input arrives between our
    GetLastInputInfo and GetTickCount calls, `last` can be slightly *ahead* of
    `now`; that would mask to ~49 days, so anything >= 2^31 is treated as 0.
    """
    diff = (now - last) & _TICK_MASK
    return 0 if diff >= _HALF_RANGE else diff


if sys.platform == "win32":
    import ctypes
    from ctypes import wintypes

    class _LASTINPUTINFO(ctypes.Structure):
        _fields_ = [("cbSize", wintypes.UINT), ("dwTime", wintypes.DWORD)]

    _user32 = ctypes.WinDLL("user32", use_last_error=True)
    _kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    _user32.GetLastInputInfo.argtypes = [ctypes.POINTER(_LASTINPUTINFO)]
    _user32.GetLastInputInfo.restype = wintypes.BOOL
    _kernel32.GetTickCount.argtypes = []
    _kernel32.GetTickCount.restype = wintypes.DWORD

    def get_idle_seconds() -> float:
        info = _LASTINPUTINFO()
        info.cbSize = ctypes.sizeof(info)
        if not _user32.GetLastInputInfo(ctypes.byref(info)):
            err = ctypes.get_last_error()
            raise IdleDetectionError(f"GetLastInputInfo failed (error {err})")
        now = _kernel32.GetTickCount()
        return tick_diff_ms(now, info.dwTime) / 1000.0

else:
    def get_idle_seconds() -> float:
        raise IdleDetectionError("Idle detection is only supported on Windows")


@dataclass(frozen=True)
class Reading:
    idle: Optional[float]          # seconds since last input, None on error
    event: Optional[str] = None    # ALARM, RESUMED or None
    error: Optional[str] = None


class InactivityMonitor:
    """Turns idle-time samples into ALARM / RESUMED events.

    The alarm fires once per idle period: the `_fired` latch is only cleared
    when idle time drops below the threshold again (i.e. the user was active).
    """

    def __init__(self, idle_source: Callable[[], float] = get_idle_seconds):
        self._idle_source = idle_source
        self.threshold = 0.0
        self.running = False
        self._fired = False

    def start(self, threshold_seconds: float) -> None:
        self.threshold = float(threshold_seconds)
        self.running = True
        self._fired = False

    def set_threshold(self, threshold_seconds: float) -> None:
        """Change the threshold while running. The next poll re-evaluates:
        a lower value may fire the alarm, a higher one may resume it."""
        self.threshold = float(threshold_seconds)

    def stop(self) -> None:
        self.running = False
        self._fired = False

    def poll(self) -> Reading:
        try:
            idle = self._idle_source()
        except IdleDetectionError as exc:
            return Reading(None, error=str(exc))
        if not self.running:
            return Reading(idle)
        if idle >= self.threshold:
            if not self._fired:
                self._fired = True
                return Reading(idle, ALARM)
        elif self._fired:
            self._fired = False
            return Reading(idle, RESUMED)
        return Reading(idle)
