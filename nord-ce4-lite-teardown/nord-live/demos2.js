// Phases 4 to 7: boot, touch, camera, Wi-Fi and 5G, GPS, charging, thermal and rendering a frame. One generic stepper (a dock with
// controls, a step strip, text, a diagram and readouts) plus a per-demo definition: its steps, its 3D visual, its diagram.
// Every demonstration is a conceptual model tagged ILL; numbers from model2.js carry their own tags. None measures a phone.
// Buses and links are drawn as arcs between the parts: a visual aid, not the real traces.
import * as THREE from 'three';
import * as M from './model.js';
import * as N from './model2.js';
import {C} from './console.js';

const V3 = THREE.Vector3;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const TAGS = {ILL: ['ILLUSTRATIVE', '#7a5af0'], STD: ['STANDARD', '#4a5a6a'], DOC: ['DOCUMENTED', '#1f7a4d'], CALC: ['CALCULATED', '#0b8aa0'], '3RD': ['THIRD-PARTY', '#8a6d3b'], UNK: ['UNKNOWN', '#b8332b']};
const tags = (a) => a.map((t) => `<span class="pv" style="background:${TAGS[t][1]}">${TAGS[t][0]}</span>`).join('');
const num = (x, d = 1) => (Math.abs(x) >= 1e4 ? Math.round(x).toLocaleString('en-US') : x.toFixed(d));
const chips = (act, list, keyPrefix) => list.map(([v, name]) => `<div class="btn sm" data-act="${act}" data-v="${v}" data-k="${keyPrefix}-${v}">${name}</div>`).join('');

export const GEN_MODES = ['boot', 'touch', 'camera', 'net', 'gps', 'charge', 'thermal', 'frame'];
export const MODE_NAMES = {boot: 'ANDROID BOOT', touch: 'TOUCHSCREEN', camera: 'CAMERA', net: 'WI-FI AND 5G', gps: 'GPS', charge: 'CHARGING', thermal: 'THERMAL', frame: 'DRAWING A FRAME'};
const DEF_HIDE = ['display', 'frame', 'copper', 'fp', 'frontcams', 'earpiece', 'backcover', 'mbcover'];
export const CFG = {
  boot: {hide: DEF_HIDE, ex: 0.55}, touch: {hide: DEF_HIDE.filter((x) => x !== 'display'), ghost: {display: 0.78}, ex: 0.3, cam: {az: 0.3, el: 1.15, d: 3.9, tx: 0, ty: 0.03, tz: -0.06}},
  camera: {hide: DEF_HIDE, ex: 0.55, cam: {az: Math.PI, el: -1.2, d: 2.5, tx: 0, ty: 0.03, tz: -0.4}},
  net: {hide: DEF_HIDE, ill: true, ex: 0.2, cam: {az: 0.2, el: 1.15, d: 4.0, tx: 0, ty: 0.03, tz: -0.12}}, gps: {hide: DEF_HIDE, ill: true, ex: 0.2, cam: {az: 0.2, el: 1.15, d: 4.0, tx: 0, ty: 0.03, tz: -0.12}},
  charge: {hide: DEF_HIDE, ex: 0.45, cam: {az: 0.2, el: 1.2, d: 3.3, tx: 0, ty: 0.03, tz: 0.05}},
  thermal: {hide: DEF_HIDE.filter((x) => x !== 'copper'), ex: 0.15, cam: {az: 0.2, el: 1.25, d: 2.9, tx: 0, ty: 0.03, tz: -0.2}},
  frame: {hide: DEF_HIDE.filter((x) => x !== 'display'), ghost: {display: 0.8}, ex: 0.3, cam: {az: 0.3, el: 1.15, d: 3.9, tx: 0, ty: 0.03, tz: -0.06}},
};

export const INTRO = {
  boot: ['Power key to lock screen', `<p>The order is fixed by the hardware: power chips switch the rails on, a read-only boot ROM inside the SoC runs first, memory is trained, firmware and the kernel are loaded from storage into RAM, Linux starts its drivers, and Android's first process starts everything else.</p><p>Click a step in the strip to jump to it.</p><p style="color:${C.mute}">The chain shown (boot ROM, bootloader, verified boot, kernel, init) is typical of Qualcomm Android phones. Your phone's exact chain is not documented (UNK). Timing is stretched.</p>`],
  touch: ['Finger to app', `<p>Under the glass, rows and columns of transparent electrodes hold a small electric charge. A fingertip steals some of the field, so the signal at nearby electrodes drops. A chip finds the centre of that blob (a weighted average, so it is more accurate than the electrode spacing) and tells the CPU.</p><p style="color:${C.mute}">The grid size, blob size, scan rate and every latency are illustrative. The touch sampling rate of your phone is not documented (UNK). The centroid arithmetic is real.</p>`],
  camera: ['Photons to a file', `<p>Light is focused on a sensor of 50 million tiny photodiodes, each behind a red, green or blue filter. The camera chips read them out, an image signal processor rebuilds a colour picture, and the result is compressed and saved to storage.</p><p style="color:${C.mute}">50 MP and the sensor are documented for your phone. Bit depth, binning and the compression ratio are illustrative. The 3D modules are the reference phone's.</p>`],
  net: ['Joining a network', `<p>Both links work the same way in principle: find the network, prove who you are, agree on keys, get an address, then move data. The bars show a free-space <b>link budget</b>: transmit power minus path loss gives received power; compare with noise to get the signal-to-noise ratio, and Shannon's formula gives the <b>upper limit</b> on speed.</p><p style="color:${C.mute}">Free space only: no walls, no people, so real speeds are far lower. The bands and Wi-Fi 5 are documented for your phone; powers and channel widths are illustrative. The violet antennas are illustrative placements.</p>`],
  gps: ['Where am I?', `<p>Each satellite broadcasts its position and the exact time. The phone measures how long each signal took (time × the speed of light = distance, though its own cheap clock is wrong by a lot). With four or more satellites it solves for position <b>and</b> its clock error together.</p><p>Fewer satellites, or satellites bunched together, give a worse fix: the dilution of precision (DOP).</p><p style="color:${C.mute}">The satellite positions are made up; the solver is real arithmetic (least squares). Documented for your phone: GPS L1, BDS B1I, GLONASS G1, Galileo E1, QZSS L1.</p>`],
  charge: ['Filling the battery', `<p>The charger and the phone first agree how much power is safe. Then the battery takes a large, steady power until it is about a third to four-fifths full, and the power tapers as the cell nears its voltage limit to protect it.</p><p style="color:${C.mute}">80 W SUPERVOOC is documented. How it works inside (voltages, currents, cells) is not, so none is shown. The curve is a generic illustrative profile; it ends at about 45 minutes versus the 52 minutes advertised (third-party).</p>`],
  thermal: ['Where the heat goes', `<p>A phone has no fan. Heat spreads from the chip through foil and the copper strip into the frame and glass, and then leaves by convection and radiation: only a few watts. When the chip or the skin gets too warm, the OS lowers the clocks (throttling).</p><p>Choose <b>Game + charging</b> and speed up time.</p><p style="color:${C.mute}">A three-node thermal model with illustrative values. Your phone's cooling design is not documented (UNK).</p>`],
  frame: ['One frame in 8 milliseconds', `<p>The screen refreshes on a fixed beat. Before each beat, a frame must go from input to app code to GPU to compositor to the display. At 120 Hz that budget is 8.3 ms. If the work takes longer, the frame misses its slot and the old picture stays for another full period: a visible stutter (jank).</p><p style="color:${C.mute}">120 Hz and 1080 × 2400 are documented for your phone; the reference phone is 90 Hz (third-party). The stage times are illustrative.</p>`],
};

