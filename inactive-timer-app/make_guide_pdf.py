"""Render PROJECT_GUIDE.md into a polished PDF: "Inactivity Alarm - Project Guide.pdf".

Uses reportlab + Windows fonts (Segoe UI, Consolas). ASCII diagrams in the
guide are replaced by drawn diagrams; everything else comes from the Markdown,
so re-run this script after editing the guide.
"""

import io
import os
import re
from datetime import date

from PIL import Image as PILImage
from reportlab.graphics.shapes import Drawing, Line, Polygon, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, CondPageBreak, Flowable, Frame, KeepTogether,
                                NextPageTemplate, PageBreak, PageTemplate, Paragraph, Spacer,
                                Table, TableStyle, XPreformatted)
from reportlab.platypus.tableofcontents import TableOfContents

import config

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "PROJECT_GUIDE.md")
OUT = os.path.join(HERE, "Inactivity Alarm - Project Guide.pdf")

# ------------------------------------------------------------------ fonts
FONTS = "C:/Windows/Fonts/"
for name, file in [("Segoe", "segoeui.ttf"), ("Segoe-Bold", "segoeuib.ttf"),
                   ("Segoe-Italic", "segoeuii.ttf"), ("Segoe-Semi", "seguisb.ttf"),
                   ("Mono", "consola.ttf"), ("Mono-Bold", "consolab.ttf"),
                   ("Sym", "seguisym.ttf")]:
    pdfmetrics.registerFont(TTFont(name, FONTS + file))
pdfmetrics.registerFontFamily("Segoe", normal="Segoe", bold="Segoe-Bold",
                              italic="Segoe-Italic", boldItalic="Segoe-Bold")
pdfmetrics.registerFontFamily("Mono", normal="Mono", bold="Mono-Bold", italic="Mono", boldItalic="Mono-Bold")
GLYPHS = {f: pdfmetrics.getFont(f).face.charToGlyph for f in ("Segoe", "Mono")}

# ----------------------------------------------------------------- colours
BLUE = colors.HexColor("#2563eb")
BLUE_DARK = colors.HexColor("#1e3a8a")
BLUE_LIGHT = colors.HexColor("#eff6ff")
BLUE_LINE = colors.HexColor("#bfdbfe")
INK = colors.HexColor("#1f2937")
MUTED = colors.HexColor("#6b7280")
LINE = colors.HexColor("#e5e7eb")
ZEBRA = colors.HexColor("#f9fafb")
CODE_BG = colors.HexColor("#f3f4f6")
GREEN = colors.HexColor("#16a34a")
GREEN_LIGHT = colors.HexColor("#dcfce7")
RED = colors.HexColor("#dc2626")
RED_LIGHT = colors.HexColor("#fee2e2")
AMBER_LIGHT = colors.HexColor("#fef3c7")
AMBER = colors.HexColor("#b45309")

PAGE_W, PAGE_H = A4
MARGIN_X = 20 * mm
CONTENT_W = PAGE_W - 2 * MARGIN_X

# ------------------------------------------------------------------ styles
def style(name, **kw):
    base = dict(fontName="Segoe", fontSize=9.6, leading=14.2, textColor=INK, spaceAfter=5)
    base.update(kw)
    return ParagraphStyle(name, **base)

BODY = style("body")
H1 = style("h1", fontName="Segoe-Bold", fontSize=17, leading=22, spaceBefore=6, spaceAfter=2,
           keepWithNext=1)
H2 = style("h2", fontName="Segoe-Semi", fontSize=12, leading=16, textColor=BLUE_DARK,
           spaceBefore=9, spaceAfter=3, keepWithNext=1)
CELL = style("cell", fontSize=8.6, leading=11.6, spaceAfter=0)
CELL_HEAD = style("cellh", fontName="Segoe-Bold", fontSize=8.6, leading=11.6, spaceAfter=0,
                  textColor=colors.white)
CODE = style("code", fontName="Mono", fontSize=8.2, leading=11.2, textColor=INK, spaceAfter=0)
CALLOUT = style("callout", fontSize=9.6, leading=14.2, spaceAfter=0)
CAPTION = style("caption", fontSize=8, leading=10, textColor=MUTED, alignment=TA_CENTER, spaceAfter=8)
TOC_STYLES = [style("toc1", fontName="Segoe", fontSize=11, leading=20, leftIndent=0, spaceAfter=0)]

