# Inactivity Alarm - (c) 2026 IMPS. All rights reserved. Made by Ishant.
# Fingerprint: IMPS-IA-E91E8AB6F47B4248 - see LICENSE.
"""One-off generator for assets/alarm.wav and assets/icon.ico (needs Pillow).

The generated files are shipped in assets/, so this only needs re-running if
you want to change the sound or icon.
"""

import math
import os
import struct
import wave

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")


def make_wav(path, rate=22050):
    """Three short 880 Hz beeps followed by a pause (~1.5 s, loops cleanly)."""
    samples = []

    def tone(seconds, freq=880.0, volume=0.55):
        n = int(rate * seconds)
        fade = int(rate * 0.01)
        for i in range(n):
            env = min(1.0, i / fade, (n - i) / fade)
            samples.append(volume * env * math.sin(2 * math.pi * freq * i / rate))

    def silence(seconds):
        samples.extend([0.0] * int(rate * seconds))

    for _ in range(3):
        tone(0.15)
        silence(0.10)
    silence(0.75)

    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"".join(struct.pack("<h", int(s * 32767)) for s in samples))
    add_wav_info(path, {
        b"INAM": "Inactivity Alarm",
        b"IART": "Ishant",
        b"ICOP": "(c) 2026 IMPS. All rights reserved.",
        b"ICMT": "Fingerprint: IMPS-IA-E91E8AB6F47B4248",
    })


def add_wav_info(path, tags):
    """Append a standard RIFF LIST/INFO chunk (visible in file Properties > Details)."""
    body = b"INFO"
    for key, text in tags.items():
        data = text.encode("ascii") + b"\x00"
        if len(data) % 2:
            data += b"\x00"  # chunks are word-aligned
        body += key + struct.pack("<I", len(data)) + data
    with open(path, "r+b") as f:
        f.seek(0, 2)
        f.write(b"LIST" + struct.pack("<I", len(body)) + body)
        size = f.tell() - 8
        f.seek(4)
        f.write(struct.pack("<I", size))  # fix the RIFF size


def make_icon(path):
    size = 256
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((8, 8, size - 8, size - 8), fill=(37, 99, 235, 255))
    d.ellipse((40, 40, size - 40, size - 40), outline=(255, 255, 255, 255), width=18)
    c = size // 2
    d.line((c, c, c, 72), fill=(255, 255, 255, 255), width=18)
    d.line((c, c, 172, 150), fill=(255, 255, 255, 255), width=18)
    d.ellipse((c - 14, c - 14, c + 14, c + 14), fill=(255, 255, 255, 255))
    img.save(path, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (256, 256)])


if __name__ == "__main__":
    os.makedirs(ASSETS, exist_ok=True)
    make_wav(os.path.join(ASSETS, "alarm.wav"))
    make_icon(os.path.join(ASSETS, "icon.ico"))
    print("Wrote assets/alarm.wav and assets/icon.ico")
