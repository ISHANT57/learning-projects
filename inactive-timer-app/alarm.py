"""Non-blocking alarm sound using winsound (asynchronous PlaySound)."""

import os
import sys
import winsound


def asset_path(name: str) -> str:
    """Path to a bundled asset, both from source and from a PyInstaller exe."""
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, "assets", name)


class Alarm:
    def __init__(self, wav_path: str = None):
        self.wav_path = wav_path or asset_path("alarm.wav")
        self.playing = False

    def _play(self, loop: bool) -> None:
        flags = winsound.SND_ASYNC | (winsound.SND_LOOP if loop else 0)
        try:
            if os.path.isfile(self.wav_path):
                winsound.PlaySound(self.wav_path, winsound.SND_FILENAME | winsound.SND_NODEFAULT | flags)
            else:
                winsound.PlaySound("SystemExclamation", winsound.SND_ALIAS | flags)
        except RuntimeError:
            pass  # no audio device etc. - the visual alert still shows

    def start(self, loop: bool) -> None:
        """Start playing; ignored if already playing (no overlapping alarms)."""
        if self.playing:
            return
        self._play(loop)
        self.playing = True

    def preview(self) -> None:
        """Play the sound once so the user can hear it; never interrupts a real alarm."""
        if not self.playing:
            self._play(loop=False)

    def stop(self) -> None:
        if self.playing:
            try:
                winsound.PlaySound(None, winsound.SND_PURGE)
            except RuntimeError:
                pass
            self.playing = False
