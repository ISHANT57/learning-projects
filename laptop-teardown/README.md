# Laptop · Teardown

An interactive 3D simulator of a modern laptop, built on the Teardown framework. One offline HTML page (about 920 KB, three.js and fonts inlined, nothing fetched at run time):

**[laptop-teardown.html](laptop-teardown.html)**: double-click it. Nothing to install.

To rebuild it, you need the sibling [teardown](../teardown/) folder (the framework it is built on; run `npm install` there once):

```
cd laptop-teardown
node ../teardown/sims/build.mjs ./laptop-live      # → teardown-out/dist/laptop-live.html
```

## What you can do

- **Take it apart.** Drag *Explode* and the machine peels layer by layer (top case and keyboard first, bottom cover last). *Lid* opens and closes the display. *Top case off* removes the deck so the board is visible from above.
- **Inspect every major part.** Click it in the 3D view or in the list. Every part has four tabs: *Function*, *How it works* (with a block diagram), *Connections* (dashed lines to everything it links to) and *Specs* (each number tagged). *Open up* separates its internal layers, *Pull out* removes it on its own, *Isolate* hides the rest.
- **Run six visualisations** on one model (tabs across the top, keys 1 to 7):

| View | What it shows | Where the numbers come from |
|---|---|---|
| Power flow | USB-C at 20 V → VSYS → regulators → chips, current as particles on the real traces; charger and battery share the load | `powerFlow()` in `model.js`: adapter + battery = system + charger loss, checked for every combination |
| CPU ↔ RAM | One cache-line access on DDR5-4800 with a live timing diagram (CK, CA, DQS, DQ) | `ddrTimeline()`: tRP, tRCD, CL in clocks and ns, BL16 × 32 bits = 64 B |
| SSD → RAM | NVMe read: submission queue, doorbell, DMA fetch, flash read, DMA to RAM, completion | `nvmeRead()`: PCIe 4.0 × 4 = 7.88 GB/s raw, packet overhead, per-stage time |
| CPU executes | A five-stage pipeline running a real 10-instruction program (r1 ends at 100), with a cache miss, a load-use stall and a branch mispredict | `runProgram()`: a cycle-accurate in-order schedule |
| Cooling | Die → cold plate → heat pipes → fins → air, parts tinted by temperature, fans follow the die temperature, throttling at the limit | `stepThermal()`: a lumped RC network, fan laws, ΔT = Q ÷ (ρ·V̇·cp) |
| Boot | Button → EC → power rails in order → reset vector → UEFI phases → memory training → devices → boot manager → kernel → desktop | `BOOT` steps in `model.js` |

- **Leave it alone** and it tours itself. Any click, drag, wheel or key hands control to you; 25 s of quiet hands it back.

## What is real and what is illustrative

This is **a generic reference laptop, not a product**. Nothing is copied from a vendor's specification. Every number on screen carries a tag:

| Tag | Meaning |
|---|---|
| `STD` | Fixed by a published standard or by physics: DDR5 (262 pins, 1.1 V, BL16, 32-bit sub-channels), M.2 2280 and 2230, NVMe 64 B / 16 B queue entries, PCIe 128b/130b coding, USB-PD voltages, USB-C and HDMI pin counts, the x86 reset vector, heat of vaporisation of water, the fan laws |
| `TYP` | Typical of this class of laptop, real products differ: 14-inch 16:10 geometry, 3-cell Li-ion pack (9 to 12.6 V), JEDEC DDR5-4800B timings 40-39-39, GDDR6 on a 128-bit bus, about 100 °C junction limit |
| `ILL` | An illustrative simulation parameter chosen to make behaviour visible: load profiles in watts, regulator efficiencies, the 60 Wh pack, thermal resistances and capacitances, fan limits, the 70 µs flash read, boot step durations, the pipeline's 16-cycle cache miss |

Layout, board routing and the CPU/GPU floorplans are drawn to look like a plausible thin-and-light and are labelled illustrative on the model itself.

## Files

`laptop-live/` follows the framework's split (it imports the kit as `teardown-kit/...`):

| File | Job |
|---|---|
| `model.js` | The math, no three.js. Power, DDR5, PCIe/NVMe, thermal, the CPU pipeline, boot. Every readout reads from here. |
| `data.js` | What each component does and how it works, its links and its tagged specs. |
| `laptop.js` | The geometry, built from code in millimetres, plus the routes (nets) the board texture and the particles share. |
| `stage.js` | Studio, light, shadows, ghosting and tinting of parts, picking. |
| `fx.js` | Particles and glowing traces on the model's own paths. |
| `console.js` | The overlay: list, inspector, docks, controls. |
| `live.js` | State, camera, the six views, tour, quality tiers. |

`main.js` is the entry. There is no film or score for this machine; the page is the product.

## Integrated GPUs

The framework asks for a test on a laptop's built-in GPU. This page was measured on an Intel Iris Xe (the machine it was built on): 53 to 59 fps in every view at the default tier. What keeps it cheap:

- Quality starts in the middle for integrated or unknown GPUs, `LOW` for software rendering and phones, and steps down by itself when frames are slow. The *Quality* chip cycles it.
- The shadow map is redrawn only when something moved; only large parts cast shadows.
- Repeated small things (keycaps, fins, vents, LEDs, contacts, passives) are instanced. About 250 meshes in total.
- Part materials are permanently transparent so that ghosting never changes a material flag. three.js bakes an `OPAQUE` define into the shader when `transparent` is false, so flipping it at run time would recompile a program and stall the frame.
- The framework's `warm.js` compiles every shader in parallel before the first frame.

## Checks that were run

- 36 catalog entries × 4 tabs: every part selects, every link resolves to a part.
- 90 load / charger / battery combinations in the power view, every step of the memory, storage, CPU and boot timelines: no `NaN` or `undefined` on screen.
- Model identities: adapter + battery = system + charger loss; DDR5-4800 gives 38.4 GB/s per 64-bit module and 64 B per burst; the pipeline program finishes with r1 = 100 and stores it.
- The built file makes no network request and loads from `file://`.