# ------------------------------------------------------------ inline markup
def sym_wrap(text, font):
    """Wrap characters the main font lacks in the symbol font."""
    glyphs = GLYPHS[font]
    return "".join(c if ord(c) < 128 or ord(c) in glyphs else f'<font name="Sym">{c}</font>' for c in text)


def esc(text):
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def inline(text, size=None):
    """Markdown inline (`code`, **bold**, *italic*) -> reportlab markup."""
    code_spans = []

    def stash(m):
        code_spans.append(m.group(1))
        return f"\x00{len(code_spans) - 1}\x00"

    text = re.sub(r"`([^`]+)`", stash, text)
    text = sym_wrap(esc(text), "Segoe")
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<i>\1</i>", text)
    code_size = f' size="{size * 0.92:.1f}"' if size else ' size="8.8"'

    def unstash(m):
        code = sym_wrap(esc(code_spans[int(m.group(1))]), "Mono")
        return f'<font name="Mono"{code_size} color="#9d174d" backColor="#f3f4f6">{code}</font>'

    return re.sub(r"\x00(\d+)\x00", unstash, text)

# ---------------------------------------------------------------- diagrams
class Diagram(Flowable):
    """Wraps a reportlab Drawing so it can be centered as a flowable."""

    def __init__(self, drawing):
        super().__init__()
        self.d = drawing
        self.width, self.height = drawing.width, drawing.height

    def wrap(self, aw, ah):
        return self.width, self.height

    def draw(self):
        self.d.drawOn(self.canv, 0, 0)


def box(d, x, y, w, h, title, sub=None, fill=BLUE_LIGHT, stroke=BLUE_LINE, title_color=INK,
        title_font="Segoe-Bold", size=9.5, sub_size=7.6):
    d.add(Rect(x, y, w, h, rx=6, ry=6, fillColor=fill, strokeColor=stroke, strokeWidth=1))
    lines = sub if isinstance(sub, list) else ([sub] if sub else [])
    total = size + len(lines) * (sub_size + 2.5)
    ty = y + h / 2 + total / 2 - size + 1
    d.add(String(x + w / 2, ty, title, fontName=title_font, fontSize=size, fillColor=title_color,
                 textAnchor="middle"))
    for i, line in enumerate(lines):
        d.add(String(x + w / 2, ty - (i + 1) * (sub_size + 2.5) - 1, line, fontName="Segoe",
                     fontSize=sub_size, fillColor=MUTED, textAnchor="middle"))


def arrow(d, x1, y1, x2, y2, color=MUTED, label=None, label_dx=4, label_dy=0, width=1.2):
    d.add(Line(x1, y1, x2, y2, strokeColor=color, strokeWidth=width))
    import math
    ang = math.atan2(y2 - y1, x2 - x1)
    s = 5.5
    p1 = (x2 - s * math.cos(ang - 0.42), y2 - s * math.sin(ang - 0.42))
    p2 = (x2 - s * math.cos(ang + 0.42), y2 - s * math.sin(ang + 0.42))
    d.add(Polygon([x2, y2, *p1, *p2], fillColor=color, strokeColor=color))
    if label:
        d.add(String((x1 + x2) / 2 + label_dx, (y1 + y2) / 2 + label_dy, label, fontName="Segoe",
                     fontSize=7.4, fillColor=MUTED))


def poly_arrow(d, points, color=MUTED, label=None, label_at=None):
    for (x1, y1), (x2, y2) in zip(points[:-2], points[1:-1]):
        d.add(Line(x1, y1, x2, y2, strokeColor=color, strokeWidth=1.2))
    arrow(d, *points[-2], *points[-1], color=color)
    if label:
        d.add(String(*label_at, label, fontName="Segoe", fontSize=7.4, fillColor=MUTED))


