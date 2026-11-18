# Phone · Teardown

An interactive 3D phone you can take apart, built on the [Teardown](../teardown/) framework. One offline HTML file:
**[nord-teardown.html](nord-teardown.html)**. Double-click it. Nothing to install.

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

## What is built (roadmap phases 1 to 3)

- 360° orbit, spin, zoom and pan; front, back, three-quarter and side views.
- Explode slider (display, frame, board, chips, battery, cameras, bottom board, back cover peel in order); *Back off*, *Screen off*, *X-ray*, *Isolate*; *Pull out* a part on its own.
- 28 clickable parts in 23 entries. Each has: what it does, why it exists, how it works, what happens when it fails, a practical example, how it connects (lines and moving dots in 3D, illustrative), CS / OS / electronics / networking concepts, interview questions, tagged specs, and a note on your phone.
- The board outline, its cut-out and the chip positions are traced from the iFixit photos (`tools/trace.py`), scaled to an assumed 66.3 mm board width. The photos have no scale bar, so sizes are approximate. The photos themselves are not redistributed.
- Chip identities (SM7250, Samsung KM8V8001JM, PM7250 and so on) are from the teardown text. Their mapping to the colour boxes in the photos follows iFixit's usual colour order, which is an inference. One chip iFixit lists as "Snapdragon 865 5G Mobile Platform" is shown as "RF?" because that label does not fit this phone.

## Phase 3: three demonstrations (top bar, or keys 2 to 4)

| Demo | What it shows | Where the numbers come from |
|---|---|---|
| CPU runs | A 5-stage pipeline executing an ARM-style program, cycle by cycle (a load miss, a load-use stall, a branch mispredict; the answer 100 ends in x1), plus the **8 cores**: 2 big and 6 little, each with its own clock and load for four workloads | Pipeline: ILL teaching model. Core types and clock: THIRD-PARTY. Power: P = C·V²·f (STD) with an ILL curve |
| CPU ↔ RAM | One cache-line access on LPDDR4X: ACT, tRCD, RD, read latency, a 16-beat burst of 32 B, with a live timing diagram | Structure and 4266 MT/s top grade: STD. RL, WL, tRCD: ILL typical. Your phone's real grade, bus width and timings are UNKNOWN |
| UFS storage | An app reads or writes a file: descriptor in RAM, doorbell, link, flash translation, flash read or program, DMA, interrupt; 4 KiB, 1 MiB, 1 GiB | HS-Gear3 × 2 lanes = 1.16 GB/s ceiling and 32 slots: STD. Flash times and overhead: ILL. Your UFS 2.2 gear is not documented |

In the 3D view the display, frame and back cover fade, and the SoC and the Samsung memory package glow as each step runs. The two chips sit side by side, so the buses are drawn as **arcs between them (a visual aid, not the real traces)**.

## Not built yet

Phases 4 to 7 are for the **phone**. The laptop (`../laptop-teardown/`) is separate and already has its six visualizations. For the phone, eight demonstrations remain: boot, touch, camera, Wi-Fi and 5G, GPS, charging, thermal, and rendering a frame (the *Roadmap* panel in the page shows which are built). All will be conceptual models on documented numbers and tagged illustrative.

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
