# Inactivity Alarm - (c) 2026 IMPS. All rights reserved. Made by Ishant.
# Fingerprint: IMPS-IA-E91E8AB6F47B4248 - see LICENSE.
"""Inactivity Alarm - plays an alarm after N minutes without keyboard/mouse input."""

import argparse
import ctypes
import queue
import sys
import tkinter as tk
from datetime import datetime, timedelta
from tkinter import messagebox, ttk

import config
from alarm import Alarm, asset_path
from inactivity_monitor import ALARM, RESUMED, InactivityMonitor

try:  # tray support is optional - the app works without it
    import pystray
    from PIL import Image
except Exception:  # pragma: no cover
    pystray = None

TICK_MS = 1000          # idle polling interval while monitoring
COMMAND_POLL_MS = 200   # how often tray commands are picked up on the Tk thread

BG = "#f4f5f7"
FG = "#1f2937"
MUTED = "#6b7280"
CARD = {  # state -> (background, foreground)
    "off": ("#e5e7eb", "#374151"),
    "on": ("#16a34a", "#ffffff"),
    "alarm": ("#dc2626", "#ffffff"),
}
FONT = "Segoe UI"
HINT = "Pick a preset or type your own (e.g. 3 or 1.5), then press Enter"


def format_duration(seconds: float) -> str:
    s = int(seconds)
    h, rem = divmod(s, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


class Tray:
    """System-tray icon. Its callbacks run on pystray's thread, so they only
    push commands onto a queue that the Tk main thread drains."""

    def __init__(self, commands: "queue.Queue[str]"):
        self.icon = None
        self.monitoring = False  # mirrored from the app so the menu text is right
        if pystray is None:
            return
        try:
            image = Image.open(asset_path("icon.ico")).convert("RGBA")
            menu = pystray.Menu(
                pystray.MenuItem("Open Inactivity Alarm", lambda: commands.put("show"), default=True),
                pystray.MenuItem(lambda item: "Stop monitoring" if self.monitoring else "Start monitoring",
                                 lambda: commands.put("toggle")),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("Quit", lambda: commands.put("quit")),
            )
            self.icon = pystray.Icon("InactivityAlarm", image, config.APP_NAME, menu)
            self.icon.run_detached()
        except Exception:
            self.icon = None

    @property
    def available(self) -> bool:
        return self.icon is not None

    def set_state(self, text: str, monitoring: bool) -> None:
        """Update the hover tooltip and the Start/Stop menu item."""
        if not self.icon:
            return
        try:
            self.icon.title = text
            if monitoring != self.monitoring:
                self.monitoring = monitoring
                self.icon.update_menu()
        except Exception:
            pass

    def notify(self, message: str) -> None:
        if self.icon:
            try:
                self.icon.notify(message, config.APP_NAME)
            except Exception:
                pass

    def stop(self) -> None:
        if self.icon:
            try:
                self.icon.stop()
            except Exception:
                pass
            self.icon = None


class App:
    def __init__(self, root, monitor, alarm, settings, tray, commands):
        self.root = root
        self.monitor = monitor
        self.alarm = alarm
        self.settings = settings
        self.tray = tray
        self.commands = commands
        self.alarm_active = False
        self.error = None
        self.idle = None
        self._tick_id = None
        self._cmd_id = None
        self._topmost_id = None
        self._closed = False
        self._hint_shown = False
        self.show_event = None  # set by main(): signalled when the app is launched again

        self.scale = root.winfo_fpixels("1i") / 96.0
        self.minutes_var = tk.StringVar(value=config.format_minutes(settings.minutes))
        self.mode_var = tk.StringVar(value=settings.mode)
        self.sound_var = tk.BooleanVar(value=settings.sound)

        self._build_ui()
        self._render()
        root.protocol("WM_DELETE_WINDOW", self.close_window)
        root.bind("<Unmap>", self._on_unmap)
        self._cmd_id = root.after(COMMAND_POLL_MS, self._poll_commands)

    # ------------------------------------------------------------------ UI
    def px(self, n: int) -> int:
        return max(1, round(n * self.scale))

    def _build_ui(self):
        root = self.root
        root.title(config.APP_NAME)
        root.configure(bg=BG)
        root.resizable(False, False)
        try:
            root.iconbitmap(default=asset_path("icon.ico"))
        except tk.TclError:
            pass

        style = ttk.Style(root)
        style.theme_use("clam")
        style.configure(".", background=BG, foreground=FG, font=(FONT, 10))
        for name in ("TRadiobutton", "TCheckbutton"):
            style.configure(name, background=BG, indicatorsize=self.px(13), indicatormargin=(0, 0, self.px(6), 0))
        style.map("TRadiobutton", background=[("active", BG)])
        style.map("TCheckbutton", background=[("active", BG)])
        root.option_add("*TCombobox*Listbox.font", (FONT, 10))

        p = self.px
        main = tk.Frame(root, bg=BG, padx=p(20), pady=p(16))
        main.pack(fill="both", expand=True)

        tk.Label(main, text=config.APP_NAME, bg=BG, fg=FG,
                 font=(FONT, 15, "bold")).pack(anchor="w")

        # Large status indicator
        self.card = tk.Frame(main, padx=p(16), pady=p(12))
        self.card.pack(fill="x", pady=(p(10), p(12)))
        self.status_label = tk.Label(self.card, font=(FONT, 20, "bold"), width=15)
        self.status_label.pack()
        self.sub_label = tk.Label(self.card, font=(FONT, 9), wraplength=p(300))
        self.sub_label.pack()

        # Idle counter + last activity
        stats = tk.Frame(main, bg=BG)
        stats.pack(fill="x")
        stats.columnconfigure((0, 1), weight=1, uniform="stats")
        for col, title in enumerate(("Idle for", "Last activity")):
            tk.Label(stats, text=title, bg=BG, fg=MUTED, font=(FONT, 9)).grid(row=0, column=col)
        self.idle_label = tk.Label(stats, text="--:--", bg=BG, fg=FG, font=(FONT, 18, "bold"))
        self.idle_label.grid(row=1, column=0)
        self.last_label = tk.Label(stats, text="--", bg=BG, fg=FG, font=(FONT, 18, "bold"))
        self.last_label.grid(row=1, column=1)

        ttk.Separator(main).pack(fill="x", pady=p(12))

        # Settings
        row = tk.Frame(main, bg=BG)
        row.pack(fill="x")
        tk.Label(row, text="Alert after", bg=BG, fg=FG, font=(FONT, 10)).pack(side="left")
        self.minutes_box = ttk.Combobox(row, textvariable=self.minutes_var, width=5,
                                        values=[str(m) for m in config.PRESET_MINUTES])
        self.minutes_box.pack(side="left", padx=p(6))
        tk.Label(row, text="minutes of inactivity", bg=BG, fg=FG, font=(FONT, 10)).pack(side="left")
        for seq in ("<<ComboboxSelected>>", "<Return>", "<KP_Enter>", "<FocusOut>"):
            self.minutes_box.bind(seq, self._apply_minutes)
        self.hint_label = tk.Label(main, text=HINT, bg=BG, fg=MUTED, font=(FONT, 8))
        self.hint_label.pack(anchor="w")

        ttk.Radiobutton(main, text="Alert once", value=config.MODE_ONCE,
                        variable=self.mode_var, command=self._save_settings).pack(anchor="w", pady=(p(8), 0))
        ttk.Radiobutton(main, text="Keep alarming until I'm active", value=config.MODE_CONTINUOUS,
                        variable=self.mode_var, command=self._save_settings).pack(anchor="w")
        sound_row = tk.Frame(main, bg=BG)
        sound_row.pack(fill="x", pady=(p(4), 0))
        ttk.Checkbutton(sound_row, text="Alarm sound enabled", variable=self.sound_var,
                        command=self._on_sound_toggle).pack(side="left")
        tk.Button(sound_row, text="▶  Test sound", command=self.alarm.preview,
                  font=(FONT, 9), bg="#e5e7eb", fg=FG, activebackground="#d1d5db",
                  relief="flat", bd=0, cursor="hand2", padx=p(10), pady=p(2)).pack(side="right")

        # Buttons
        self.toggle_btn = tk.Button(main, command=self.toggle_monitoring, font=(FONT, 11, "bold"),
                                    fg="white", relief="flat", bd=0, cursor="hand2", pady=p(8))
        self.toggle_btn.pack(fill="x", pady=(p(14), 0))
        self.dismiss_btn = tk.Button(main, text="Dismiss Alarm", command=self._stop_alarm,
                                     font=(FONT, 11, "bold"), bg=CARD["alarm"][0], fg="white",
                                     activebackground="#b91c1c", activeforeground="white",
                                     relief="flat", bd=0, cursor="hand2", pady=p(8))
        # dismiss_btn is only packed while an alarm is active

        # Ownership credit (always last in the window)
        self.credit_label = tk.Label(root, text=f"Made by {config.AUTHOR}  ·  © 2026 {config.PUBLISHER}"
                                          f"  ·  v{config.APP_VERSION}",
                                     bg=BG, fg=MUTED, font=(FONT, 8))
        self.credit_label.pack(side="bottom", pady=(0, p(8)))

    def _render(self):
        """Refresh status card, buttons and tray tooltip from current state."""
        minutes = self.monitor.threshold / 60 if self.monitor.running else None
        if self.alarm_active:
            state, title = "alarm", "ALARM"
            sub = f"No activity for {config.format_minutes(minutes)} min"
        elif self.monitor.running:
            state, title = "on", "MONITORING"
            sub = f"Alarm after {config.format_minutes(minutes)} min of inactivity"
        else:
            state, title = "off", "NOT MONITORING"
            sub = "Press Start Monitoring to begin"
        if self.error:
            sub = f"Can't read input state: {self.error}"
        bg, fg = CARD[state]
        self.card.configure(bg=bg)
        self.status_label.configure(text=title, bg=bg, fg=fg)
        self.sub_label.configure(text=sub, bg=bg, fg=fg)

        if self.monitor.running:
            self.toggle_btn.configure(text="Stop Monitoring", bg="#374151", activebackground="#1f2937")
        else:
            self.toggle_btn.configure(text="Start Monitoring", bg="#2563eb", activebackground="#1d4ed8")
            self.idle_label.configure(text="--:--")
            self.last_label.configure(text="--")

        if self.alarm_active:
            self.dismiss_btn.pack(fill="x", pady=(self.px(8), 0))
        else:
            self.dismiss_btn.pack_forget()

        self.tray.set_state(f"{config.APP_NAME} - {title.lower()}", self.monitor.running)

    def _draw_counters(self):
        if self.idle is None or not self.monitor.running:
            return
        self.idle_label.configure(text=format_duration(self.idle))
        last = datetime.now() - timedelta(seconds=self.idle)
        self.last_label.configure(text=last.strftime("%H:%M:%S"))

    # ----------------------------------------------------------- monitoring
    def toggle_monitoring(self):
        if self.monitor.running:
            self.stop_monitoring()
        else:
            self.start_monitoring()

    def start_monitoring(self):
        minutes = self._read_minutes()
        if minutes is None:
            return
        self.settings.minutes = minutes
        self._save_settings()
        self.error = None
        self.monitor.start(minutes * 60)
        self._render()
        self._tick()

    def stop_monitoring(self):
        if self._tick_id:
            self.root.after_cancel(self._tick_id)
            self._tick_id = None
        self.monitor.stop()
        self._stop_alarm()
        self.idle = None
        self.error = None
        self._render()

    def _tick(self):
        self._tick_id = None
        reading = self.monitor.poll()
        if reading.error != self.error:
            self.error = reading.error
            self._render()
        if reading.event == ALARM:
            self._on_alarm()
        elif reading.event == RESUMED:
            self._stop_alarm()
        if reading.idle is not None:
            self.idle = reading.idle
            if self.root.state() == "normal":
                self._draw_counters()
        if self.monitor.running:
            self._tick_id = self.root.after(TICK_MS, self._tick)

    def _on_alarm(self):
        if self.alarm_active:
            return
        self.alarm_active = True
        if self.sound_var.get():
            self.alarm.start(loop=self.mode_var.get() == config.MODE_CONTINUOUS)
        self._render()
        self._bring_to_front()
        self.tray.notify(f"No keyboard or mouse activity for {self.monitor.threshold / 60:g} minutes.")

    def _stop_alarm(self):
        self.alarm.stop()
        if self.alarm_active:
            self.alarm_active = False
            self._render()

    def _on_sound_toggle(self):
        if not self.sound_var.get():
            self.alarm.stop()
        self._save_settings()

    # -------------------------------------------------------------- helpers
    def _read_minutes(self):
        """Parse the duration box; on bad input show a red hint and revert."""
        minutes = config.parse_minutes(self.minutes_var.get())
        if minutes is None:
            self.hint_label.configure(
                text=f"Enter a number of minutes from {config.MIN_MINUTES:g} to {config.MAX_MINUTES}",
                fg=CARD["alarm"][0])
            self.minutes_var.set(config.format_minutes(self.settings.minutes))
            return None
        self.hint_label.configure(text=HINT, fg=MUTED)
        self.minutes_var.set(config.format_minutes(minutes))
        return minutes

    def _apply_minutes(self, event=None):
        """Apply a new duration immediately - also while monitoring."""
        minutes = self._read_minutes()
        if minutes is None or minutes == self.settings.minutes:
            return
        self.settings.minutes = minutes
        self._save_settings()
        if self.monitor.running:
            self.monitor.set_threshold(minutes * 60)
            self._render()

    def _save_settings(self):
        self.settings.mode = self.mode_var.get()
        self.settings.sound = bool(self.sound_var.get())
        config.save(self.settings)

    def _bring_to_front(self):
        self.show()
        self.root.attributes("-topmost", True)
        if self._topmost_id:
            self.root.after_cancel(self._topmost_id)
        self._topmost_id = self.root.after(2000, self._clear_topmost)

    def _clear_topmost(self):
        self._topmost_id = None
        self.root.attributes("-topmost", False)

    def show(self):
        if self.root.state() != "normal":
            self.root.deiconify()
        self.root.lift()
        try:
            self.root.focus_force()
        except tk.TclError:
            pass
        self._draw_counters()

    def hide(self):
        """Hide to tray if available, otherwise minimize to the taskbar."""
        if self.tray.available:
            self.root.withdraw()
        else:
            self.root.iconify()

    def _on_unmap(self, event):
        # Minimize button -> hide to the system tray instead of the taskbar
        if event.widget is self.root and self.tray.available and self.root.state() == "iconic":
            self.root.withdraw()

    def close_window(self):
        """Window X: keep running in the background (tray). Quit only via the tray menu."""
        if not self.tray.available:
            self.quit()  # no tray icon -> nowhere to live, so really exit
            return
        self.root.withdraw()
        if not self._hint_shown:
            self._hint_shown = True
            self.tray.notify("Still running in the background. Right-click the tray icon "
                             "to open it or quit.")

    def _poll_commands(self):
        self._cmd_id = None
        if self.show_event is not None and _event_is_set(self.show_event):
            self.show()  # someone launched the app again -> bring up this window
        try:
            while True:
                cmd = self.commands.get_nowait()
                if cmd == "show":
                    self.show()
                elif cmd == "toggle":
                    self.toggle_monitoring()
                elif cmd == "quit":
                    self.quit()
                    return
        except queue.Empty:
            pass
        self._cmd_id = self.root.after(COMMAND_POLL_MS, self._poll_commands)

    def quit(self):
        if self._closed:
            return
        self._closed = True
        for job in (self._tick_id, self._cmd_id, self._topmost_id):
            if job:
                self.root.after_cancel(job)
        self.monitor.stop()
        self.alarm.stop()
        self._save_settings()
        self.tray.stop()
        self.root.destroy()


# ------------------------------------------------------------------ startup
# Single instance: a named mutex says "already running"; a named event lets a
# second launch ask the running copy to show its window, then exit.
MUTEX_NAME = "Local\\InactivityAlarm.SingleInstance"
SHOW_EVENT_NAME = "Local\\InactivityAlarm.Show"
_instance_mutex = None

try:
    from ctypes import wintypes
    _k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    _k32.CreateMutexW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.LPCWSTR]
    _k32.CreateMutexW.restype = wintypes.HANDLE
    _k32.CreateEventW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.BOOL, wintypes.LPCWSTR]
    _k32.CreateEventW.restype = wintypes.HANDLE
    _k32.OpenEventW.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.LPCWSTR]
    _k32.OpenEventW.restype = wintypes.HANDLE
    _k32.SetEvent.argtypes = [wintypes.HANDLE]
    _k32.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    _k32.WaitForSingleObject.restype = wintypes.DWORD
    _k32.CloseHandle.argtypes = [wintypes.HANDLE]