def diagram_architecture():
    W, H = CONTENT_W, 250
    d = Drawing(W, H)
    box(d, 40, 170, W - 80, 70, "main.py  —  the user interface",
        ["window · buttons · status card · tray icon · startup options",
         "every 1 second:  monitor.poll()  →  update the screen"], fill=BLUE, stroke=BLUE,
        title_color=colors.white, size=11)
    # recolour sub lines for contrast on blue
    for s in d.contents[-2:]:
        s.fillColor = colors.HexColor("#dbeafe")
    bw, gap = 140, (W - 3 * 140) / 2
    xs = [0, bw + gap, 2 * (bw + gap)]
    titles = [("inactivity_monitor.py", ["“How long idle?”", "+ alarm decision logic"]),
              ("alarm.py", ["play / stop the sound", "never blocks the UI"]),
              ("config.py", ["settings + constants", "saved to a JSON file"])]
    for x, (t, sub) in zip(xs, titles):
        box(d, x, 88, bw, 54, t, sub, size=9.2)
        arrow(d, x + bw / 2, 170, x + bw / 2, 143)
    box(d, 0, 6, bw, 50, "Windows API", ["GetLastInputInfo", "+ GetTickCount"],
        fill=AMBER_LIGHT, stroke=colors.HexColor("#fcd34d"), size=9.2)
    arrow(d, bw / 2, 88, bw / 2, 57)
    d.add(String(bw + 14, 28, "Only a timestamp comes back — never keys or mouse positions.",
                 fontName="Segoe-Italic", fontSize=8, fillColor=MUTED))
    return d


def diagram_start():
    W, H = CONTENT_W, 128
    d = Drawing(W, H)
    y, h = 64, 46
    box(d, 0, y, 82, h, "Read the", ["minutes box"], size=8.6)
    # decision diamond
    cx, cy, r = 128, y + h / 2, 27
    d.add(Polygon([cx, cy + r, cx + r + 6, cy, cx, cy - r, cx - r - 6, cy],
                  fillColor=AMBER_LIGHT, strokeColor=colors.HexColor("#fcd34d")))
    d.add(String(cx, cy - 3, "Valid?", fontName="Segoe-Bold", fontSize=8.6, fillColor=INK,
                 textAnchor="middle"))
    box(d, 186, y, 82, h, "Save", ["settings"], size=8.6)
    box(d, 288, y, 96, h, "monitor.start()", ["minutes × 60 sec"], size=8.6)
    box(d, 404, y, W - 404, h, "Start the", ["1-second tick"], fill=GREEN_LIGHT,
        stroke=colors.HexColor("#86efac"), size=8.6)
    arrow(d, 82, cy, cx - r - 6, cy)
    arrow(d, cx + r + 6, cy, 186, cy, label="yes", label_dx=-8, label_dy=4)
    arrow(d, 268, cy, 288, cy)
    arrow(d, 384, cy, 404, cy)
    box(d, cx - 70, 0, 140, 34, "Red hint", ["go back to last good value"], fill=RED_LIGHT,
        stroke=colors.HexColor("#fca5a5"), size=8.6)
    arrow(d, cx, cy - r, cx, 35, label="no", label_dx=4, label_dy=0)
    return d


def diagram_tick():
    W, H = CONTENT_W, 282
    d = Drawing(W, H)
    cx, bw = W / 2 - 30, 260
    x0 = cx - bw / 2
    box(d, x0, 246, bw, 34, "1.  Ask Windows", ["idle seconds = now − time of last input"])
    box(d, x0, 194, bw, 34, "2.  State machine decides", ["compare idle time with your limit"])
    arrow(d, cx, 246, cx, 229)
    ow, oy = 132, 118
    outs = [(x0 - 80, "ALARM", ["idle ≥ limit, first time", "red · sound · notify"], RED_LIGHT, "#fca5a5", RED),
            (cx - ow / 2, "RESUMED", ["you were active again", "stop sound · green"], GREEN_LIGHT, "#86efac", GREEN),
            (x0 + bw + 80 - ow, "Nothing", ["no change", "keep watching"], CODE_BG, "#d1d5db", MUTED)]
    landing = [cx - 80, cx, cx + 80]  # separate arrival points on step 3
    for (x, t, sub, fill, stroke, tc), lx_ in zip(outs, landing):
        box(d, x, oy, ow, 50, t, sub, fill=fill, stroke=colors.HexColor(stroke), title_color=tc)
        arrow(d, lx_, 194, x + ow / 2, oy + 51)
        arrow(d, x + ow / 2, oy, lx_, 95)
    box(d, x0, 60, bw, 34, "3.  Update the screen", ["“Idle for” + “Last activity” (only if visible)"])
    box(d, x0, 6, bw, 34, "4.  Schedule next tick", ["root.after(1000, tick) — only while monitoring"],
        fill=BLUE, stroke=BLUE, title_color=colors.white)
    d.contents[-1].fillColor = colors.HexColor("#dbeafe")
    arrow(d, cx, 60, cx, 41)
    # loop back
    lx = x0 + bw + 100
    poly_arrow(d, [(x0 + bw, 23), (lx + 20, 23), (lx + 20, 263), (x0 + bw + 1, 263)], color=BLUE,
               label="every 1 second", label_at=(lx + 25, 140))
    return d


