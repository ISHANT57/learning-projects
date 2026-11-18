# OnePlus Nord CE4 Lite 5G: research (before any 3D work)

Status: research done; phases 1 and 2 built (see README.md). Researched 2026-11-18.

**Decision (2026-11-18):** because no CE4 Lite teardown exists, the 3D internals follow the public iFixit teardown of the **OnePlus Nord (2020)** (https://www.ifixit.com/Teardown/OnePlus+Nord+Teardown/135734). Your phone's documented specs are shown beside every part. The model is never presented as your phone's real layout.

## 0. The finding that shapes everything

**No public teardown of this phone exists** that I could find. Searches returned iFixit teardowns of other phones (the 2020 OnePlus Nord, the Nord 4) and a repair shop's service listing, but no photos or guide of the CE4 Lite's board, battery or flex layout. I first assumed I could only read page text, but I can view downloaded photos. That made a traced layout of a *different* phone possible (see the decision above). For the CE4 Lite itself, the real board layout is still unknown, so it is not drawn. Everything below separates what is documented from what would be a guess.

## 1. Hardware inventory

Provenance labels used from here on:

| Label | Meaning |
|---|---|
| **DOC** | Stated by the manufacturer or chip vendor |
| **3RD** | Stated only by a third-party site; not confirmed by the manufacturer |
| **CALC** | Derived by arithmetic from DOC numbers (shown with the formula) |
| **ILL** | Conceptual or illustrative; never a hardware measurement |
| **UNK** | Unknown / not verifiable. Will not be drawn as fact |

### Variants (this matters for your phone)

| | India (CPH2619, 3RD) | Global (CPH2621, 3RD) |
|---|---|---|
| Battery | 5,500 mAh (3RD: GSMArena) | **5,110 mAh typical, 4,990 mAh rated, 19.83 / 19.37 Wh (DOC)** |
| RAM / storage | 8 GB + 128 GB or 256 GB (3RD) | 8 GB LPDDR4X + 256 GB UFS 2.2 (DOC) |
| NFC | conflicting sources | "enabled" (DOC, OnePlus Ireland page) |

Your list (5,500 mAh, 128 or 256 GB) matches the **India** variant. The official page I could read is the global one. **Please confirm your model number** (Settings → About device).

### Documented specs (DOC, from the OnePlus Ireland spec page unless noted)

| Area | Value |
|---|---|
| Body | 162.9 × 75.6 × 8.1 mm, 191 g; materials not stated (UNK) |
| Display | 6.67 in AMOLED, 1080 × 2400, 394 ppi, 120 Hz, 1200 / 2100 nits (HBM / peak), PWM 480 Hz, 100% sRGB and Display P3. Touch sampling rate and glass type not stated (UNK) |
| SoC / GPU | Qualcomm Snapdragon 695 5G, Adreno 619 |
| Memory | 8 GB LPDDR4X; UFS 2.2 |
| OS | OxygenOS 14 (Android 14); 2 OS upgrades, 3 years of security updates |
| Rear camera | Sony LYT-600, 1/1.95", 50 MP, f/1.8, 0.8 µm pixels, PDAF, OIS and EIS; 2 MP f/2.4 depth assist; dual LED flash |
| Front camera | 16 MP, f/2.4, fixed focus |
| Charging | 80W SUPERVOOC (55 W in 110 V regions); Battery Health Engine |
| Wireless | Wi-Fi 5 (802.11ac), Bluetooth 5.1 (SBC, AAC, aptX HD, LDAC); 5G NR n1/2/3/5/7/8/12/20/28/66/38/40/41/77/78; LTE 4×4 MIMO; GNSS: GPS L1, BDS B1I, GLONASS G1, Galileo E1, QZSS L1 |
| I/O | USB-C (USB **2.0**), 3.5 mm headphone jack, hybrid dual-nano-SIM / SIM + microSD slot, right-side volume and power keys |
| Sensors | In-display fingerprint (type not stated by OnePlus; one third-party says optical, 3RD), geomagnetic, proximity, accelerometer, gravity, gyroscope, pedometer |
| Audio | Dual stereo speakers; noise cancellation; microphone count **not stated** (UNK) |

### Documented about the chip (3RD only: I could not read Qualcomm's own page)

2 × Cortex-A78-class at 2.2 GHz + 6 × Cortex-A55-class (sources disagree: 1.7 or 1.8 GHz), 6 nm, Adreno 619, Snapdragon X51 5G modem, LPDDR4X, UFS 2.2. The ISP name is disputed (Notebookcheck says Spectra 355L; I will not state one until Qualcomm's brief confirms it).

### Not stated anywhere I could verify (UNK)

Microphone count and positions · vibration motor type · thermal design (graphite sheet, vapor chamber, none) · fingerprint sensor type (official) · frame and back-cover material · every internal dimension · board layout · PMIC and charger chip part numbers · RAM/UFS vendors · antenna positions · battery cell vendor. Charging voltage/current steps are not in the sources I read.

## 2. Verified references

- OnePlus, Nord CE4 Lite 5G specs (Ireland): https://www.oneplus.com/ie/nord-ce4-lite-5g/specs
- GSMArena, Nord CE4 Lite (India): https://m.gsmarena.com/oneplus_nord_ce4_lite_(india)-ampp-13155.php (reached through search; full page fetch was blocked)
- Model numbers and variants (3RD): https://chooseyourmobile.com/oneplus-nord-ce4-lite-5g-cph2619-cph2621
- Snapdragon 695 (Qualcomm): https://www.qualcomm.com/products/mobile/snapdragon/smartphones/snapdragon-6-series-mobile-platforms/snapdragon-695-5g-mobile-platform (page text was empty to my fetcher), product brief PDF: https://qualcomm.com/media/documents/files/qualcomm-snapdragon-695-5g-mobile-platform-product-brief.pdf
- Different phones, **not** this one: iFixit OnePlus Nord (2020) teardown, GSMArena Nord 4 teardown report.

## 3. Internal architecture (block diagram)

Platform level is standard for Snapdragon phones; the box-level wiring for *this* board is **UNK** and drawn as typical (ILL).

```
 Battery ──► charge IC / PMIC ◄── USB-C (VBUS, CC, D+/D-)         [roles: typical, parts UNK]
                   │ rails
                   ▼
 ┌────────────────────────── Snapdragon 695 SoC (DOC) ─────────────────────────┐
 │ 2×A78 + 6×A55 CPU │ Adreno 619 GPU │ X51 modem │ ISP │ DSP/AI │ display ctrl │
 └──┬──────────┬────────────┬───────────┬───────┬─────────┬────────────────────┘
    │LPDDR4X   │UFS 2.2     │RF         │MIPI   │MIPI     │MIPI DSI    I²C/SPI
    ▼          ▼            ▼ front-end │CSI    │CSI      ▼            ▼
  8 GB RAM   256/128 GB   antennas     50 MP   16 MP    AMOLED      touch IC,
  (DOC)      (DOC)       (positions    +2 MP   front    + DDIC     in-display FP,
                          UNK)         (DOC)   (DOC)    (DOC)      sensors (DOC)
```

## 4. Proposed 3D model structure

Layer stack (outside to inside): display module (cover glass, AMOLED, touch, in-display FP) → mid-frame → board / battery / speaker / camera layer → back cover with camera island. Overall envelope 162.9 × 75.6 × 8.1 mm is DOC and will be exact. Everything inside is a **typical arrangement**, watermarked and tagged UNK, unless you supply verified information (see questions).

Each part carries: provenance label per fact, what / why / how / connections / failure modes / CS-OS-electronics-networking concepts / interview questions / a practical example.

## 5. Roadmap

Same split as the laptop (a separate folder, `teardown-kit/` imports, one model file per demo, offline HTML, instancing, tiers for the integrated GPU). The 11 demos split by how honest they can be:

| Demo | Basis |
|---|---|
| CPU execution, CPU↔RAM, UFS read/write, frame rendering, touch processing, camera pipeline, boot, charging, thermal, Wi-Fi/5G, GPS | All are **ILL conceptual models** built on DOC numbers (core types, LPDDR4X, UFS 2.2, 120 Hz = 8.33 ms frame, 50 MP, GNSS constellations). Charging and thermal add CALC values. None is a measurement of your phone. |

Phases as you listed (1 exterior and exploded view → 7 Android boot). I would deliver and push each phase, and review screenshots before moving on.