export const DOCKS = Object.fromEntries(GEN_MODES.map((m) => [m, () => dock(m)]));
const DEFS = {};
const dock = (m) => {
  const d = DEFS[m];
  return `<h3>${d.title}</h3>${tags(d.tags)}<span class="lsub">${d.sub}</span>
    <div class="lrow" style="margin-top:8px"><div class="btn sm red" data-act="gplay" data-k="play"></div><div class="btn sm" data-act="grestart">⟲ Restart</div>${d.cont ? '' : '<div class="btn sm" data-act="gslow" data-k="slow"></div>'}<span style="width:6px"></span>${d.ctl()}</div>
    ${d.cont ? '' : '<div class="seg" data-k="seg"></div>'}
    <div style="display:flex;gap:16px;margin-top:${d.cont ? 8 : 0}px"><div style="flex:1;min-width:0"><div class="note b" data-k="stext" style="min-height:${d.cont ? 24 : 46}px"></div><svg data-k="gsvg" width="560" height="${d.cont ? 150 : 124}"></svg></div>
    <div style="width:310px"><div class="kv" data-k="gkv"></div><div class="note" data-k="gnote" style="margin-top:6px;color:${C.mute};font-size:11px"></div></div></div>`;
};

export function createGen({S, lap, fx, ui, glow, heat}) {
  const G = {t: 0, play: true, slow: 1, acc: 1, o: {net: 'wifi', di: 0, sats: 8, work: 'game', warp: 10, hz: 120, jank: false}, tp: N.createTP(), hist: [], hacc: 0};
  const ctr = (id) => lap.center(id).multiplyScalar(100);
  const L = (a, b, lift = 6, off = 0) => {
    const A = ctr(a), B = ctr(b);
    return {pts: [A.clone().add(new V3(0, 0, off)), A.clone().add(new V3(0, lift, off)), B.clone().add(new V3(0, lift, off)), B.clone().add(new V3(0, 0, off))], follow: null};
  };
  const rev = (p) => ({pts: [...p.pts].reverse(), follow: null});
  const train = (p, k, col) => fx.train(p, clamp(k, 0, 1), 12, 5, col, 2.4, {follow: null});
  const stream = (p, n, col, jit = 0.3) => fx.flow(p, n, 70, col, 2.1, {follow: null, jitter: jit});
  const ghost = (ids, v) => ids.forEach((id) => glow(id, v));
  const PM = ['pm7250', 'pm7150a', 'pm7250b'];
  const RF = ['fem1', 'fem2', 'rf865', 'qet'];

  // ---------------------------------------------------------------------------------------------- boot
  const BOOT = [
    ['Power key', 'The power key (or the charger) tells the power management chips to switch the supply rails on in order. Until now the phone is "off", but the battery and a tiny always-on part were awake.', ['[PMIC] power key event', '[PMIC] rails: always-on, 1.8 V, core, DRAM']],
    ['Boot ROM', 'The SoC contains a read-only boot ROM. It runs first, from on-chip memory because DRAM is not ready, and checks the digital signature of the next stage. If the check fails, the phone refuses to boot.', ['[ROM] check signature of the bootloader', '[ROM] OK, jump to the bootloader']],
    ['Memory training', 'The bootloader trains the LPDDR4X interface: it sweeps delays and voltages until every data wire is sampled in the middle of its eye. Only then can DRAM be used.', ['[BL] LPDDR4X training', '[BL] DRAM ready']],
    ['Load firmware', 'Firmware images (the modem, the secure world, and more) are read from UFS storage into RAM and started on their own processors.', ['[BL] read modem and secure firmware (UFS)', '[BL] start secure world and modem']],
    ['Verify, load kernel', 'Android Verified Boot checks the boot image against signed hashes, then loads the Linux kernel and the initial RAM disk from storage into RAM and jumps into the kernel.', ['[AVB] verify boot partition', '[BL] load kernel and ramdisk', '[BL] jump to kernel']],
    ['Kernel starts', 'Linux sets up virtual memory and the scheduler, then starts drivers for storage, display, touch, modem, Wi-Fi, camera and sensors, and mounts the root file system.', ['[KERNEL] MMU, scheduler up', '[KERNEL] drivers: ufs, display, touch, modem, wifi', '[KERNEL] mount root']],
    ['init and zygote', 'init, the first process, starts services. Zygote loads the Android runtime once and forks every app from it. system_server starts the window, activity and package managers.', ['[init] start services', '[zygote] preload classes', '[system_server] start']],
    ['Lock screen', 'SurfaceFlinger draws the first frames, the display driver lights the panel, the fingerprint and touch inputs are enabled. The phone is ready.', ['[SF] first frame', '[display] panel on', '[boot] complete']],
  ];
  DEFS.boot = {
    title: 'Android boot sequence', tags: ['ILL'], sub: 'From the power key to the lock screen. Time is stretched.', ctl: () => '',
    steps: () => BOOT.map(([name, text, log], i) => ({name, sub: `step ${i + 1}`, dur: 1.7, text, log})),
    visual({i, k}) {
      const up = L('soc', 'mcp', 8), ufs = L('soc', 'mcp', 4, 1.5);
      if (i === 0) { ghost(['battery', ...PM], 0.7); stream(L('battery', 'pm7250b', 8), 8, '#ff7a18'); }
      else if (i === 1) glow('soc', 0.5 + 0.4 * Math.sin(S.T * 6) ** 2);
      else if (i === 2) { glow('soc', 0.5); glow('mcp', 0.6); stream(up, 8, '#2f7de1'); stream(rev(up), 6, '#2f7de1'); }
      else if (i === 3) { glow('soc', 0.4); glow('mcp', 0.7); stream(rev(ufs), 10, '#7a5af0'); }
      else if (i === 4) { glow('soc', 0.5); glow('mcp', 0.7); stream(rev(ufs), 10, '#7a5af0'); stream(up, 8, '#1f9d62'); }
      else if (i === 5) { ghost(['soc', 'wifi', 'codec', ...RF], 0.5); stream(L('soc', 'wifi', 8), 3, '#2f7de1'); }
      else if (i === 6) { glow('soc', 0.7); glow('mcp', 0.5); stream(up, 6, '#1f9d62'); }
      else { glow('soc', 0.5 * (1 - k) + 0.2); }
    },
    kv: (g, c) => [['Stage', `${c.i + 1} of ${BOOT.length}`], ['Chain', 'boot ROM → bootloader → kernel → init'], ['Storage read', 'UFS (see UFS demo)'], ['RAM first usable', 'after step 3']],
    svg(g, c) {
      const lines = BOOT.slice(0, c.i + 1).flatMap((b, i) => (i === c.i ? b[2].slice(0, Math.ceil(b[2].length * Math.min(1, c.k * 1.6))) : b[2])).slice(-7);
      return `<rect x="0" y="0" width="560" height="124" fill="#0e1114"/>${lines.map((l, i) => `<text x="10" y="${18 + i * 16}" font-size="11" fill="#9fc3a6" font-family="JetBrains Mono, monospace">${esc(l)}</text>`).join('')}`;
    },
    note: () => 'Typical Qualcomm Android chain. Your phone\'s exact chain is not documented (UNK).',
  };

  // ---------------------------------------------------------------------------------------------- touch
  const fingerAt = (t) => ({x: 34.7 + 17 * Math.cos(t * 0.55), y: 77 + 42 * Math.sin(t * 0.55)});
  DEFS.touch = {
    title: 'Touchscreen input', tags: ['ILL', 'UNK'], sub: 'A finger on the glass to an app reacting. Centroid maths is real.', ctl: () => '',
    steps: () => [['Finger touches', 'A fingertip is conductive and close to the electrodes: it steals part of the electric field, so the measured signal at nearby intersections drops.'], ['Scan the grid', `The touch chip drives each row and measures each column, ${N.TOUCH.rows} × ${N.TOUCH.cols} intersections per frame (grid size ILL).`], ['Find the finger', 'Signals above the noise floor are kept. The weighted centre of the blob (the centroid) gives the position far finer than the electrode spacing.'], ['Interrupt and driver', 'The touch chip raises an interrupt line; the kernel driver reads the coordinates over a short serial bus and makes an input event.'], ['Android input', 'InputReader and InputDispatcher pick the window under the finger and send it the event.'], ['App and frame', 'The app updates its view and draws a new frame, which then goes to the screen (see the frame demo).']].map(([name, text]) => ({name, dur: 1.6, text})),
    visual({i, k}) {
      glow('display', 0.2 + (i < 3 ? 0.3 : 0));
      const A = L('display', 'soc', 10);
      if (i === 1) stream(A, 5, '#2f7de1');
      if (i === 2) ghost(['soc'], 0.5);
      if (i === 3) { train(A, k, '#e5342b'); ghost(['soc'], 0.6); }
      if (i === 4) ghost(['soc', 'mcp'], 0.5);
      if (i === 5) { ghost(['soc'], 0.7); train(rev(A), k, '#1f9d62'); }
    },
    kv(g, c) {
      const f = fingerAt(g.t), fr = N.touchFrame(f.x, f.y, Math.floor(g.t * 5));
      const total = N.TOUCH_LAT.reduce((a, b) => a + b[1], 0);
      return [['Finger (true)', `${f.x.toFixed(1)}, ${f.y.toFixed(1)} mm`], ['Reported (centroid)', `${fr.cx.toFixed(2)}, ${fr.cy.toFixed(2)} mm`], ['Error', `${Math.hypot(fr.cx - f.x, fr.cy - f.y).toFixed(2)} mm (CALC)`], ['Electrode pitch', `${fr.px.toFixed(1)} × ${fr.py.toFixed(1)} mm (CALC)`], ['Scan rate', `${N.TOUCH.scanHz} Hz (ILL; real UNK)`], ['Touch to pixels', `${total.toFixed(1)} ms (ILL)`]];
    },
    svg(g, c) {
      const f = fingerAt(g.t), fr = N.touchFrame(f.x, f.y, Math.floor(g.t * 5));
      const r0 = clamp(Math.round(f.y / fr.py) - 6, 0, N.TOUCH.rows - 12);
      let s = '';
      for (let r = 0; r < 12; r++) for (let q = 0; q < N.TOUCH.cols; q++) { const v = fr.grid[r0 + r][q]; s += `<rect x="${q * 9}" y="${r * 9}" width="8" height="8" fill="${v ? `rgba(229,52,43,${(0.15 + 0.85 * v).toFixed(2)})` : '#eceef1'}"/>`; }
      const cx = (fr.cx / fr.px) * 9, cy = ((fr.cy / fr.py) - r0) * 9;
      s += `<circle cx="${cx}" cy="${cy}" r="3" fill="none" stroke="#16181b" stroke-width="1.4"/><text x="150" y="10" font-size="9" fill="${C.mute}">Signal at each electrode crossing (red = finger)</text>`;
      let x = 160;
      N.TOUCH_LAT.forEach(([name, ms], i) => { const w = (ms / N.TOUCH_LAT.reduce((a, b) => a + b[1], 0)) * 390; s += `<rect x="${x}" y="30" width="${w - 1}" height="26" fill="${i === c.i ? '#16181b' : ['#c9ced6', '#d9dde2'][i % 2]}"/><text x="${x + 3}" y="46" font-size="8.5" fill="${i === c.i ? '#fff' : '#16181b'}">${ms}</text>`; x += w; });
      s += `<text x="160" y="72" font-size="9" fill="${C.mute}">Latency budget in ms (illustrative): scan, IC, interrupt, input, app, render, scan-out</text>`;
      return s;
    },
    note: () => 'The finger moves on a circle. The centroid is computed from the simulated signals each frame.',
  };

  // ---------------------------------------------------------------------------------------------- camera
  DEFS.camera = {
    title: 'Camera: capture and processing', tags: ['DOC', 'ILL'], sub: 'A photo from light to a file. 50 MP is documented for your phone.', ctl: () => '',
    steps: () => [['Light in', 'The lens focuses light on the sensor. Optical stabilisation moves the lens or sensor to cancel hand shake while the shutter is open.'], ['Expose', 'Each photodiode collects charge in proportion to the light it sees, behind a red, green or blue filter: half the pixels are green, a quarter each red and blue (the Bayer pattern).'], ['Read out', `An ADC turns each pixel's charge into a number (${N.CAM.bits} bits here, ILL) and a fast serial link (MIPI CSI) sends the frame to the SoC: ${N.cam.rawMB.toFixed(1)} MB of raw data (CALC).`], ['Image processor', 'The ISP rebuilds full colour for every pixel (demosaicing), removes noise, balances colour, maps brightness and sharpens. 4-in-1 binning would merge pixels to 12.5 MP for night shots.'], ['Compress', `JPEG or HEIC compression shrinks the picture about ${N.CAM.jpegRatio}:1 (ILL) to ${N.cam.jpegMB.toFixed(1)} MB.`], ['Save to storage', 'The file is written to UFS flash. The preview thumbnail appears.']].map(([name, text]) => ({name, dur: 1.7, text})),
    visual({i, k}) {
      glow('rearcams', 0.3 + (i < 3 ? 0.4 : 0));
      const mipi = L('rearcams', 'soc', 10);
      if (i === 2) train(mipi, k, '#1f9d62');
      if (i === 3) { glow('soc', 0.8); stream(L('soc', 'mcp', 8), 5, '#2f7de1'); }
      if (i === 4) glow('soc', 0.6);
      if (i === 5) { glow('mcp', 0.8); glow('soc', 0.4); stream(L('soc', 'mcp', 4, 1.5), 8, '#7a5af0'); }
    },
    kv() {
      const wr = (b) => ((b / (M.ufs.effGBs * 1e9)) * 1000).toFixed(1);
      return [['Sensor', '50 MP Sony LYT-600, f/1.8, 1/1.95", OIS (DOC)'], ['Pixel size', '0.8 µm (DOC)'], ['Raw frame', `${N.cam.rawMB.toFixed(1)} MB (CALC)`], ['After 4-in-1 binning', `${N.cam.binnedMP.toFixed(1)} MP (CALC)`], ['JPEG size', `${N.cam.jpegMB.toFixed(2)} MB (ILL ratio)`], ['Write to UFS', `${wr(N.cam.jpegMB * 1e6)} ms (CALC)`]];
    },
    svg(g, c) {
      let s = `<text x="0" y="10" font-size="9" fill="${C.mute}">Bayer filter (8 × 8 pixels): G 50%, R 25%, B 25% (STD)</text>`;
      for (let r = 0; r < 8; r++) for (let q = 0; q < 8; q++) { const col = (r + q) % 2 === 0 ? '#3aa86a' : r % 2 === 0 ? '#d64a3c' : '#3b78d6'; s += `<rect x="${q * 11}" y="${16 + r * 11}" width="10" height="10" fill="${col}" opacity="${c.i >= 3 ? 0.35 : 1}"/>`; }
      const bars = [['Raw', N.cam.rawMB, '#7a5af0'], ['Binned raw', N.cam.rawMB / N.CAM.binning, '#2f7de1'], ['JPEG', N.cam.jpegMB, '#1f9d62']];
      bars.forEach(([n, v, col], i) => { const w = (v / N.cam.rawMB) * 330; s += `<text x="120" y="${34 + i * 26}" font-size="9" fill="${C.ink}">${n}</text><rect x="190" y="${24 + i * 26}" width="${w}" height="14" fill="${col}"/><text x="${194 + w}" y="${35 + i * 26}" font-size="9" fill="${C.mute}">${v.toFixed(1)} MB</text>`; });
      return s;
    },
    note: () => 'The 3D camera modules are from the reference phone (48 MP). The numbers use your phone\'s 50 MP.',
  };

  // ---------------------------------------------------------------------------------------------- Wi-Fi and 5G
  const NETSTEPS = {
    wifi: [['Scan', 'The phone listens for beacon frames, which announce each network\'s name, channel and security.'], ['Join', 'It asks the access point to authenticate and associate: a short exchange of management frames on the chosen channel.'], ['Secure keys', 'WPA3 runs a password-based handshake (SAE) so both sides derive fresh keys without sending the password, then every frame is encrypted.'], ['Get an address', 'DHCP: the router leases the phone an IP address, a gateway and DNS servers.'], ['Find the name', 'DNS turns a website name into an IP address.'], ['Connect', 'TCP opens a connection with a three-way handshake; TLS then encrypts the web traffic.'], ['Data flows', 'Frames carry the traffic; devices take turns on the shared channel.']],
    nr: [['Cell search', 'The phone scans for synchronisation signals from nearby 5G cells to learn timing and the cell identity.'], ['Random access', 'It sends a short preamble on a shared channel so the cell can hear it and reply with timing and an uplink grant.'], ['Radio connection', 'RRC setup: the cell and the phone agree how the radio link will be configured.'], ['Register and authenticate', 'The phone registers with the core network; the SIM answers a cryptographic challenge to prove who you are, and keys are derived.'], ['Data session', 'A PDU session gives the phone an IP address and a path to the internet through the core network.'], ['Data flows', 'The scheduler gives the phone radio resources every millisecond or less; MIMO uses several antennas at once.'], ['Handover', 'As you move, the network hands the connection to the next cell without dropping it.']],
  };
  DEFS.net = {
    title: 'Wi-Fi and 5G', tags: ['STD', 'DOC', 'ILL'], sub: 'Joining a network and a free-space link budget.',
    ctl: () => `${chips('nkind', [['wifi', 'Wi-Fi 5'], ['nr', '5G n78']], 'nk')}<span style="width:6px"></span><span class="lcap">Distance</span><span data-k="dchips"></span>`,
    steps: (g) => NETSTEPS[g.o.net].map(([name, text]) => ({name, dur: 1.6, text})),
    visual({i, k, G: g}) {
      const wifi = g.o.net === 'wifi';
      const ant = wifi ? 'ant_bl' : 'ant_top';
      const chain = wifi ? [ant, 'wifi', 'soc'] : [ant, 'fem2', 'rf865', 'soc'];
      const act = Math.min(i, 5) / 5;
      ghost(chain, 0.35 + 0.4 * Math.sin(S.T * 5) ** 2 * (i > 0 ? 1 : 0.3));
      for (let j = 0; j < chain.length - 1; j++) { const p = L(chain[j], chain[j + 1], 6); stream(i % 2 ? p : rev(p), 4, wifi ? '#1f9d62' : '#f26a1b'); }
      if (i === 5) stream(L('soc', 'mcp', 8), 4, '#2f7de1');
    },
    kv(g) {
      const n = N.NETS[g.o.net], d = n.dist[g.o.di], l = N.link(g.o.net, d);
      return [['Band', `${n.name}, ${n.fMHz} MHz (DOC)`], ['Distance', `${d} m`], ['Path loss', `${l.loss.toFixed(1)} dB (STD formula)`], ['Received power', `${l.rx.toFixed(1)} dBm (CALC)`], ['Noise floor', `${l.noise.toFixed(1)} dBm (CALC)`], ['SNR', `${l.snr.toFixed(1)} dB`], ['Shannon limit', `${num(l.cap / 1e6, 0)} Mbit/s (upper bound)`]];
    },
    svg(g) {
      const n = N.NETS[g.o.net], d = n.dist[g.o.di], l = N.link(g.o.net, d);
      const X = (dbm) => 40 + ((dbm + 110) / 80) * 420;
      const rows = [['Transmit (EIRP)', n.eirp, '#e5342b'], ['Received', l.rx, '#2f7de1'], ['Noise floor', l.noise, '#8a8f97']];
      let s = `<text x="0" y="10" font-size="9" fill="${C.mute}">Power levels in dBm (illustrative transmit powers; path loss from the free-space formula)</text>`;
      rows.forEach(([name, v, col], i) => { s += `<text x="0" y="${34 + i * 26}" font-size="9" fill="${C.ink}">${name}</text><rect x="100" y="${24 + i * 26}" width="${clamp(X(v) - 40, 2, 440)}" height="14" fill="${col}"/><text x="${104 + clamp(X(v) - 40, 2, 440)}" y="${35 + i * 26}" font-size="9" fill="${C.mute}">${v.toFixed(1)}</text>`; });
      s += `<text x="100" y="116" font-size="9" fill="${C.mute}">SNR = received − noise = ${l.snr.toFixed(1)} dB; capacity = B·log2(1 + SNR), B = ${n.bw / 1e6} MHz</text>`;
      return s;
    },
    note: () => 'Free space only. Real speeds are far lower. Wi-Fi 5 and band n78 are documented for your phone.',
    act(a, v, g) {
      if (a === 'nkind') { g.o.net = v; g.o.di = 0; g.t = 0; return true; }
      if (a === 'ndist') { g.o.di = Number(v); return true; }
      return false;
    },
  };

  // ---------------------------------------------------------------------------------------------- GPS
  const GPSTEPS = [['Hear satellites', 'The antenna picks up L1 signals from every satellite in view. They arrive weaker than the background noise, which is why a long correlation is needed.'], ['Find them', 'For each satellite the receiver searches a grid of code delays and Doppler shifts until its known spreading code lines up with what it hears.'], ['Track and read', 'Once locked, it follows each signal and decodes the slow navigation message: where the satellite is (ephemeris) and exactly when it sent the signal.'], ['Measure ranges', 'Arrival time minus send time, times the speed of light, gives the "pseudorange". 1 microsecond of clock error is 300 metres: the phone\'s own clock is not good enough.'], ['Solve', 'With four or more ranges it solves four unknowns together: x, y, z and its own clock error, by least squares. Watch the error shrink.'], ['Position fix', 'The result is turned into latitude and longitude. DOP says how good the satellite geometry was.']];
  DEFS.gps = {
    title: 'GPS positioning', tags: ['DOC', 'ILL', 'CALC'], sub: 'Satellite positions are invented; the position solver is real maths.',
    ctl: () => `<span class="lcap">Satellites</span>${chips('gsat', [['4', '4'], ['6', '6'], ['8', '8']], 'gs')}`,
    steps: () => GPSTEPS.map(([name, text]) => ({name, dur: 1.7, text})),
    visual({i, k}) {
      const chain = ['ant_top', 'fem2', 'soc'];
      ghost(['ant_top'], 0.3 + 0.5 * Math.sin(S.T * 4) ** 2);
      if (i >= 0) for (let j = 0; j < 2; j++) stream(rev(L(chain[j], chain[j + 1], 6)), 3, '#1f9d62');
      if (i >= 3) glow('soc', 0.4 + 0.4 * (i === 4 ? Math.sin(S.T * 8) ** 2 : 0.3));
    },
    kv(g, c) {
      const f = N.gpsFix(g.o.sats), last = f.iters[f.iters.length - 1];
      const itNow = c.i < 4 ? 0 : c.i === 4 ? Math.min(f.iters.length - 1, 1 + Math.floor(c.k * 3)) : f.iters.length - 1;
      const it = f.iters[itNow];
      return [['Satellites used', `${g.o.sats}`], ['Position error', `${it.err.toFixed(1)} m (simulated noise ±3 m)`], ['Clock error left', `${num(it.cbErr, 0)} m = ${(it.cbErr / N.C_LIGHT * 1e6).toFixed(2)} µs`], ['Starting clock error', `${num(N.C_LIGHT * N.TRUTH.b, 0)} m = ${(N.TRUTH.b * 1e6).toFixed(0)} µs`], ['DOP (geometry)', `${f.gdop.toFixed(2)} (CALC)`], ['Constellations', 'GPS L1, BDS B1I, GLONASS G1, Galileo E1, QZSS L1 (DOC)']];
    },
    svg(g, c) {
      const f = N.gpsFix(g.o.sats);
      const cx = 70, cy = 62, R = 54;
      let s = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${C.line}"/><circle cx="${cx}" cy="${cy}" r="${R * 0.66}" fill="none" stroke="${C.line}"/><circle cx="${cx}" cy="${cy}" r="${R * 0.33}" fill="none" stroke="${C.line}"/><text x="${cx - 3}" y="${cy - R - 4}" font-size="8" fill="${C.mute}">N</text>`;
      f.sats.forEach((q, i) => { const a = (q.az * Math.PI) / 180, r = ((90 - q.el) / 90) * R; const on = c.i >= 1; s += `<circle cx="${(cx + r * Math.sin(a)).toFixed(1)}" cy="${(cy - r * Math.cos(a)).toFixed(1)}" r="5" fill="${on ? '#1f9d62' : '#c4c8cd'}"/><text x="${(cx + r * Math.sin(a) - 2.5).toFixed(1)}" y="${(cy - r * Math.cos(a) + 3).toFixed(1)}" font-size="7.5" fill="#fff" font-weight="700">${q.c}</text>`; });
      s += `<text x="150" y="12" font-size="9" fill="${C.mute}">Position error after each step of the solver (metres)</text>`;
      const max = Math.log10(200);
      f.iters.forEach((it, i) => { const show = c.i > 4 || (c.i === 4 && i <= 1 + Math.floor(c.k * 3)) || i === 0; const w = show ? clamp((Math.log10(Math.max(it.err, 0.5)) + 0.4) / (max + 0.4), 0.02, 1) * 330 : 0; s += `<text x="150" y="${30 + i * 13}" font-size="9" fill="${C.ink}">${i === 0 ? 'start' : 'step ' + i}</text><rect x="196" y="${22 + i * 13}" width="${w}" height="9" fill="${i === 0 ? '#e5342b' : '#1f9d62'}"/><text x="${200 + w}" y="${30 + i * 13}" font-size="8.5" fill="${C.mute}">${show ? it.err.toFixed(1) : ''}</text>`; });
      return s;
    },
    note: () => 'Sky plot: G GPS, E Galileo, R GLONASS, C BeiDou. Positions made up. Try 4 satellites: worse DOP.',
    act(a, v, g) { if (a === 'gsat') { g.o.sats = Number(v); return true; } return false; },
  };

  // ---------------------------------------------------------------------------------------------- charging
  const CH = [['Plug in', 'The two configuration pins on the USB-C connector tell each side that something is attached, and which end is which. VBUS stays off until they agree.', 0, 0], ['Handshake', 'The charger and the phone exchange messages to agree how much power is safe. 80W SUPERVOOC is documented for your phone; the details of its voltages and currents are not published in what I could read (UNK).', 0, 0.02], ['Fast charge', 'The battery takes its largest steady power. The power management chips limit current and watch temperature and voltage all the time.', 0.02, 0.8], ['Taper', 'Near the voltage limit of the cell, the power falls so the cell is not damaged. This is why the last 20% takes longer than the first 50%.', 0.8, 1], ['Full', 'Charging stops. Battery Health Engine (documented) can limit the top-up to slow ageing; the exact policy is not documented.', 1, 1]];
  const socOf = (c) => CH[c.i][2] + (CH[c.i][3] - CH[c.i][2]) * c.k;
  DEFS.charge = {
    title: 'Battery charging and power management', tags: ['DOC', 'ILL', 'CALC'], sub: 'A generic profile. 80 W is the documented adapter rating.', ctl: () => '',
    steps: () => CH.map(([name, text]) => ({name, dur: name === 'Fast charge' ? 3.6 : name === 'Taper' ? 3 : 1.5, text})),
    visual(c) {
      const e = N.chargeAt(socOf(c));
      const on = c.i >= 1 && c.i <= 3;
      glow('usbc', 0.3 + (c.i === 0 ? 0.5 : 0)); glow('battery', 0.2 + 0.5 * socOf(c)); ghost(PM, on ? 0.5 : 0.1);
      if (on) { stream(L('usbc', 'pm7250b', 10), Math.round(2 + (e.p / 80) * 10), '#ff9d1c'); stream(L('pm7250b', 'battery', 8), Math.round(2 + (e.p / 80) * 10), '#ff7a18'); }
    },
    kv(g, c) {
      const soc = socOf(c), e = N.chargeAt(soc), tot = N.chargeAt(1).min;
      return [['Battery', `${(soc * 100).toFixed(0)}% of ${N.CHARGE.wh.toFixed(1)} Wh (3RD capacity)`], ['Power now', `${e.p.toFixed(0)} W of ${N.CHARGE.peakW} W (ILL curve)`], ['Elapsed', `${e.min.toFixed(1)} min`], ['Whole charge here', `${tot.toFixed(0)} min (ILL profile)`], ['Advertised', '52 min, 1 to 100% (third-party)'], ['Energy stored', `${(soc * N.CHARGE.wh).toFixed(1)} Wh (CALC)`]];
    },
    svg(g, c) {
      const pts = N.chargeCurve, tot = pts[pts.length - 1].min, X = (m) => 36 + (m / tot) * 500, Y = (p) => 108 - (p / 90) * 92;
      let d = '';
      pts.forEach((p, i) => (d += `${i ? 'L' : 'M'}${X(p.min).toFixed(1)} ${Y(p.p).toFixed(1)}`));
      const cur = N.chargeAt(socOf(c));
      let s = `<path d="${d} L${X(tot)} ${Y(0)} L${X(0)} ${Y(0)} Z" fill="rgba(255,122,24,.15)"/><path d="${d}" fill="none" stroke="#ff7a18" stroke-width="2"/>`;
      for (const p of [0, 40, 80]) s += `<text x="0" y="${Y(p) + 3}" font-size="8.5" fill="${C.mute}">${p} W</text>`;
      s += `<text x="${X(tot) - 60}" y="124" font-size="8.5" fill="${C.mute}">${tot.toFixed(0)} min</text><line x1="${X(cur.min)}" x2="${X(cur.min)}" y1="14" y2="108" stroke="${C.red}" stroke-width="1.6"/><circle cx="${X(cur.min)}" cy="${Y(cur.p)}" r="3.5" fill="${C.red}"/>`;
      return s;
    },
    note: () => 'Power (W) against time. Real SUPERVOOC internals are not documented, so none are shown.',
  };

  // ---------------------------------------------------------------------------------------------- thermal (continuous)
  DEFS.thermal = {
    cont: true, title: 'Heat generation and thermal management', tags: ['ILL'], sub: 'A passive phone: three thermal masses. Parameters are illustrative.',
    ctl: () => `${chips('tload', Object.entries(N.TLOADS).map(([k, v]) => [k, v.name]), 'tl')}<span style="width:6px"></span><span class="lcap">Time</span>${chips('twarp', [['10', '10×'], ['60', '60×'], ['200', '200×']], 'tw')}<div class="btn sm" data-act="tcool">Cool down</div>`,
    steps: () => [], visual: () => {},
    kv(g) {
      const s = g.tp;
      return [['Chip', `${s.T.die.toFixed(1)} °C`], ['Foil and copper', `${s.T.spread.toFixed(1)} °C`], ['Skin (glass and frame)', `${s.T.skin.toFixed(1)} °C (comfort limit ${N.TP.tSkin} °C, ILL)`], ['Power', `${s.P.toFixed(2)} W of ${N.TLOADS[g.o.work].w} W asked`], ['Clock', `${(s.clock * 100).toFixed(0)}%`], ['Sim time', `${Math.floor(s.time / 60)} min ${Math.floor(s.time % 60)} s`]];
    },
    svg(g) {
      const W = 560, H = 150, x0 = 30, span = 600, t1 = g.tp.time, t0 = Math.max(0, t1 - span), X = (t) => x0 + ((t - t0) / span) * (W - x0 - 4), Y = (t) => 10 + (1 - (t - 20) / 60) * (H - 26);
      let s = '';
      for (const v of [20, 30, 40, 50, 60, 70, 80]) s += `<line x1="${x0}" x2="${W - 4}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.line}"/><text x="${x0 - 4}" y="${Y(v) + 3}" font-size="8.5" fill="${C.mute}" text-anchor="end">${v}</text>`;
      s += `<line x1="${x0}" x2="${W - 4}" y1="${Y(N.TP.tSkin)}" y2="${Y(N.TP.tSkin)}" stroke="${C.red}" stroke-dasharray="4 3"/>`;
      const line = (key, col) => { let d = ''; g.hist.forEach((h) => { if (h.t >= t0) d += `${d ? 'L' : 'M'}${X(h.t).toFixed(1)} ${Y(h[key]).toFixed(1)}`; }); return d ? `<path d="${d}" fill="none" stroke="${col}" stroke-width="1.6"/>` : ''; };
      s += line('die', '#e5342b') + line('spread', '#f26a1b') + line('skin', '#2f7de1');
      return s + `<text x="${x0 + 4}" y="${H - 2}" font-size="8.5" fill="${C.mute}"><tspan fill="#e5342b">■</tspan> chip  <tspan fill="#f26a1b">■</tspan> foil and copper  <tspan fill="#2f7de1">■</tspan> skin   - - skin limit (last 10 min of simulated time, °C)</text>`;
    },
    note: (g) => (g.tp.scale < 0.99 ? 'Throttling: the chip or the skin reached its limit, so the OS lowered the clock. A small slowdown cuts power a lot (P ~ f³).' : 'Heat goes chip → foil and copper strip → frame and glass → air. Choose Game to watch it climb.'),
    act(a, v, g) {
      if (a === 'tload') { g.o.work = v; return true; }
      if (a === 'twarp') { g.o.warp = Number(v); return true; }
      if (a === 'tcool') { g.tp = N.createTP(); g.hist = []; return true; }
      return false;
    },
  };

  // ---------------------------------------------------------------------------------------------- one frame
  DEFS.frame = {
    title: 'How one frame is drawn and shown', tags: ['DOC', 'CALC', 'ILL'], sub: 'Input to pixels inside one refresh period.',
    ctl: () => `${chips('fhz', [['90', '90 Hz (reference)'], ['120', '120 Hz (yours)']], 'fh')}<span style="width:6px"></span>${chips('fjank', [['0', 'Normal frame'], ['1', 'Heavy frame']], 'fj')}`,
    steps: (g) => { const f = N.frameModel(g.o.hz, g.o.jank); return [['VSync', `The display controller marks the start of each refresh: every ${f.budget.toFixed(2)} ms at ${g.o.hz} Hz (CALC). Everything below is scheduled against this beat.`], ['Input and animate', 'The UI thread runs input handlers and animations for the frame (Choreographer).'], ['Build commands', 'The app records what to draw; the RenderThread turns it into GPU commands.'], ['GPU draws', `The Adreno 619 GPU runs the shaders and writes the finished frame into memory: ${f.mb.toFixed(1)} MB for ${N.SCREEN.w} × ${N.SCREEN.h} at 4 bytes per pixel (CALC).`], ['Composite', 'SurfaceFlinger and the hardware composer layer the app, the status bar and the navigation bar into one picture.'], ['Scan out', f.missed ? `Too late: the work took ${f.sum.toFixed(1)} ms, more than the ${f.budget.toFixed(1)} ms budget, so the frame misses this beat and the old picture stays for another full period (jank).` : 'The display controller reads the frame from memory and sends it row by row over the display link; the AMOLED lights its pixels.']].map(([name, text]) => ({name, dur: 1.6, text})); },
    visual({i, k, G: g}) {
      const A = L('soc', 'display', 10), up = L('soc', 'mcp', 8);
      glow('display', 0.15 + (i === 5 ? 0.5 : 0));
      if (i >= 1 && i <= 4) ghost(['soc'], 0.5 + 0.3 * Math.sin(S.T * 6) ** 2);
      if (i === 3) { stream(up, 8, '#2f7de1'); glow('mcp', 0.6); }
      if (i === 4) { stream(rev(up), 6, '#2f7de1'); glow('mcp', 0.5); }
      if (i === 5) { stream(A, 8, '#1f9d62'); stream(rev(up), 6, '#2f7de1'); }
    },
    kv(g) {
      const f = N.frameModel(g.o.hz, g.o.jank);
      return [['Refresh', `${g.o.hz} Hz (${g.o.hz === 120 ? 'yours, DOC' : 'reference, 3RD'})`], ['Time budget', `${f.budget.toFixed(2)} ms (CALC)`], ['Work this frame', `${f.sum.toFixed(1)} ms (ILL)`], ['Result', f.missed ? `missed: shown after ${f.shownMs.toFixed(1)} ms` : 'on time'], ['Frame buffer', `${f.mb.toFixed(1)} MB (CALC)`], ['Read for display', `${f.gbs.toFixed(2)} GB/s (CALC)`]];
    },
    svg(g, c) {
      const f = N.frameModel(g.o.hz, g.o.jank), per = 150, W = per * 3, X = (ms) => 30 + (ms / (f.budget * 3)) * (W - 20);
      let s = '';
      for (let v = 0; v <= 3; v++) s += `<line x1="${X(v * f.budget)}" x2="${X(v * f.budget)}" y1="8" y2="108" stroke="${v ? '#c4c8cd' : C.ink}" stroke-dasharray="${v ? '3 3' : ''}"/><text x="${X(v * f.budget) + 3}" y="20" font-size="8.5" fill="${C.mute}">VSync ${v}</text>`;
      let t = 0;
      const cols = ['#8a8f97', '#2f7de1', '#7a5af0', '#e5342b', '#1f9d62'];
      f.st.forEach(([name, ms], i) => { s += `<rect x="${X(t)}" y="34" width="${Math.max(1, X(t + ms) - X(t))}" height="26" fill="${cols[i]}" opacity="${c.i - 1 >= i || c.i === 5 ? 1 : 0.35}"/>`; if (X(t + ms) - X(t) > 26) s += `<text x="${X(t) + 3}" y="50" font-size="8.5" fill="#fff">${ms}</text>`; t += ms; });
      s += `<text x="${X(0)}" y="76" font-size="8.5" fill="${C.mute}">input, UI thread, RenderThread, GPU, composite (ms, ILL)</text>`;
      const shown = f.vsyncs * f.budget;
      s += `<rect x="${X(shown)}" y="86" width="${X(shown + f.budget) - X(shown)}" height="14" fill="${f.missed ? '#e5342b' : '#1f9d62'}"/><text x="${X(shown) + 4}" y="97" font-size="9" fill="#fff" font-weight="700">${f.missed ? 'shown late (jank)' : 'shown on time'}</text>`;
      return s;
    },
    note: (g) => (g.o.jank ? 'A heavy frame: the work no longer fits in one period, so the frame is shown one refresh late.' : 'Frames are pipelined: while one is on screen, the next is already being built.'),
    act(a, v, g) { if (a === 'fhz') { g.o.hz = Number(v); return true; } if (a === 'fjank') { g.o.jank = v === '1'; return true; } return false; },
  };

  // ---------------------------------------------------------------------------------------------- the runner
  const cur = {steps: [], total: 1};
  const build = (mode) => { const d = DEFS[mode]; cur.steps = d.steps(G); let t = 0; for (const s of cur.steps) { s.t0 = t; t += s.dur; s.t1 = t; } cur.total = t; };
  const tick = (mode, dt) => {
    const d = DEFS[mode];
    if (!d) return;
    G.acc += dt;
    const refresh = G.acc > 0.06;
    if (refresh) G.acc = 0;
    let c;
    if (d.cont) {
      let sim = G.play ? dt * G.o.warp : 0;
      while (sim > 1e-6) { const h = Math.min(0.5, sim); N.stepTP(G.tp, h, G.o.work); sim -= h; G.hacc += h; if (G.hacc >= 2) { G.hacc = 0; G.hist.push({t: G.tp.time, ...G.tp.T}); if (G.hist.length > 400) G.hist.shift(); } }
      const T = G.tp.T;
      heat('soc', clamp((T.die - 25) / 70, 0, 1)); heat('mcp', clamp((T.die - 25) / 70, 0, 1) * 0.8); heat('copper', clamp((T.spread - 25) / 45, 0, 1)); heat('battery', clamp((T.skin - 25) / 25, 0, 1) * 0.7); heat('bottomboard', clamp((T.skin - 25) / 25, 0, 1) * 0.4);
      const n = Math.round(G.tp.P * 3);
      if (n > 0) fx.flow(L('soc', 'copper', 7), n, 40 + G.tp.P * 6, '#ff5a2a', 2.2, {follow: null, jitter: 0.4});
      c = {};
    } else {
      build(mode);
      const total = cur.total + 1;
      if (G.play) G.t = (G.t + dt * G.slow) % total;
      const t = Math.min(G.t, cur.total - 0.001);
      let i = cur.steps.findIndex((s) => t < s.t1);
      if (i < 0) i = cur.steps.length - 1;
      const s = cur.steps[i];
      c = {i, k: clamp((t - s.t0) / s.dur, 0, 1), s, G};
      d.visual(c);
    }
    if (!refresh) return;
    ui.set('play', G.play ? '❚❚ Pause' : '▶ Play'); ui.set('slow', `Speed ${G.slow}×`);
    if (!d.cont) { ui.html('seg', cur.steps.map((s, i) => `<div class="${i === c.i ? 'on' : i < c.i ? 'done' : ''}" data-act="gseek" data-v="${i}" style="width:${Math.max(56, (880 - 2 * cur.steps.length) * s.dur / cur.total).toFixed(0)}px">${esc(s.name)}<small>${esc(s.sub || '')}</small></div>`).join('')); ui.set('stext', c.s.text); }
    else ui.set('stext', d.note(G));
    ui.html('gsvg', d.svg(G, c));
    ui.html('gkv', d.kv(G, c).map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join(''));
    if (!d.cont) ui.set('gnote', d.note(G));
    // option chips
    for (const [k, on] of [['nk-wifi', G.o.net === 'wifi'], ['nk-nr', G.o.net === 'nr'], ['fh-90', G.o.hz === 90], ['fh-120', G.o.hz === 120], ['fj-0', !G.o.jank], ['fj-1', G.o.jank], ['tw-10', G.o.warp === 10], ['tw-60', G.o.warp === 60], ['tw-200', G.o.warp === 200], ['gs-4', G.o.sats === 4], ['gs-6', G.o.sats === 6], ['gs-8', G.o.sats === 8]]) ui.cls(k, 'on', on);
    for (const k of Object.keys(N.TLOADS)) ui.cls(`tl-${k}`, 'on', G.o.work === k);
    if (mode === 'net') ui.html('dchips', N.NETS[G.o.net].dist.map((d, i) => `<div class="btn sm ${i === G.o.di ? 'on' : ''}" data-act="ndist" data-v="${i}" style="text-transform:none">${d >= 1000 ? d / 1000 + ' km' : d + ' m'}</div>`).join(''));
  };
  const act = (a, v, mode) => {
    const d = DEFS[mode];
    if (!d) return false;
    if (a === 'gplay') G.play = !G.play;
    else if (a === 'grestart') { G.t = 0; G.play = true; }
    else if (a === 'gslow') G.slow = [0.5, 1, 2][([0.5, 1, 2].indexOf(G.slow) + 1) % 3];
    else if (a === 'gseek') { build(mode); G.t = cur.steps[Number(v)].t0 + 0.01; G.play = true; }
    else if (d.act && d.act(a, v, G)) { /* handled */ }
    else return false;
    return true;
  };
  return {G, DEFS, act, enter() { G.t = 0; G.play = true; G.slow = 1; G.acc = 1; }, tick};
}