def diagram_state():
    W, H = CONTENT_W, 120
    d = Drawing(W, H)
    bw, bh, y = 130, 46, 37
    lx, rx = 40, W - 40 - bw
    box(d, lx, y, bw, bh, "WATCHING", ["waiting for idle time"], fill=GREEN_LIGHT,
        stroke=colors.HexColor("#86efac"), title_color=GREEN, size=11)
    box(d, rx, y, bw, bh, "FIRED", ["alarm is on (latched)"], fill=RED_LIGHT,
        stroke=colors.HexColor("#fca5a5"), title_color=RED, size=11)
    poly_arrow(d, [(lx + bw / 2, y + bh), (lx + bw / 2, 108), (rx + bw / 2, 108), (rx + bw / 2, y + bh + 1)],
               color=RED, label="idle ≥ limit   →   ALARM event", label_at=(W / 2 - 62, 112))
    poly_arrow(d, [(rx + bw / 2, y), (rx + bw / 2, 10), (lx + bw / 2, 10), (lx + bw / 2, y - 1)],
               color=GREEN, label="idle < limit   →   RESUMED event", label_at=(W / 2 - 66, 0))
    return d


def diagram_build_full():
    W, H = CONTENT_W, 300
    d = Drawing(W, H)
    cx = W / 2
    box(d, cx - 115, 252, 230, 40, "Python source + assets/", ["main.py · monitor · alarm · config · icon · wav"])
    box(d, cx - 80, 194, 160, 36, "build.py", ["run with  build.bat"], fill=BLUE, stroke=BLUE,
        title_color=colors.white)
    d.contents[-1].fillColor = colors.HexColor("#dbeafe")
    arrow(d, cx, 252, cx, 231)
    lw = 205
    lx, rx = 0, W - lw
    box(d, lx, 128, lw, 44, "PyInstaller  --onefile", ["one .exe that unpacks itself on launch"])
    box(d, rx, 128, lw, 44, "PyInstaller  --onedir", ["a folder: exe + Python, Tk, DLLs"])
    arrow(d, cx - 40, 194, lx + lw / 2, 173)
    arrow(d, cx + 40, 194, rx + lw / 2, 173)
    box(d, rx, 64, lw, 40, "Inno Setup", ["ISCC.exe + installer.iss"], fill=AMBER_LIGHT,
        stroke=colors.HexColor("#fcd34d"))
    arrow(d, rx + lw / 2, 128, rx + lw / 2, 105)
    box(d, lx, 0, lw, 44, "Portable .exe", ["release\\InactivityAlarm-Portable-x.y.z.exe"],
        fill=GREEN_LIGHT, stroke=colors.HexColor("#86efac"), title_color=GREEN)
    arrow(d, lx + lw / 2, 128, lx + lw / 2, 45)
    box(d, rx, 0, lw, 44, "Setup .exe  (installer)", ["release\\InactivityAlarm-Setup-x.y.z.exe"],
        fill=GREEN_LIGHT, stroke=colors.HexColor("#86efac"), title_color=GREEN)
    arrow(d, rx + lw / 2, 64, rx + lw / 2, 45)
    d.add(String(cx, 18, "share", fontName="Segoe-Italic", fontSize=8, fillColor=MUTED,
                 textAnchor="middle"))
    d.add(String(cx, 8, "either file", fontName="Segoe-Italic", fontSize=8, fillColor=MUTED,
                 textAnchor="middle"))
    return d


DIAGRAMS = [  # (marker found in the ASCII block, builder, caption)
    ("main.py  (the UI)", diagram_architecture, "How the four Python files work together"),
    ("read the minutes box", diagram_start, "What happens when you click Start Monitoring"),
    ("schedule the next tick", diagram_tick, "The 1-second tick: the heart of the app"),
    ("WATCHING", diagram_state, "The alarm state machine with its “fires once” latch"),
    ("PyInstaller --onefile", diagram_build_full, "From source code to shareable release files"),
]