except Exception:  # pragma: no cover - non-Windows
    _k32 = None


def already_running() -> bool:
    """Named mutex so only one copy runs per user session."""
    global _instance_mutex
    if _k32 is None:
        return False
    _instance_mutex = _k32.CreateMutexW(None, False, MUTEX_NAME)
    return ctypes.get_last_error() == 183  # ERROR_ALREADY_EXISTS


def create_show_event():
    """Auto-reset event the running copy watches (None if unavailable)."""
    if _k32 is None:
        return None
    return _k32.CreateEventW(None, False, False, SHOW_EVENT_NAME) or None


def signal_running_instance() -> bool:
    """Ask the already-running copy to show its window. True on success."""
    if _k32 is None:
        return False
    handle = _k32.OpenEventW(0x0002, False, SHOW_EVENT_NAME)  # EVENT_MODIFY_STATE
    if not handle:
        return False
    ok = bool(_k32.SetEvent(handle))
    _k32.CloseHandle(handle)
    return ok


def _event_is_set(handle) -> bool:
    return _k32.WaitForSingleObject(handle, 0) == 0  # WAIT_OBJECT_0 (auto-resets)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Alarm after keyboard/mouse inactivity.")
    parser.add_argument("--minimized", action="store_true", help="start hidden in the system tray")
    parser.add_argument("--start", action="store_true", help="start monitoring immediately")
    args = parser.parse_args(argv)

    try:  # crisp text on high-DPI screens
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        pass

    if already_running():
        # Launched again (e.g. from the Start Menu) -> open the running copy's window
        if not signal_running_instance():
            root = tk.Tk()
            root.withdraw()
            messagebox.showinfo(config.APP_NAME,
                                "Inactivity Alarm is already running.\nLook for its icon in the system tray.")
            root.destroy()
        return 0

    show_event = create_show_event()
    root = tk.Tk()
    commands = queue.Queue()
    app = App(root, InactivityMonitor(), Alarm(), config.load(), Tray(commands), commands)
    app.show_event = show_event
    if args.start:
        app.start_monitoring()
    if args.minimized:
        app.hide()
    try:
        root.mainloop()
    except KeyboardInterrupt:
        pass
    finally:
        app.tray.stop()
        app.alarm.stop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
