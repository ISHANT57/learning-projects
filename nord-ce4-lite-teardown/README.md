# Phone · Teardown

An interactive 3D phone you can take apart, built on the [Teardown](../teardown/) framework. One offline HTML file:
**Live: https://ishant57.github.io/learning-projects/phone/**

**[nord-teardown.html](nord-teardown.html)**: or double-click the file. Nothing to install.

## Which phone is this?

Not your Nord CE4 Lite 5G, and the page says so. **No public teardown of the CE4 Lite exists**, so its real board layout cannot be known without opening it. The model follows iFixit's teardown of the **OnePlus Nord (2020)**: the same brand and product line, with a real teardown to trace. Every part has a **Your phone** tab that says what is documented for your Nord CE4 Lite 5G (variant CPH2619, India), and **Reference vs your phone** lists the differences side by side.

## Provenance labels

Every fact carries a tag; hover one for its meaning.

| Tag | Meaning |
|---|---|
| DOCUMENTED | Stated by the manufacturer or chip vendor |
| TEARDOWN | Seen in or written in the iFixit Nord (2020) teardown |
| APPROX | Traced or estimated from teardown photos, about ±2 to 3 mm |
| THIRD-PARTY | Stated only by a third-party site |
| STANDARD | Fixed by a standard or by physics |
| CALCULATED | Derived by arithmetic from documented numbers |
| ILLUSTRATIVE | A conceptual model, not a hardware measurement |
| UNKNOWN | Not documented anywhere I could verify; not drawn as fact |

## What is built (all seven roadmap phases)

- 360° orbit, spin, zoom and pan; front, back, three-quarter and side views.
- Explode slider (display, frame, board, chips, battery, cameras, bottom board, back cover peel in order); *Back off*, *Screen off*, *X-ray*, *Isolate*; *Pull out* a part on its own.
- 28 clickable parts in 23 entries. Each has: what it does, why it exists, how it works, what happens when it fails, a practical example, how it connects (lines and moving dots in 3D, illustrative), CS / OS / electronics / networking concepts, interview questions, tagged specs, and a note on your phone.
- The board outline, its cut-out and the chip positions are traced from the iFixit photos (`tools/trace.py`), scaled to an assumed 66.3 mm board width. The photos have no scale bar, so sizes are approximate. The photos themselves are not redistributed.
- Chip identities (SM7250, Samsung KM8V8001JM, PM7250 and so on) are from the teardown text. Their mapping to the colour boxes in the photos follows iFixit's usual colour order, which is an inference. One chip iFixit lists as "Snapdragon 865 5G Mobile Platform" is shown as "RF?" because that label does not fit this phone.

## The eleven demonstrations (top bar, or keys 1 to 9, 0, minus)

Each is a **conceptual model tagged illustrative**, built on documented, standard or calculated numbers. None is a measurement of your phone. Where a real computation exists it is real arithmetic on made-up inputs.

| Demo | What it shows | Real maths? | Numbers |
|---|---|---|---|
| Boot | Power key, boot ROM, memory training, firmware, verified boot, kernel, init and zygote, lock screen, with a boot log | no | Typical Qualcomm Android chain; your exact chain is UNKNOWN |
| CPU runs | A 5-stage pipeline running an ARM-style program (load miss, load-use stall, mispredict; x1 ends at 100) and the 8 cores (2 big, 6 little) with DVFS | cycle-accurate schedule | Pipeline ILL; core types and clock THIRD-PARTY; P = C·V²·f STD |
| CPU ↔ RAM | One cache-line access on LPDDR4X with a live timing diagram | clock counts | Structure and 4266 MT/s STD; latencies ILL; your grade UNKNOWN |
| UFS storage | An app reads or writes a file: descriptor, doorbell, link, flash, DMA, interrupt | link time | HS-G3 × 2 = 1.16 GB/s STD; flash times ILL |
| Touch | A finger on a 16 × 36 electrode grid, signal heat-map, the centroid, latency budget | **centroid maths** | Grid, rate, latencies ILL; your touch rate UNKNOWN |
| Camera | Light, Bayer filter, read-out, ISP, compression, save | data sizes | 50 MP, 0.8 µm DOC; bit depth, ratio ILL |
| Wi-Fi and 5G | Joining a network (both kinds) plus a free-space link budget | **path loss and Shannon limit** | Wi-Fi 5 and n78 DOC; powers and widths ILL |
| GPS | Sky plot, ranges, and a **least-squares position solver** with DOP | **real solver** | 5 constellations DOC; satellite positions invented |
| Charging | A generic power curve and the stages of a charge | integrated curve | 80 W DOC; the curve ILL; SUPERVOOC internals UNKNOWN |
| Thermal | A passive phone as three thermal masses, heat tint on the chips, throttling | **RC model** | All parameters ILL; your cooling design UNKNOWN |
| Frame | The 8.3 ms budget at 120 Hz, the pipeline from input to display, jank | budget, buffer and bandwidth | 120 Hz and 1080 × 2400 DOC; stage times ILL |

In the 3D view the outer layers fade, and the SoC and the Samsung memory package glow as each step runs. The two chips sit side by side, so the buses are drawn as **arcs between them (a visual aid, not the real traces)**.

## Not built

Nothing from the roadmap remains. What is deliberately not drawn is listed below.

Drawn, but flagged because nothing documents them. They exist in every phone; where they sit in this one is unknown:

| Part | How it is drawn |
|---|---|
| Shield cans | **Traced from the photos** (TEARDOWN, APPROX). One large can with chip windows on the SoC side, five on the other side. Outlines are rough where the photo is mottled. |
| Bottom microphone | The teardown documents "a microphone hole" on the bottom edge (TEARDOWN); its position along the edge is APPROX. |
| Cellular, Wi-Fi and GPS antennas | **Violet, translucent, UNKNOWN.** Illustrative strips at the top and bottom edges. NFC is documented separately (in the board cover). |
| Top microphone, proximity / light sensor, motion sensors | **Violet, UNKNOWN.** Illustrative markers. The sensor *types* are documented for your phone; positions are not. |

The **Illustrative** button hides every violet part. Still not drawn: display layer thicknesses, shield-can heights, and anything inside the chips.

## Build

```
cd ../teardown && npm install              # once
node sims/build.mjs ../nord-ce4-lite-teardown/nord-live    # → teardown-out/dist/nord-live.html
```

Research notes and sources: [RESEARCH.md](RESEARCH.md).