# -------------------------------------------------------------- flowables
def code_block(text):
    body = sym_wrap(esc(text.rstrip("\n")), "Mono")
    pre = XPreformatted(body, CODE)
    t = Table([[pre]], colWidths=[CONTENT_W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CODE_BG),
        ("LINEBEFORE", (0, 0), (0, -1), 2.5, BLUE),
        ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return [t, Spacer(1, 7)]


def callout(text, fill=BLUE_LIGHT, bar=BLUE):
    t = Table([[Paragraph(inline(text), CALLOUT)]], colWidths=[CONTENT_W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), fill),
        ("LINEBEFORE", (0, 0), (0, -1), 3, bar),
        ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return [t, Spacer(1, 8)]


def table_block(rows):
    ncol = len(rows[0])
    plain = [[re.sub(r"[`*]", "", c) for c in r] for r in rows]
    weights = [min(max(max(len(r[i]) for r in plain), 10), 70) for i in range(ncol)]
    # each column is at least as wide as its longest unbreakable word
    min_w = [max(pdfmetrics.stringWidth(tok, "Mono-Bold", 8.4) for r in plain
                 for tok in (r[i].split() or [""])) + 14 for i in range(ncol)]
    widths = [CONTENT_W * w / sum(weights) for w in weights]
    for _ in range(ncol):
        short = [i for i in range(ncol) if widths[i] < min_w[i]]
        if not short:
            break
        for i in short:
            widths[i] = min_w[i]
        free = [i for i in range(ncol) if i not in short]
        spare = CONTENT_W - sum(widths[i] for i in short)
        fw = sum(weights[i] for i in free) or 1
        for i in free:
            widths[i] = spare * weights[i] / fw
    data = [[Paragraph(inline(c, size=8.6), CELL_HEAD) for c in rows[0]]]
    data += [[Paragraph(inline(c, size=8.6), CELL) for c in r] for r in rows[1:]]
    t = Table(data, colWidths=widths, repeatRows=1)
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), BLUE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 4.5),
    ]
    for i in range(2, len(data), 2):
        cmds.append(("BACKGROUND", (0, i), (-1, i), ZEBRA))
    t.setStyle(TableStyle(cmds))
    return [t, Spacer(1, 9)]


def bullet_list(items):
    out = []
    for level, ordered, num, text in items:
        indent = 14 + level * 14
        bullet = f"{num}." if ordered else ("•" if level == 0 else "–")
        st = style(f"li{level}", leftIndent=indent, bulletIndent=indent - 11, spaceAfter=2.5,
                   bulletFontName="Segoe-Bold" if ordered else "Segoe", bulletColor=BLUE)
        out.append(Paragraph(inline(text), st, bulletText=bullet))
    out.append(Spacer(1, 4))
    return out


class Heading(Paragraph):
    """Section heading that registers itself in the table of contents/outline."""

    def __init__(self, text, plain):
        super().__init__(text, H1)
        self.plain = plain

# ----------------------------------------------------------------- parser
def parse(md):
    lines = md.splitlines()
    story, i = [], 0
    title, intro = None, []
    para, items = [], []

    def flush_para():
        nonlocal para
        if para:
            text = " ".join(s.strip() for s in para)
            if text.startswith(("**Golden rule", "**Why test")):
                story.extend(callout(text))
            else:
                story.append(Paragraph(inline(text), BODY))
            para = []

    def flush_items():
        nonlocal items
        if items:
            story.extend(bullet_list(items))
            items = []

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if line.startswith("# ") and title is None:
            title = line[2:].strip()
            i += 1
            while i < len(lines) and not lines[i].startswith("---"):
                if lines[i].strip():
                    intro.append(lines[i].strip())
                i += 1
            continue
        if stripped.startswith("```"):
            flush_para(); flush_items()
            block = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                block.append(lines[i])
                i += 1
            text = "\n".join(block)
            for marker, builder, caption in DIAGRAMS:
                if marker in text:
                    group = [Spacer(1, 4), Diagram(builder()), Spacer(1, 5), Paragraph(caption, CAPTION)]
                    # keep a sub-heading on the same page as its diagram
                    if story and isinstance(story[-1], Paragraph) and story[-1].style is H2:
                        group.insert(0, story.pop())
                    story.append(KeepTogether(group))
                    break
            else:
                story.extend(code_block(text))
            i += 1
            continue
        if stripped.startswith("|"):
            flush_para(); flush_items()
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{3,}:?", c) for c in cells):
                    rows.append(cells)
                i += 1
            story.extend(table_block(rows))
            continue
        m = re.match(r"^(\s*)([-*]|\d+\.)\s+(.*)$", line)
        if m:
            flush_para()
            level = len(m.group(1)) // 2
            ordered = m.group(2)[0].isdigit()
            items.append((min(level, 2), ordered, m.group(2).rstrip("."), m.group(3)))
            i += 1
            continue
        if items and line.startswith("   ") and stripped:
            # continuation of a list item
            lvl, o, n, t = items[-1]
            items[-1] = (lvl, o, n, t + " " + stripped)
            i += 1
            continue
        if line.startswith("## "):
            flush_para(); flush_items()
            text = line[3:].strip()
            mnum = re.match(r"(\d+)\.\s+(.*)", text)
            num, name = (mnum.group(1), mnum.group(2)) if mnum else ("", text)
            story.append(CondPageBreak(45 * mm))
            label = (f'<font color="#2563eb">{int(num):02d}</font>&nbsp;&nbsp;' if num else "") + inline(name)
            story.append(Heading(label, f"{num}.  {name}" if num else name))
            story.append(HRule())
            i += 1
            continue
        if line.startswith("### "):
            flush_para(); flush_items()
            story.append(Paragraph(inline(line[4:].strip()), H2))
            i += 1
            continue
        if stripped == "---":
            flush_para(); flush_items()
            i += 1
            continue
        if not stripped:
            flush_para(); flush_items()
            i += 1
            continue
        flush_items()
        para.append(line)
        i += 1
    flush_para(); flush_items()
    return title, " ".join(intro), story


