import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config  # noqa: E402
from inactivity_monitor import (ALARM, RESUMED, IdleDetectionError,  # noqa: E402
                                InactivityMonitor, get_idle_seconds, tick_diff_ms)


class FakeIdle:
    def __init__(self):
        self.value = 0.0
        self.fail = False

    def __call__(self):
        if self.fail:
            raise IdleDetectionError("boom")
        return self.value


class TickDiffTests(unittest.TestCase):
    def test_normal(self):
        self.assertEqual(tick_diff_ms(5000, 2000), 3000)

    def test_wraparound(self):
        # last input just before the 32-bit counter wrapped, now just after
        self.assertEqual(tick_diff_ms(500, 0xFFFFFFFF - 499), 1000)

    def test_input_newer_than_now_is_zero(self):
        # race: input arrived between GetLastInputInfo and GetTickCount
        self.assertEqual(tick_diff_ms(1000, 1010), 0)
        self.assertEqual(tick_diff_ms(5, 0xFFFFFFFF), 6)  # still a real wrap

    def test_real_api_returns_number(self):
        if sys.platform != "win32":
            self.skipTest("Windows only")
        idle = get_idle_seconds()
        self.assertGreaterEqual(idle, 0.0)


class MonitorTests(unittest.TestCase):
    def setUp(self):
        self.idle = FakeIdle()
        self.mon = InactivityMonitor(self.idle)

    def events(self, values):
        out = []
        for v in values:
            self.idle.value = v
            out.append(self.mon.poll().event)
        return out

    def test_no_events_when_stopped(self):
        self.assertEqual(self.events([0, 100, 1000]), [None, None, None])

    def test_fires_once_at_threshold(self):
        self.mon.start(60)
        self.assertEqual(self.events([10, 59.9, 60, 61, 120, 600]),
                         [None, None, ALARM, None, None, None])

    def test_resume_and_rearm(self):
        self.mon.start(60)
        self.assertEqual(self.events([60, 70, 0.5, 30, 60, 61]),
                         [ALARM, None, RESUMED, None, ALARM, None])

    def test_activity_before_threshold_never_fires(self):
        self.mon.start(60)
        self.assertEqual(self.events([50, 0.2, 50, 0.3, 59]), [None] * 5)

    def test_stop_resets_latch(self):
        self.mon.start(60)
        self.events([60])
        self.mon.stop()
        self.assertEqual(self.events([100]), [None])
        self.mon.start(60)
        self.assertEqual(self.events([100]), [ALARM])  # already idle -> fires on start

    def test_change_threshold_while_running(self):
        self.mon.start(600)
        self.assertEqual(self.events([120]), [None])
        self.mon.set_threshold(60)       # lowered below current idle -> fires
        self.assertEqual(self.events([121]), [ALARM])
        self.mon.set_threshold(300)      # raised above idle -> alarm ends
        self.assertEqual(self.events([122, 300]), [RESUMED, ALARM])

    def test_error_reported_without_alarm(self):
        self.mon.start(60)
        self.idle.fail = True
        r = self.mon.poll()
        self.assertIsNone(r.idle)
        self.assertIsNone(r.event)
        self.assertEqual(r.error, "boom")
        self.idle.fail = False
        self.assertEqual(self.events([60]), [ALARM])


class ConfigTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.dir.name, "sub", "settings.json")

    def tearDown(self):
        self.dir.cleanup()

    def test_missing_file_gives_defaults(self):
        self.assertEqual(config.load(self.path), config.Settings())

    def test_parse_minutes(self):
        ok = {"7": 7, " 7 ": 7, "7 min": 7, "7min": 7, "10 minutes": 10, "1.5": 1.5,
              "2,5": 2.5, "0.5": 0.5, "999": 999, "5.0": 5}
        for text, expected in ok.items():
            self.assertEqual(config.parse_minutes(text), expected, text)
        for text in ("", "abc", "0", "0.2", "-3", "1000", "nan", "inf", "5 hours"):
            self.assertIsNone(config.parse_minutes(text), text)

    def test_round_trip(self):
        s = config.Settings(minutes=1.5)
        self.assertTrue(config.save(s, self.path))
        self.assertEqual(config.load(self.path), s)
        s = config.Settings(minutes=12, mode=config.MODE_ONCE, sound=False)
        self.assertTrue(config.save(s, self.path))
        self.assertEqual(config.load(self.path), s)

    def test_corrupt_and_invalid_values(self):
        os.makedirs(os.path.dirname(self.path))
        with open(self.path, "w") as f:
            f.write("{not json")
        self.assertEqual(config.load(self.path), config.Settings())
        with open(self.path, "w") as f:
            json.dump({"minutes": 0, "mode": "weird", "sound": "yes"}, f)
        self.assertEqual(config.load(self.path), config.Settings())
        with open(self.path, "w") as f:
            json.dump({"minutes": True}, f)
        self.assertEqual(config.load(self.path).minutes, config.DEFAULT_MINUTES)


if __name__ == "__main__":
    unittest.main()