class HRule(Flowable):
    def wrap(self, aw, ah):
        self.aw = aw
        return aw, 9

    def draw(self):
        self.canv.setStrokeColor(BLUE)
        self.canv.setLineWidth(2)
        self.canv.line(0, 5, 34, 5)
        self.canv.setStrokeColor(LINE)
        self.canv.setLineWidth(0.8)
        self.canv.line(36, 5, self.aw, 5)

# ------------------------------------------------------------- doc / pages
def icon_reader():
    img = PILImage.open(os.path.join(HERE, "assets", "icon.ico"))
    img.size = max(img.ico.sizes())
    buf = io.BytesIO()
    img.convert("RGBA").save(buf, "PNG")
    buf.seek(0)
    return ImageReader(buf)


class GuideDoc(BaseDocTemplate):
    def __init__(self, path, title, intro):
        super().__init__(path, pagesize=A4, leftMargin=MARGIN_X, rightMargin=MARGIN_X,
                         topMargin=24 * mm, bottomMargin=20 * mm, title=f"{title}",
                         author=config.PUBLISHER, subject="How the Inactivity Alarm app works",
                         creator="make_guide_pdf.py")
        self.guide_title, self.intro, self.icon = title, intro, icon_reader()
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="f",
                      leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates([PageTemplate("cover", [frame], onPage=self.draw_cover),
                               PageTemplate("body", [frame], onPage=self.draw_body)])

    def afterFlowable(self, flowable):
        if isinstance(flowable, Heading):
            key = f"h{id(flowable)}"
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(flowable.plain, key, level=0)
            self.notify("TOCEntry", (0, flowable.plain, self.page - 1, key))  # cover is unnumbered

    def draw_cover(self, c, doc):
        c.saveState()
        band = PAGE_H * 0.56
        c.setFillColor(BLUE)
        c.rect(0, PAGE_H - band, PAGE_W, band, stroke=0, fill=1)
        c.setFillColor(BLUE_DARK)
        c.rect(0, PAGE_H - band, PAGE_W, 6, stroke=0, fill=1)
        # soft decorative circles
        c.setFillColor(colors.Color(1, 1, 1, alpha=0.06))
        c.circle(PAGE_W - 40 * mm, PAGE_H - 50 * mm, 70 * mm, stroke=0, fill=1)
        c.circle(PAGE_W - 10 * mm, PAGE_H - 125 * mm, 40 * mm, stroke=0, fill=1)
        # icon on a white rounded tile so it stands out on the blue band
        c.setFillColor(colors.white)
        c.roundRect(MARGIN_X, PAGE_H - 72 * mm, 32 * mm, 32 * mm, 7 * mm, stroke=0, fill=1)
        c.drawImage(self.icon, MARGIN_X + 4 * mm, PAGE_H - 68 * mm, 24 * mm, 24 * mm, mask="auto")
        c.setFillColor(colors.HexColor("#dbeafe"))
        c.setFont("Segoe-Semi", 12)
        c.drawString(MARGIN_X, PAGE_H - 88 * mm, "PROJECT GUIDE")
        c.setFillColor(colors.white)
        c.setFont("Segoe-Bold", 40)
        c.drawString(MARGIN_X, PAGE_H - 106 * mm, config.APP_NAME)
        c.setFont("Segoe", 13.5)
        c.setFillColor(colors.HexColor("#dbeafe"))
        c.drawString(MARGIN_X, PAGE_H - 118 * mm, "What it does, how it works, the technology behind it —")
        c.drawString(MARGIN_X, PAGE_H - 125 * mm, "and every concept explained in simple words.")
        # tech chips
        x, y = MARGIN_X, PAGE_H - band - 22 * mm
        c.setFont("Segoe-Semi", 9)
        for chip in ("Python 3", "Tkinter", "Windows API", "ctypes", "winsound", "pystray",
                     "PyInstaller", "Inno Setup"):
            w = pdfmetrics.stringWidth(chip, "Segoe-Semi", 9) + 16
            if x + w > PAGE_W - MARGIN_X:
                x, y = MARGIN_X, y - 9 * mm
            c.setFillColor(BLUE_LIGHT)
            c.setStrokeColor(BLUE_LINE)
            c.roundRect(x, y - 2, w, 18, 9, stroke=1, fill=1)
            c.setFillColor(BLUE_DARK)
            c.drawString(x + 8, y + 3.5, chip)
            x += w + 6
        # intro
        p = Paragraph(inline(self.intro), style("coverintro", fontSize=10.5, leading=16, textColor=INK))
        _, h = p.wrap(CONTENT_W, 200)
        p.drawOn(c, MARGIN_X, y - 14 * mm - h)
        # footer facts
        c.setStrokeColor(LINE)
        c.line(MARGIN_X, 32 * mm, PAGE_W - MARGIN_X, 32 * mm)
        facts = [("Version", config.APP_VERSION), ("Platform", "Windows 10 / 11 (64-bit)"),
                 ("Updated", date.today().strftime("%B %Y"))]
        colw = CONTENT_W / len(facts)
        for k, (label, value) in enumerate(facts):
            fx = MARGIN_X + k * colw
            c.setFillColor(MUTED)
            c.setFont("Segoe", 8)
            c.drawString(fx, 25 * mm, label.upper())
            c.setFillColor(INK)
            c.setFont("Segoe-Semi", 10.5)
            c.drawString(fx, 19.5 * mm, value)
        c.restoreState()

    def draw_body(self, c, doc):
        c.saveState()
        top = PAGE_H - 13 * mm
        c.setFillColor(BLUE)
        c.rect(MARGIN_X, top - 1, 8, 8, stroke=0, fill=1)
        c.setFillColor(MUTED)
        c.setFont("Segoe-Semi", 8.5)
        c.drawString(MARGIN_X + 13, top, f"{config.APP_NAME}  ·  Project Guide")
        c.setStrokeColor(LINE)
        c.setLineWidth(0.6)
        c.line(MARGIN_X, top - 5, PAGE_W - MARGIN_X, top - 5)
        c.line(MARGIN_X, 13 * mm, PAGE_W - MARGIN_X, 13 * mm)
        c.setFont("Segoe", 8)
        c.drawString(MARGIN_X, 8.5 * mm, f"Version {config.APP_VERSION}")
        c.drawRightString(PAGE_W - MARGIN_X, 8.5 * mm, f"Page {doc.page - 1}")
        c.restoreState()


def build():
    with open(SRC, encoding="utf-8") as f:
        title, intro, body = parse(f.read())
    toc = TableOfContents(levelStyles=TOC_STYLES, dotsMinLevel=0)
    toc.rightColumnWidth = 30
    story = [NextPageTemplate("body"), PageBreak(),
             Paragraph('<font color="#2563eb">Contents</font>', style("toch", fontName="Segoe-Bold",
                                                                         fontSize=22, leading=28,
                                                                         spaceAfter=4)),
             HRule(), Spacer(1, 8), toc, PageBreak()]
    story += body
    doc = GuideDoc(OUT, title, intro)
    doc.multiBuild(story)
    print("Wrote", OUT)


if __name__ == "__main__":
    build()
