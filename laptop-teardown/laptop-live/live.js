// The laptop as a page you drive. A part is selected from the 3D view or the list; the Explode slider peels the machine
// apart; seven modes (explore and six visualisations) run on the model in model.js. Left alone it plays a tour that any
// click, drag, wheel or key hands to the visitor; 25 s of quiet hands it back. Quality tiers start low for integrated
// GPUs and step down by themselves.
import {warmComposer} from 'teardown-kit/warm.js';
import * as THREE from 'three';
import {CATALOG} from './data.js';
import {createConsole, C, MODES, diagramSvg} from './console.js';
import {createFx} from './fx.js';
import * as M from './model.js';
import {createStage} from './stage.js';

const W = 1600;
const H = 900;
const IDLE = 25;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wrap = (d) => ((((d + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
const V3 = THREE.Vector3;

const CSS = `
html,body{background:#e9ebee;overflow:hidden}
#app{position:absolute!important;inset:auto!important;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
#gl{position:absolute;left:0;top:0;width:${W}px;height:${H}px;touch-action:none;cursor:grab}
#gl.drag{cursor:grabbing}#gl.hov{cursor:pointer}
.turn{position:fixed;left:0;right:0;bottom:18px;text-align:center;font:600 12px/1.4 'JetBrains Mono',monospace;letter-spacing:1px;color:#8b8f95;text-transform:uppercase;display:none}
@media (orientation:portrait) and (max-width:820px){.turn{display:block}}
`;

const TOP = ['ccover', 'keyboard', 'touchpad'];
const NAMES = {ram1: 'Module 1', ram2: 'Module 2', fan1: 'Left fan', fan2: 'Right fan', hp1: 'Pipe 1', hp2: 'Pipe 2', hp3: 'Pipe 3', fins1: 'Left fins', fins2: 'Right fins', speaker1: 'Left', speaker2: 'Right', vrm_cpu: 'CPU rail', vrm_gpu: 'GPU rail', lid_a: 'Back cover', bezel: 'Front bezel', cable_edp: 'Board side', cable_edp_lid: 'Lid side', cable_ant: 'Board side', cable_ant_lid: 'Lid side'};

const VIEWS = {
  iso: {az: 0.55, el: 0.5, d: 10.6},
  top: {az: 0.0, el: 1.45, d: 7.6},
  front: {az: 0.0, el: 0.1, d: 9.4},
  back: {az: Math.PI - 0.5, el: 0.4, d: 9.4},
  topiso: {az: 0.3, el: 1.2, d: 10.4},
};
// what each mode sets up when it starts: how far apart, how far the lid is open, whether the top case is off
const SETUP = {
  explore: {},
  power: {explode: 0.5, lid: 100, topOff: true, view: 'topiso'},
  memory: {explode: 0.6, lid: 100, topOff: true, view: 'topiso'},
  storage: {explode: 0.6, lid: 100, topOff: true, view: 'topiso'},
  cpu: {explode: 0.6, lid: 100, topOff: true, view: 'topiso'},
  thermal: {explode: 0.0, lid: 100, topOff: true, view: 'topiso'},
  boot: {explode: 0.0, lid: 105, topOff: true, view: 'iso', cam: {ty: 0.95, tz: -0.1, d: 13.6, el: 0.42}},
};
const STEPNAME = {off: 'Off', pwr: 'Button', rails: 'Rails', reset: 'Reset', pei: 'Memory', dxe: 'Devices', bds: 'Boot mgr', load: 'Kernel in', kernel: 'OS', ready: 'Desktop'};
const RAILCOL = {aon: '#ff9d1c', vsys: '#ff7a18', '5v': '#f2c230', '3v3': '#19b8d4', ddr: '#3ddc84', core: '#ff4b6e'};

export async function runLive() {
  document.title = 'Laptop · Teardown: an interactive 3D simulator';
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const app = document.getElementById('app');
  // the inlined fonts decode asynchronously; the keyboard legends and chip markings are drawn once, so wait for them
  await Promise.all([document.fonts.load('600 20px Inter'), document.fonts.load('500 20px Inter'), document.fonts.load('600 20px "JetBrains Mono"')]).catch(() => {});
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);
  let st;
  try {
    st = createStage({canvas});
  } catch (e) {
    app.innerHTML = '<div style="position:absolute;left:0;top:0;width:1600px;height:900px;display:flex;align-items:center;justify-content:center;font:600 18px Inter,sans-serif;color:#16181b;text-align:center;line-height:1.6">This simulator needs WebGL, which this browser or device did not provide.<br>Try a current Chrome, Edge, Firefox or Safari with hardware acceleration on.</div>';
    console.error(e);
    return;
  }
  const {lap} = st;
  const fx = createFx(lap, st.scene, st.renderer, st.camera);
  const ui = createConsole(app);
  const parts = lap.parts;
  const PATH = lap.PATH;
  const note = document.createElement('div');
  note.className = 'turn';
  note.textContent = 'Turn your phone sideways for the full console';
  document.body.appendChild(note);

  // ------------------------------------------------------------ quality tiers (integrated GPUs first)
  const TIERS = [
    {name: 'HIGH', samples: 4, ao: true, shadow: 2048, pr: 2},
    {name: 'MEDIUM', samples: 4, ao: false, shadow: 1024, pr: 1.5},
    {name: 'LOW', samples: 0, ao: false, shadow: 1024, pr: 1},
  ];
  let gpuName = '';
  try {
    const gl = st.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpuName = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
  } catch (e) {}
  const soft = /swiftshader|llvmpipe|software|basic render/i.test(gpuName);
  const discrete = /nvidia|geforce|rtx|gtx|radeon (rx|pro)|arc a/i.test(gpuName) && !/laptop|mobile|max-q/i.test(gpuName);
  const coarse = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700;
  let tier = coarse || soft ? 2 : discrete ? 0 : 1; // an unknown or integrated GPU starts in the middle
  let scale = 1;
  const fit = () => {
    scale = Math.min(innerWidth / W, innerHeight / H);
    app.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
    st.resize(W, H, clamp((devicePixelRatio || 1) * scale, 0.75, TIERS[tier].pr));
  };
  const applyTier = () => {
    const {pr, name, ...q} = TIERS[tier];
    st.setQuality(q);
    fit();
    ui.set('qual', `Quality · ${name}`);
  };
  applyTier();
  addEventListener('resize', fit);
  const toStage = (cx, cy) => {
    const r = app.getBoundingClientRect();
    return [(cx - r.left) / scale, (cy - r.top) / scale];
  };

  // ------------------------------------------------------------ state
  const S = {
    T: 0, mode: 'explore', sel: null, hover: null, tab: 'does',
    explode: 0, exTarget: 0, lid: 105, lidTarget: 105, topOff: false, iso: false, hidden: false, follow: false,
    load: 'web', adapter: 'w60', soc: 0.62, warp: 1,
    playing: true, slow: 1, mem: {kind: 'read', rowOpen: false, t: 0}, io: {key: 'seq1m', t: 0},
    cpu: {c: 0}, boot: {t: 0}, screen: 'desktop',
    fanAng: [0, 0], th: M.createThermal(), hist: [], histAcc: 0,
  };
  S.memS = M.memSteps(S.mem.kind, S.mem.rowOpen);
  S.ioS = M.nvmeRead(S.io.key);
  const PROGRAM = M.runProgram();
  // pre-warm the thermal state to a settled idle so the first look is not a cold start
  for (let i = 0; i < 6000; i++) M.stepThermal(S.th, 0.1, 'web');

  const cam = {az: 0.55, el: 0.5, d: 9.4, tx: 0, ty: 0.7, tz: -0.1};
  const camT = {...cam};
  const home = () => {
    const s = Math.sin((S.lid * Math.PI) / 180);
    return {tx: 0, ty: 0.2 + 0.7 * s + 0.1 * S.explode, tz: -0.1 * s};
  };
  const setView = (name) => {
    Object.assign(camT, VIEWS[name], home());
    camT.d *= 1 + 0.16 * S.explode;
    S.follow = false;
  };
  setView('iso');
  Object.assign(cam, camT);

  const entryOf = (id) => parts[id].entry;
  const partsOf = (entry) => lap.entryParts[entry] || [];
  const isTop = (id) => TOP.includes(id);
  const isLid = (id) => parts[id].obj.parent === lap.lidPivot || id === 'hinge';

  // ------------------------------------------------------------ selection
  const focusOn = (id, dist) => {
    const sz = lap.sizeOf(id);
    const c = lap.center(id);
    const r = Math.max(sz.x, sz.y, sz.z);
    camT.d = clamp(dist ?? r * 3.0 + 1.5, 1.6, 9);
    if (!isLid(id)) camT.el = Math.max(camT.el, 0.95);
    camT.tx = c.x;
    camT.ty = c.y;
    camT.tz = c.z;
    S.follow = true;
  };
  // the Connections tab: pull back far enough that the selected part and everything it links to are in view
  const fitLinks = () => {
    const e = CATALOG[entryOf(S.sel)];
    const b = new THREE.Box3();
    b.expandByPoint(lap.center(S.sel));
    for (const [to] of e.links) {
      const id = partsOf(to)[0];
      if (id) b.expandByPoint(lap.center(id));
    }
    const c = b.getCenter(new V3());
    const sz = b.getSize(new V3());
    camT.tx = c.x;
    camT.ty = c.y;
    camT.tz = c.z;
    camT.d = clamp(Math.max(sz.x, sz.z) * 1.1 + sz.y * 0.5 + 3.4, 4.5, 13);
    camT.el = Math.max(camT.el, 0.95);
    S.follow = false;
  };
  const refreshInspector = () => {
    if (!S.sel) {
      ui.inspect(null, S.tab, {mode: S.mode});
      ui.markList(null);
      return;
    }
    const e = entryOf(S.sel);
    const ps = partsOf(e);
    ui.inspect(e, S.tab, {parts: ps, part: S.sel, partNames: ps.map((p) => NAMES[p] || p), open: parts[S.sel].openK, pulled: !!parts[S.sel].pullT});
    ui.markList(e);
  };
  const select = (id, fly = true) => {
    if (id && !parts[id]) return;
    S.sel = id;
    S.occ = null;
    refreshInspector();
    if (id && fly) {
      if (!isTop(id) && !isLid(id) && !S.topOff && S.explode < 0.05) S.autoOff = true;
      focusOn(id);
    }
    if (!id) {
      S.autoOff = false;
      S.follow = false;
      // back out to the whole machine, keeping the angle the visitor chose
      const v = S.mode === 'explore' ? VIEWS.iso : VIEWS.topiso;
      Object.assign(camT, home(), {d: v.d * (1 + 0.16 * S.explode), el: Math.min(camT.el, v.el + 0.2)});
      if (S.mode !== 'explore') Object.assign(camT, {ty: 0.28, tz: 0.12});
    }
  };
  const selectEntry = (entry) => {
    const ps = partsOf(entry);
    if (!ps.length) return;
    select(ps.includes(S.sel) ? S.sel : ps[0]);
  };

  // ------------------------------------------------------------ mode changes
  const enterMode = (mode, auto = false) => {
    S.mode = mode;
    ui.setMode(mode);
    for (const [k] of MODES) ui.cls(`mode-${k}`, 'on', k === mode);
    const su = SETUP[mode];
    if (su.explode != null) S.exTarget = su.explode;
    if (su.lid != null) S.lidTarget = su.lid;
    if (su.topOff != null) S.topOff = su.topOff;
    if (mode === 'explore') S.topOff = false;
    S.autoOff = false;
    S.playing = true;
    S.slow = 1;
    S.mem.t = 0;
    S.io.t = 0;
    S.cpu.c = 0;
    S.boot.t = 0;
    S.screen = mode === 'boot' ? 'off' : 'desktop';
    if (su.view) setView(su.view);
    if (mode !== 'explore' && su.view === 'topiso') Object.assign(camT, {ty: 0.28, tz: 0.12});
    if (su.cam) Object.assign(camT, su.cam);
    if (!S.sel) refreshInspector();
    if (mode === 'thermal') {
      S.load = 'gaming';
      S.warp = 10;
      S.hist.length = 0;
    }
    if (mode === 'power' && S.load === 'gaming') S.load = 'web';
    if (mode === 'power') S.adapter = 'w60';
    syncControls();
  };

  // ------------------------------------------------------------ controls
  const syncControls = () => {
    ui.set('exv', `${Math.round(S.explode * 100)}%`);
    ui.set('lidv', `${Math.round(S.lid)}°`);
    ui.cls('xray', 'on', S.topOff || S.autoOff);
    ui.set('xray', S.topOff ? 'Top case on' : 'Top case off');
    ui.cls('xray', 'on', S.topOff);
    ui.set('take', S.exTarget > 0.5 ? 'Put together' : 'Take apart');
    ui.cls('isoBtn', 'on', S.iso);
    for (const k of M.LOAD_KEYS) ui.cls(`load-${k}`, 'on', S.load === k);
    for (const k of ['none', 'w60', 'w100']) ui.cls(`ad-${k}`, 'on', S.adapter === k);
    ui.cls('m-read', 'on', S.mem.kind === 'read');
    ui.cls('m-write', 'on', S.mem.kind === 'write');
    ui.cls('m-closed', 'on', !S.mem.rowOpen);
    ui.cls('m-open', 'on', S.mem.rowOpen);
    for (const k of ['rand4k', 'seq1m', 'file1g']) ui.cls(`io-${k}`, 'on', S.io.key === k);
    for (const k of [1, 10, 60]) ui.cls(`w-${k}`, 'on', S.warp === k);
    ui.set('play', S.playing ? '❚❚ Pause' : '▶ Play');
    ui.set('slow', `Speed ${S.slow}×`);
    const sl = ui.node('socv');
    if (sl) ui.set('socv', `${Math.round(S.soc * 100)}%`);
    const e = ui.root.querySelector('[data-in=explode]');
    if (e && document.activeElement !== e) e.value = Math.round(S.exTarget * 100);
    const l = ui.root.querySelector('[data-in=lid]');
    if (l && document.activeElement !== l) l.value = Math.round(S.lidTarget);
  };
  const setLoad = (k) => {
    S.load = k;
    syncControls();
  };
  const act = (a, v, el) => {
    if (a === 'mode') enterMode(v);
    else if (a === 'pick') selectEntry(v);
    else if (a === 'part') select(v);
    else if (a === 'tab') {
      const was = S.tab;
      S.tab = v;
      refreshInspector();
      if (S.sel && v === 'links') fitLinks();
      else if (S.sel && was === 'links') focusOn(S.sel);
    } else if (a === 'take') {
      S.exTarget = S.exTarget > 0.5 ? 0 : 1;
      if (S.exTarget > 0.5 && S.lidTarget < 60) S.lidTarget = 100;
      syncControls();
    } else if (a === 'xray') {
      S.topOff = !S.topOff;
      S.autoOff = false;
      syncControls();
    } else if (a === 'iso') {
      S.iso = !S.iso;
      syncControls();
    } else if (a === 'view') setView(v);
    else if (a === 'qual') {
      tier = (tier + 1) % TIERS.length;
      applyTier();
    } else if (a === 'load') setLoad(v);
    else if (a === 'adapter') {
      S.adapter = v;
      syncControls();
    } else if (a === 'play') {
      S.playing = !S.playing;
      syncControls();
    } else if (a === 'restart') {
      S.mem.t = 0;
      S.io.t = 0;
      S.cpu.c = 0;
      S.boot.t = 0;
      S.playing = true;
      syncControls();
    } else if (a === 'slow') {
      const L = S.mode === 'cpu' ? [0.5, 1, 2, 4] : [0.5, 1, 2];
      S.slow = L[(L.indexOf(S.slow) + 1) % L.length] ?? 1;
      syncControls();
    } else if (a === 'mrw') {
      S.mem.kind = v;
      S.memS = M.memSteps(S.mem.kind, S.mem.rowOpen);
      S.mem.t = 0;
      syncControls();
    } else if (a === 'mrow') {
      S.mem.rowOpen = v === '1';
      S.memS = M.memSteps(S.mem.kind, S.mem.rowOpen);
      S.mem.t = 0;
      syncControls();
    } else if (a === 'iosz') {
      S.io.key = v;
      S.ioS = M.nvmeRead(v);
      S.io.t = 0;
      syncControls();
    } else if (a === 'cstep') {
      S.playing = false;
      S.cpu.c = clamp(Math.floor(S.cpu.c) + Number(v), 0, PROGRAM.cycles - 1);
      syncControls();
    } else if (a === 'warp') {
      S.warp = Number(v);
      syncControls();
    } else if (a === 'cool') {
      S.th = M.createThermal();
      for (let i = 0; i < 3000; i++) M.stepThermal(S.th, 0.1, 'idle');
      S.hist.length = 0;
    } else if (a === 'bstep') {
      const i = M.bootAt(S.boot.t).i + Number(v);
      S.boot.t = M.BOOT[clamp(i, 0, M.BOOT.length - 1)].t + 0.01;
      S.playing = false;
      syncControls();
    } else if (a === 'seek') {
      const i = Number(v);
      if (S.mode === 'boot') S.boot.t = M.BOOT[i].t + 0.01;
      else if (S.mode === 'memory') S.mem.t = S.memS.steps[i].t0 + 0.01;
      else if (S.mode === 'storage') S.io.t = ioStages()[i].d0 + 0.01;
      S.playing = true;
      syncControls();
    } else if (a === 'pull') {
      const p = parts[S.sel];
      if (p) {
        p.pullT = p.pullT ? 0 : 1;
        if (p.pullT) S.follow = true;
        refreshInspector();
      }
    } else if (a === 'focus') {
      if (S.sel) focusOn(S.sel);
    } else if (a === 'tour') {
      if (AP.on) takeOver();
      else startTour();
    }
  };
  ui.root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act !== 'tour') takeOver();
    act(b.dataset.act, b.dataset.v, b);
  });
  ui.root.addEventListener('input', (e) => {
    const t = e.target;
    const k = t.dataset?.in;
    if (!k) return;
    takeOver();
    const v = Number(t.value);
    if (k === 'explode') {
      S.exTarget = v / 100;
      S.explodeFast = true;
      if (v > 50 && S.lidTarget < 60) S.lidTarget = 100;
    } else if (k === 'lid') S.lidTarget = v;
    else if (k === 'soc') S.soc = v / 100;
    else if (k === 'open' && S.sel) parts[S.sel].openK = v / 100;
    syncControls();
  });
  // hovering a list row lights the part in 3D
  ui.list.addEventListener('pointermove', (e) => {
    const it = e.target.closest('.it');
    S.listHover = it ? it.dataset.v : null;
  });
  ui.list.addEventListener('pointerleave', () => (S.listHover = null));

  // ------------------------------------------------------------ the 3D pointer: orbit, pan, zoom, hover, pick
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    takeOver();
    const [x, y] = toStage(e.clientX, e.clientY);
    drag = {x: e.clientX, y: e.clientY, sx: x, sy: y, moved: 0, pan: e.button === 2 || e.shiftKey};
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('drag');
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = toStage(e.clientX, e.clientY);
    if (!drag) {
      S.ptr = [x, y];
      return;
    }
    const dx = (e.clientX - drag.x) / scale;
    const dy = (e.clientY - drag.y) / scale;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (drag.pan) {
      const k = camT.d * 0.0011;
      const right = new V3(Math.cos(camT.az), 0, -Math.sin(camT.az));
      camT.tx -= right.x * dx * k;
      camT.tz -= right.z * dx * k;
      camT.ty += dy * k;
      S.follow = false;
    } else {
      camT.az -= dx * 0.0062;
      camT.el = clamp(camT.el + dy * 0.005, -0.05, 1.5);
    }
    lastInput = S.T;
  });
  const endDrag = (e) => {
    if (drag && drag.moved < 5 && e.type === 'pointerup') {
      const [x, y] = toStage(e.clientX, e.clientY);
      const id = st.pick(x, y);
      if (id) select(id);
      else if (S.sel) select(null);
    }
    drag = null;
    canvas.classList.remove('drag');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => (S.ptr = null));
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    takeOver();
    camT.d = clamp(camT.d * Math.exp(e.deltaY * 0.0012), 0.9, 14);
  }, {passive: false});
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || /input|textarea/i.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    takeOver();
    if (/^[1-7]$/.test(k)) enterMode(MODES[Number(k) - 1][0]);
    else if (k === ' ') {
      S.playing = !S.playing;
      syncControls();
    } else if (k === 'h') S.hidden = !S.hidden;
    else if (k === 'e') act('take');
    else if (k === 'x') act('xray');
    else if (k === 'escape') select(null);
    else return;
    e.preventDefault();
  });

  // ------------------------------------------------------------ the tour
  const AP = {on: true, t0: 0, i: 0};
  let lastInput = 0;
  const TOUR = [
    [0, () => { enterMode('explore'); S.exTarget = 0; S.lidTarget = 105; select(null); setView('iso'); }],
    [4.5, () => { S.exTarget = 1; setView('iso'); camT.d *= 1.05; }],
    [10.5, () => { select('soc'); S.tab = 'works'; refreshInspector(); }],
    [16, () => { select('ram1'); S.tab = 'does'; refreshInspector(); }],
    [21, () => { select(null); enterMode('power'); S.load = 'gaming'; syncControls(); }],
    [28, () => enterMode('memory')],
    [37, () => enterMode('storage')],
    [46, () => enterMode('cpu')],
    [58, () => { enterMode('thermal'); }],
    [68, () => enterMode('boot')],
    [86, () => { enterMode('explore'); S.exTarget = 0; setView('iso'); }],
  ];
  const TOUR_LEN = 92;
  const startTour = () => {
    AP.on = true;
    AP.t0 = S.T;
    AP.i = 0;
    S.playing = true;
  };
  const takeOver = () => {
    lastInput = S.T;
    AP.on = false;
  };
  const tourTick = () => {
    if (!AP.on) {
      if (S.T - lastInput > IDLE) startTour();
      return;
    }
    const c = (S.T - AP.t0) % TOUR_LEN;
    const loop = Math.floor((S.T - AP.t0) / TOUR_LEN);
    const idx = loop * 100 + TOUR.filter(([t]) => t <= c).length;
    if (idx !== AP.i) {
      AP.i = idx;
      const ev = TOUR.filter(([t]) => t <= c).pop();
      if (ev) ev[1]();
      // show which control the tour just used
      const spot = ev && ui.spot(`[data-k="mode-${S.mode}"]`);
      if (spot && S.mode !== 'explore') ui.flash(...spot);
    }
  };
  ui.root.querySelector('.tour').addEventListener('pointerdown', (e) => e.stopPropagation());

  // ------------------------------------------------------------ helper paths
  const concat = (...ps) => ({pts: ps.flatMap((p) => p.pts), follow: 'board'});
  const reverse = (p) => ({pts: [...p.pts].reverse(), follow: p.follow});
  const Y0 = 3.2 + 0.5;
  // every path rides on the part it is drawn on, so it stays attached when that part lifts out
  for (const [k, p] of Object.entries(PATH)) {
    if (/^(bus|pwr)_/.test(k)) p.follow = 'board';
    else if (/^hp\d$/.test(k)) p.follow = k;
  }
  PATH.cell.follow = 'battery';
  PATH.cable_bat.follow = 'cable_bat';
  PATH.air1.forEach((p) => (p.follow = 'fan1'));
  PATH.air2.forEach((p) => (p.follow = 'fan2'));
  const socHop = {pts: [new V3(-18, Y0, -53.5), new V3(-34, Y0, -53.5)], follow: 'board'};
  const ssdRam = concat(reverse(PATH.bus_pcieSsd), socHop, PATH.bus_ddrA); // SSD to the first DIMM
  const ssdCpu = reverse(PATH.bus_pcieSsd);
  const cpuMc = {pts: [new V3(-26, 5.4, -66), new V3(-30, 5.4, -60), new V3(-34, Y0, -53.5)], follow: 'soc'};
  const coreIn = {pts: [new V3(-51, Y0, -66), new V3(-42, Y0, -66)], follow: 'vrm_cpu'};
  const gpuIn = {pts: [new V3(52, Y0, -66), new V3(48.5, Y0, -66)], follow: 'vrm_gpu'};

  // ------------------------------------------------------------ per-frame bookkeeping
  const want = {glow: {}, heat: {}};
  const glow = (id, v) => (want.glow[id] = Math.max(want.glow[id] || 0, v));
  const heat = (id, v) => (want.heat[id] = Math.max(want.heat[id] || 0, v));
  const anchors = [];
  const anchor = (id, dy, text, sub, tone, dx = 0) => {
    const c = lap.center(id);
    const a = st.project(c);
    if (!a) return;
    anchors.push({x: a[0] + dx, y: a[1] - dy, text, sub, tone, from: a});
  };
  const fmtW = (w) => (Math.abs(w) < 10 ? w.toFixed(1) : Math.round(w)) + ' W';
  const cntOf = (I) => (I < 0.02 ? 0 : Math.min(34, Math.round(3 + 5.5 * Math.log2(1 + I))));
  const spdOf = (I) => 38 + 9 * Math.log2(1 + I);

  // ================================================================ POWER
  const powerMode = (dt) => {
    const th = S.th;
    const pf = M.powerFlow({load: S.load, adapter: S.adapter, soc: S.soc, tc: th.tc, tg: th.tg, fanW: th.fanW});
    S.pf = pf;
    const vs = pf.vBat;
    const R = Object.fromEntries(pf.rails.map((r) => [r.id, r]));
    const pw = (id) => PATH[`pwr_${id}`];
    const on = (id, col, k = 1) => fx.trace(`pwr_${id}`, col, k);
    const f = (path, I, col, o = {}) => fx.flow(path, cntOf(I), spdOf(I), col, 1.7, {follow: 'board', ...o});
    if (pf.iPort > 0.01) {
      on('vbus', '#ff9d1c');
      f(pw('vbus'), pf.iPort, '#ff9d1c');
      glow('port_usbc', 0.5);
    }
    const iAd = pf.pAdapt / vs;
    on('pdChg', '#ff7a18', iAd > 0.01 ? 1 : 0.25);
    on('trunk', '#ff7a18', 1);
    on('batt', '#ff7a18', 0.9);
    if (iAd > 0.01) {
      f(pw('pdChg'), iAd, '#ff7a18');
      f(pw('trunk'), iAd, '#ff7a18');
    }
    const iB = Math.abs(pf.pBat) / vs;
    if (iB > 0.01) {
      const d = pf.pBat > 0 ? 1 : -1; // discharging: cells -> cable -> connector -> trunk
      fx.flow(PATH.cell, cntOf(iB), spdOf(iB), '#ff7a18', 1.7, {dir: d, follow: 'battery'});
      fx.flow(PATH.cable_bat, cntOf(iB), spdOf(iB), '#ff7a18', 1.7, {dir: d, follow: 'cable_bat'});
      f(pw('batt'), iB, '#ff7a18', {dir: -d});
      if (pf.pBat > 0) f(pw('trunk'), iB, '#ff7a18', {dir: -1});
      glow('battery', 0.35);
    }
    const col = {cpu: '#ff4b6e', gpu: '#ff4b6e', ram: '#f2c230', ssd: '#19b8d4', wifi: '#19b8d4', disp: '#ff7a18', fan: '#f2c230'};
    const branch = {cpu: ['cpu'], gpu: ['gpu'], ram: ['ram1', 'ram2'], ssd: ['ssd'], wifi: ['wifi'], disp: ['disp'], fan: ['fan1', 'fan2']};
    for (const [rid, paths] of Object.entries(branch)) {
      const r = R[rid];
      const I = r.pIn / vs / paths.length;
      for (const p of paths) {
        on(p, col[rid], I > 0.02 ? 1 : 0.3);
        f(pw(p), I, col[rid]);
      }
    }
    // the last inch: the same watts at about 1 V are tens of amps
    fx.flow(coreIn, Math.min(40, Math.round(R.cpu.A * 0.9)), 22 + R.cpu.A * 0.6, '#ff4b6e', 1.5, {follow: 'vrm_cpu', fade: false});
    fx.flow(gpuIn, Math.min(40, Math.round(R.gpu.A * 0.45)), 22 + R.gpu.A * 0.3, '#ff4b6e', 1.5, {follow: 'vrm_gpu', fade: false});
    glow('vrm_cpu', 0.2 + 0.4 * (R.cpu.pOut / 45));
    glow('vrm_gpu', 0.2 + 0.4 * (R.gpu.pOut / 80));
    glow('pd', 0.4);
    glow('soc', 0.15 + R.cpu.pOut / 100);
    glow('gpu', R.gpu.pOut > 5 ? 0.15 + R.gpu.pOut / 200 : 0);
    anchor('port_usbc', 34, pf.iPort > 0 ? `${pf.vPort} V × ${pf.iPort.toFixed(2)} A` : 'No charger', pf.iPort > 0 ? fmtW(pf.pPort) + ' in' : 'battery only', '#ff9d1c', -10);
    anchor('battery', 40, `${pf.vBat.toFixed(1)} V pack`, pf.pBat > 0 ? `discharging ${fmtW(pf.pBat)}` : `charging ${fmtW(-pf.pBat)}`, '#ff7a18');
    anchor('vrm_cpu', 36, `Core ${R.cpu.V.toFixed(2)} V`, `${R.cpu.A.toFixed(0)} A · ${fmtW(R.cpu.pOut)}`, '#ff4b6e', -30);
    if (R.gpu.pOut > 2) anchor('vrm_gpu', 36, `GPU ${R.gpu.V.toFixed(2)} V`, `${R.gpu.A.toFixed(0)} A · ${fmtW(R.gpu.pOut)}`, '#ff4b6e', 26);
    anchor('ram1', 26, 'DDR5 1.1 V', `${R.ram.A.toFixed(1)} A`, '#3ddc84');
    return pf;
  };

  // ================================================================ CPU <-> RAM
  const stepAt = (steps, t) => {
    let i = steps.length - 1;
    for (let k = 0; k < steps.length; k++) if (t < steps[k].t1) {
      i = k;
      break;
    }
    const s = steps[i];
    return {i, s, k: clamp((t - s.t0) / Math.max(1e-6, s.dur), 0, 1)};
  };
  const memoryMode = (dt) => {
    const m = S.mem;
    const total = S.memS.total + 1.0;
    if (S.playing) m.t = (m.t + dt * S.slow) % total;
    const t = Math.min(m.t, S.memS.total - 0.001);
    const {i, s, k} = stepAt(S.memS.steps, t);
    const bus = PATH.bus_ddrA;
    const rd = S.mem.kind === 'read';
    fx.trace('bus_ddrA', '#4aa3ff', 1);
    fx.trace('bus_ddrB', '#4aa3ff', 0.22);
    glow('soc', 0.3);
    glow('ram1', 0.25);
    const hl = (id, v) => glow(id, v);
    if (s.id === 'miss') {
      fx.packet(cpuMc, k, '#ff4b6e', 2.6, {follow: 'soc'});
      fx.packet(cpuMc, clamp(k - 0.2, 0, 1), '#ff4b6e', 2.0, {follow: 'soc'});
      hl('soc', 0.8);
    } else if (s.who === 'cmd') {
      fx.train(bus, k, 22, 6, '#2f7de1', 2.6);
      hl('soc', 0.5);
      hl('ram1', 0.3 + 0.4 * k);
    } else if (s.who === 'dram') {
      hl('ram1', 0.55 + 0.25 * Math.sin(S.T * 9));
      for (let q = 0; q < 3; q++) fx.dot(-89 + (q - 1) * 20, 7.6, -7 + (q % 2) * 4, '#2f7de1', 2.0 + 1.2 * Math.sin(S.T * 8 + q), 0.8, 'ram1');
    } else if (s.who === 'data') {
      const dir = rd ? 1 : -1; // read: toward the CPU; write: away from it
      for (let q = 0; q < 16; q++) {
        const u = rd ? 1 - (k * 1.35 - q * 0.032) : k * 1.35 - q * 0.032;
        if (u >= 0 && u <= 1) fx.packet(bus, u, rd ? '#1f9d62' : '#f26a1b', 2.5, {follow: null});
      }
      hl('ram1', 0.8);
      hl('soc', 0.5 + 0.3 * k);
    } else if (s.id === 'fill') {
      fx.packet({pts: [...cpuMc.pts].reverse()}, k, '#1f9d62', 2.6, {follow: 'soc'});
      hl('soc', 0.8 * (1 - k) + 0.2);
    }
    anchor('soc', 32, 'Memory controller', 'on the CPU die', C.ink, -12);
    anchor('ram1', 28, 'DDR5 SO-DIMM', rd ? 'reading' : 'writing', C.blue);
    return {i, s, k, t};
  };

  // ================================================================ SSD -> RAM
  const ioStages = () => {
    // screen time per stage: a floor so every stage can be seen, plus a log-scaled share of its real length
    let t = 0;
    return S.ioS.stages.map((s) => {
      const d = 0.9 + 0.55 * Math.log10(1 + s.us);
      const o = {...s, d, d0: t, d1: t + d};
      t += d;
      return o;
    });
  };
  const storageMode = (dt) => {
    const stg = ioStages();
    const total = stg[stg.length - 1].d1 + 1.2;
    if (S.playing) S.io.t = (S.io.t + dt * S.slow) % total;
    const t = Math.min(S.io.t, total - 1.2 - 0.001);
    let i = stg.findIndex((s) => t < s.d1);
    if (i < 0) i = stg.length - 1;
    const s = stg[i];
    const k = clamp((t - s.d0) / s.d, 0, 1);
    fx.trace('bus_pcieSsd', '#a77bff', 1);
    fx.trace('bus_ddrA', '#4aa3ff', s.id === 'dma' || s.id === 'sub' || s.id === 'fetch' || s.id === 'done' ? 1 : 0.2);
    glow('ssd', 0.3);
    glow('soc', 0.25);
    const sub = clamp(k * 2, 0, 1);
    if (s.id === 'sub') {
      if (k < 0.5) fx.train(PATH.bus_ddrA, sub, 22, 5, '#2f7de1', 2.6);
      else fx.train(PATH.bus_pcieSsd, sub, 18, 5, '#7a5af0', 2.6);
      glow('ram1', 0.6);
      glow('soc', 0.6);
      if (k > 0.5) glow('ssd', 0.7);
    } else if (s.id === 'fetch') {
      if (k < 0.5) fx.train(ssdRam, clamp(k * 2, 0, 1), 22, 5, '#7a5af0', 2.6);
      else fx.train(reverse(ssdRam), clamp(k * 2 - 1, 0, 1), 22, 5, '#2f7de1', 2.6);
      glow('ram1', 0.5);
      glow('ssd', 0.5);
    } else if (s.id === 'ftl') {
      glow('ssd', 0.7 + 0.3 * Math.sin(S.T * 10));
      heat('ssd', 0.25 + 0.25 * k);
    } else if (s.id === 'nand') {
      glow('ssd', 0.6);
      heat('ssd', 0.5 + 0.35 * Math.sin(S.T * 6) ** 2);
    } else if (s.id === 'dma') {
      const n = S.io.key === 'rand4k' ? 6 : 40;
      fx.flow(ssdRam, n, 120, '#1f9d62', 2.3, {jitter: 0.5});
      fx.flow(ssdRam, Math.round(n * 0.6), 120, '#1f9d62', 2.0, {jitter: 0.9, seed: 0.37});
      glow('ssd', 0.7);
      glow('soc', 0.7);
      glow('ram1', 0.8);
    } else if (s.id === 'done') {
      if (k < 0.5) fx.train(ssdRam, clamp(k * 2, 0, 1), 12, 3, '#1f9d62', 2.4);
      else fx.train(ssdCpu, 1 - clamp(k * 2 - 1, 0, 1), 12, 4, '#e5342b', 3.0);
      glow('soc', 0.4 + 0.5 * k);
      glow('ram1', 0.5);
    }
    anchor('ssd', 30, 'NVMe SSD', 'PCIe 4.0 × 4', C.violet, -8);
    anchor('ram1', 28, 'DRAM', 'data lands here', C.blue, 8);
    return {stg, i, s, k, t};
  };

  // ================================================================ CPU EXECUTES
  const cpuMode = (dt) => {
    const c = S.cpu;
    if (S.playing) {
      c.c += dt * 1.7 * S.slow;
      if (c.c > PROGRAM.cycles + 2.5) c.c = 0;
    }
    const cc = clamp(Math.floor(c.c), 0, PROGRAM.cycles - 1);
    const now = PROGRAM.at(cc);
    const act = now.stage.filter(Boolean).length / 5;
    glow('soc', 0.25 + 0.6 * act);
    heat('soc', 0.1 + 0.25 * act);
    fx.trace('bus_ddrA', '#4aa3ff', 0.2);
    const mem = now.stage[3];
    let missNow = false;
    if (mem && mem.miss) {
      missNow = true;
      const u = clamp((cc - mem.st[3]) / PROGRAM.missCycles, 0, 1);
      fx.trace('bus_ddrA', '#4aa3ff', 1);
      glow('ram1', 0.7);
      if (u < 0.35) fx.train(PATH.bus_ddrA, u / 0.35, 22, 5, '#2f7de1', 2.6);
      else if (u > 0.55) fx.train({pts: [...PATH.bus_ddrA.pts].reverse()}, clamp((u - 0.55) / 0.45, 0, 1), 28, 8, '#1f9d62', 2.6);
    }
    const ex = now.stage[2];
    anchor('soc', 34, ex ? ex.I.text : 'idle', `cycle ${cc} · ${missNow ? 'waiting on DRAM' : 'running'}`, C.red, 0);
    return {cc, now, prev: PROGRAM.at(Math.max(0, cc - 1)), missNow};
  };

  // ================================================================ COOLING
  const thermalMode = (dt) => {
    const th = S.th;
    const T = th.T;
    heat('soc', M.heatPct(T.cpu));
    heat('gpu', M.heatPct(T.gpu));
    heat('vram', M.heatPct(T.gpu) * 0.7);
    heat('coldplate', M.heatPct((T.cpu + T.gpu) / 2 * 0.95));
    for (const id of ['hp1', 'hp2', 'hp3']) heat(id, M.heatPct(T.hp));
    heat('fins1', M.heatPct(T.finL));
    heat('fins2', M.heatPct(T.finR));
    heat('ssd', M.heatPct(T.ssd) * 0.8);
    heat('vrm_cpu', M.heatPct(T.cpu) * 0.45);
    heat('vrm_gpu', M.heatPct(T.gpu) * 0.45);
    heat('battery', M.heatPct(T.ch) * 0.3);
    heat('board', M.heatPct(T.ch) * 0.35);
    // heat pipes: vapour toward the fins, liquid back along the wick
    const q = th.qHp / 3;
    const n = clamp(Math.round(q * 0.9), 0, 26);
    ['hp1', 'hp2', 'hp3'].forEach((id) => {
      fx.flow(PATH[id], n, 34 + q * 2.2, '#ff5a2a', 2.1, {lift: 0.7});
      fx.flow(PATH[id], Math.round(n * 0.7), 18 + q, '#3b9bff', 1.5, {dir: -1, lift: -0.2, jitter: 0.6, seed: 0.5, alpha: 0.7});
    });
    const f = th.f;
    const warm = clamp(th.exhaustDT / 14, 0, 1);
    const airCol = warm > 0.5 ? '#ff8a3d' : '#3b9bff';
    for (const [key, fid, fin] of [['air1', 'fan1', 'fins1'], ['air2', 'fan2', 'fins2']]) {
      PATH[key].forEach((p) => {
        const out = p.tag === 'out';
        const cnt = Math.round((out ? 12 : 9) * f);
        if (cnt > 0) fx.flow(p, cnt, 40 + 170 * f, out ? (warm > 0.15 ? '#ff9a52' : airCol) : '#3b9bff', 1.7, {jitter: 0.9, alpha: 0.85});
      });
    }
    const hot = Math.max(T.cpu, T.gpu);
    anchor('soc', 30, `CPU ${T.cpu.toFixed(0)} °C`, `${th.Pc.toFixed(0)} W · clock ${(th.clock * 100).toFixed(0)}%`, hot >= 95 ? C.red : C.ink, -34);
    anchor('gpu', 30, `GPU ${T.gpu.toFixed(0)} °C`, `${th.Pg.toFixed(0)} W · clock ${(th.clockG * 100).toFixed(0)}%`, T.gpu >= 95 ? C.red : C.ink, 30);
    anchor('fan1', 26, `${Math.round(th.rpm[0])} rpm`, 'intake from below', C.blue);
    anchor('fins1', 26, `Fins ${T.finL.toFixed(0)} °C`, 'exhaust warm air', C.orange, -8);
  };

  // ================================================================ BOOT
  const bootMode = (dt) => {
    const b = S.boot;
    if (S.playing) {
      b.t += dt * S.slow;
      if (b.t >= M.BOOT_TOTAL) {
        b.t = M.BOOT_TOTAL - 0.001;
        S.playing = false;
        syncControls();
      }
    }
    const {i, step, k} = M.bootAt(b.t);
    const rails = new Set(step.rails);
    // rails come up one after another during the "rails" step
    const upAt = {aon: 0, vsys: 0, '5v': 0.08, '3v3': 0.3, ddr: 0.52, core: 0.74};
    const live = (r) => rails.has(r) && (step.id !== 'rails' || k >= upAt[r]);
    const R = {vsys: ['pdChg', 'trunk', 'batt'], '5v': ['ram1', 'ram2', 'fan1', 'fan2'], '3v3': ['ssd', 'wifi', 'disp'], core: ['cpu', 'gpu']};
    for (const [r, ids] of Object.entries(R)) if (live(r)) for (const id of ids) {
      fx.trace(`pwr_${id}`, RAILCOL[r], 0.75);
      fx.flow(PATH[`pwr_${id}`], 3, 26, RAILCOL[r], 1.6, {follow: 'board'});
    }
    if (live('ddr')) {
      glow('ram1', 0.25);
      glow('ram2', 0.25);
    }
    for (const id of step.hl) glow(id, 0.55 + 0.25 * Math.sin(S.T * 6));
    const bus = (n) => PATH[`bus_${n}`];
    if (step.id === 'pwr' || step.id === 'rails') if (S.adapter !== 'none') fx.flow(PATH.pwr_vbus, 4, 30, '#ff9d1c', 1.7, {follow: 'board'});
    if (step.id === 'reset') {
      fx.trace('bus_spi', '#ff7a18', 1);
      fx.packet(bus('spi'), (k * 3) % 1, '#2f7de1', 2.6, {follow: 'board'});
      fx.packet(bus('spi'), 1 - ((k * 3) % 1), '#1f9d62', 2.6, {follow: 'board'});
    } else if (step.id === 'pei') {
      fx.trace('bus_ddrA', '#4aa3ff', 1);
      fx.trace('bus_ddrB', '#4aa3ff', 1);
      fx.flow(bus('ddrA'), 8, 80, '#4aa3ff', 1.8, {follow: 'board', dir: Math.sin(S.T * 3) > 0 ? 1 : -1});
      fx.flow(bus('ddrB'), 8, 80, '#4aa3ff', 1.8, {follow: 'board', dir: Math.sin(S.T * 3 + 1) > 0 ? 1 : -1});
    } else if (step.id === 'dxe') {
      for (const n of ['pcieSsd', 'pcieGpu', 'pcieWifi', 'edp']) {
        fx.trace(`bus_${n}`, '#a77bff', 0.9);
        fx.train(bus(n), (k * 2) % 1, 14, 4, '#7a5af0', 2.4, {follow: 'board'});
      }
    } else if (step.id === 'bds') {
      fx.trace('bus_pcieSsd', '#a77bff', 1);
      fx.train(ssdCpu, (k * 2) % 1, 14, 4, '#7a5af0', 2.4, {follow: 'board'});
    } else if (step.id === 'load') {
      fx.flow(ssdRam, 26, 110, '#1f9d62', 2.1, {jitter: 0.5});
      fx.trace('bus_pcieSsd', '#a77bff', 1);
      fx.trace('bus_ddrA', '#4aa3ff', 1);
    } else if (step.id === 'kernel') {
      for (const n of ['ddrA', 'pcieSsd', 'pcieWifi', 'pcieGpu']) fx.flow(bus(n), 3, 60, '#4aa3ff', 1.6, {follow: 'board'});
    } else if (step.id === 'ready') {
      fx.flow(bus('edp'), 5, 60, '#38c8b8', 1.7, {follow: 'board'});
    }
    // fans start to spin once the OS runs
    // the screen follows the firmware: black until the display is initialised, text, a logo, then the desktop
    let screen = 'off';
    if (i >= 5 && i <= 6) screen = 'post';
    else if (i === 7 || (i === 8 && k < 0.5)) screen = 'logo';
    else if (i >= 8) screen = i === 9 ? 'desktop' : 'logo';
    if (i === 5 && k < 0.4) screen = 'off';
    S.screen = screen;
    anchor('ec', 30, 'EC', 'always on', C.amber, -10);
    return {i, step, k, rails, live};
  };

  // ------------------------------------------------------------ screen texture
  let lastScreenKey = '';
  const drawScreen = (boot) => {
    const sm = parts.panel.screenMat;
    let state;
    if (S.mode === 'boot' && boot) {
      const lines = [];
      M.BOOT.slice(0, boot.i + 1).forEach((s, idx) => {
        if (idx < 4) return;
        const n = idx === boot.i ? Math.ceil(s.log.length * Math.min(1, boot.k * 1.6)) : s.log.length;
        lines.push(...s.log.slice(0, n));
      });
      if (S.screen === 'off') state = {kind: 'off'};
      else if (S.screen === 'post') state = {kind: 'boot', lines};
      else if (S.screen === 'logo') state = {kind: 'boot', lines: [], logo: true};
      else state = {kind: 'desktop'};
    } else state = S.screen === 'off' ? {kind: 'off'} : {kind: 'desktop'};
    lap.screen.draw(state);
    sm.emissiveIntensity = state.kind === 'off' ? 0 : 0.95;
  };

  // ------------------------------------------------------------ docks
  let dockAcc = 0;
  const segHtml = (items, cur, total, w = 880) => {
    const gap = 2;
    return items.map((it, i) => {
      const px = Math.max(52, ((w - gap * items.length) * it.dur) / total);
      return `<div class="${i === cur ? 'on' : i < cur ? 'done' : ''}" data-act="seek" data-v="${i}" style="width:${px.toFixed(0)}px">${it.name}<small>${it.sub || ''}</small></div>`;
    }).join('');
  };
  const dockPower = (pf) => {
    ui.set('port', pf.iPort > 0.01 ? `${pf.vPort} V × ${pf.iPort.toFixed(2)} A = ${fmtW(pf.pPort)}` : 'no charger');
    ui.set('bat', pf.pBat > 0 ? `${pf.vBat.toFixed(1)} V · discharging ${fmtW(pf.pBat)}` : `${pf.vBat.toFixed(1)} V · charging ${fmtW(-pf.pBat)}`);
    ui.set('sys', fmtW(pf.pSys));
    ui.set('loss', fmtW(pf.rails.reduce((s, r) => s + r.loss, 0)));
    ui.set('closs', fmtW(pf.chgLoss + pf.pdLoss));
    ui.set('socv', `${Math.round(S.soc * 100)}%`);
    const t = pf.adapterW === 0 ? 'On battery alone: the pack supplies everything.' : pf.supplement ? `The system wants more than the ${pf.adapterW} W charger gives, so the battery tops it up.` : 'The charger covers the load; the rest charges the battery.';
    ui.set('pnote', `${t} P = V × I: the CPU takes ${pf.rails[0].pOut.toFixed(0)} W at ${pf.rails[0].V.toFixed(2)} V, which is ${pf.rails[0].A.toFixed(0)} A.`);
    const maxP = 85;
    for (const r of pf.rails) {
      ui.set(`rn-${r.id}`, r.name);
      ui.set(`rv-${r.id}`, `${r.V.toFixed(2)} V`);
      ui.set(`ra-${r.id}`, `${r.A.toFixed(r.A < 10 ? 2 : 1)} A`);
      ui.attr(`rb-${r.id}`, 'style', `width:${clamp((r.pOut / maxP) * 100, 1, 100)}%;background:${{cpu: '#ff4b6e', gpu: '#ff4b6e', ram: '#3ddc84', ssd: '#19b8d4', wifi: '#19b8d4', disp: '#ff7a18', fan: '#f2c230', misc: '#9aa3ad'}[r.id]}`);
      ui.set(`rl-${r.id}`, `${r.pOut.toFixed(1)} W`);
    }
  };
  const timingSvg = (m) => {
    const tl = S.memS.tl;
    const rd = S.mem.kind === 'read';
    const total = tl.tEnd + 6;
    const x0 = 46;
    const x1 = 584;
    const X = (c) => x0 + (c / total) * (x1 - x0);
    const w = (x1 - x0) / total;
    let s = '';
    const row = (y, label) => (s += `<text x="4" y="${y + 9}" font-size="9" font-weight="700" fill="${C.mute}" letter-spacing=".6">${label}</text>`);
    row(20, 'CK');
    row(46, 'CA');
    row(70, 'DQS');
    row(86, 'DQ');
    let ck = `M${X(0)} 32`;
    for (let c = 0; c < total; c++) ck += `H${X(c)}V22H${X(c + 0.5)}V32H${X(c + 1)}`;
    s += `<path d="${ck}" fill="none" stroke="${C.ink}" stroke-width=".9"/>`;
    const colr = {PRE: '#7a8089', ACT: '#2f7de1', RD: '#1f9d62', WR: '#f26a1b'};
    const evs = tl.ev.filter((e) => e.cmd !== 'DQ');
    for (const e of evs) {
      s += `<rect x="${X(e.t)}" y="38" width="${Math.max(26, 2 * w)}" height="20" fill="${colr[e.cmd]}"/><text x="${X(e.t) + Math.max(13, w)}" y="52" font-size="10" font-weight="700" fill="#fff" text-anchor="middle">${e.cmd}</text>`;
    }
    // brackets for the waits
    const br = (a, b, label) => {
      s += `<line x1="${X(a)}" x2="${X(b)}" y1="12" y2="12" stroke="${C.mute}" stroke-width="1"/><line x1="${X(a)}" x2="${X(a)}" y1="8" y2="16" stroke="${C.mute}"/><line x1="${X(b)}" x2="${X(b)}" y1="8" y2="16" stroke="${C.mute}"/><text x="${(X(a) + X(b)) / 2}" y="9" font-size="8.6" fill="${C.ink}" text-anchor="middle" font-weight="600">${label}</text>`;
    };
    const ev = Object.fromEntries(tl.ev.map((e) => [e.cmd, e]));
    const rw = ev.RD || ev.WR;
    if (ev.PRE) {
      br(ev.PRE.t, ev.ACT.t, `tRP ${M.DDR.trp} clk`);
      br(ev.ACT.t, rw.t, `tRCD ${M.DDR.trcd} clk`);
    }
    br(rw.t, tl.tData, `${rd ? 'CL' : 'WL'} ${tl.lat} clk · ${(tl.lat * M.ddr.tck).toFixed(1)} ns`);
    // the data burst: 16 beats, strobe toggling
    const d0 = tl.tData;
    const d1 = tl.tEnd;
    s += `<rect x="${X(d0)}" y="82" width="${X(d1) - X(d0)}" height="16" fill="${rd ? '#d7f0e1' : '#fde6d6'}" stroke="${rd ? '#1f9d62' : '#f26a1b'}"/>`;
    for (let b = 1; b < 16; b++) s += `<line x1="${X(d0) + ((X(d1) - X(d0)) * b) / 16}" x2="${X(d0) + ((X(d1) - X(d0)) * b) / 16}" y1="82" y2="98" stroke="${rd ? '#1f9d62' : '#f26a1b'}" stroke-width=".6"/>`;
    s += `<text x="${(X(d0) + X(d1)) / 2}" y="110" font-size="8.6" text-anchor="middle" fill="${C.ink}" font-weight="600">16 beats = 64 B</text>`;
    let dqs = `M${X(d0 - 1)} 78`;
    for (let b = 0; b < 16; b++) dqs += `L${X(d0) + ((X(d1) - X(d0)) * b) / 16} ${b % 2 ? 68 : 78}`;
    s += `<path d="${dqs} H${X(d1 + 1)}" fill="none" stroke="${C.ink}" stroke-width=".9"/>`;
    const cx = X(m);
    s += `<line x1="${cx}" x2="${cx}" y1="14" y2="100" stroke="${C.red}" stroke-width="1.6"/><circle cx="${cx}" cy="14" r="3" fill="${C.red}"/>`;
    return s;
  };
  const dockMemory = (r) => {
    const steps = S.memS.steps;
    ui.html('seg', segHtml(steps.map((s) => ({name: s.name, sub: s.clk1 > s.clk0 ? `${s.clk1 - s.clk0} clk` : '', dur: s.dur})), r.i, S.memS.total));
    ui.set('stext', r.s.text);
    const clk = r.s.clk0 + (r.s.clk1 - r.s.clk0) * r.k;
    ui.html('mtl', timingSvg(clk));
    ui.set('play', S.playing ? '❚❚ Pause' : '▶ Play');
    ui.set('clk', `${M.ddr.clkMHz} MHz · tCK ${M.ddr.tck.toFixed(3)} ns · clock now ${Math.round(clk)}`);
    const miss = M.ddrTimeline('read', false);
    const hit = M.ddrTimeline('read', true);
    ui.set('tmiss', `${miss.tEnd} clk = ${(miss.tEnd * M.ddr.tck).toFixed(1)} ns`);
    ui.set('thit', `${hit.tEnd} clk = ${(hit.tEnd * M.ddr.tck).toFixed(1)} ns`);
    ui.set('peak', `${M.ddr.peakGBsModule.toFixed(1)} GB/s (64 bits × 4800 MT/s)`);
  };
  const dockStorage = (r) => {
    const tot = r.stg[r.stg.length - 1].d1;
    ui.html('seg', segHtml(r.stg.map((s) => ({name: s.name, sub: s.us >= 1000 ? `${(s.us / 1000).toFixed(1)} ms` : `${s.us.toFixed(1)} µs`, dur: s.d})), r.i, tot));
    ui.set('stext', r.s.text);
    ui.set('link', `PCIe ${M.PCIE.gen}.0 × ${M.PCIE.lanes}: ${M.pcie.rawGBs.toFixed(2)} GB/s raw, ${M.pcie.effGBs.toFixed(2)} GB/s after packet overhead`);
    const b = S.ioS.bytes;
    ui.set('bytes', b >= 1073741824 ? '1 GiB' : b >= 1048576 ? '1 MiB' : '4 KiB');
    const us = S.ioS.totalUs;
    ui.set('ttot', us >= 1000 ? `${(us / 1000).toFixed(2)} ms` : `${us.toFixed(1)} µs`);
    ui.set('gbs', `${S.ioS.gbs.toFixed(2)} GB/s`);
    ui.set('ddr', `${(M.ddr.peakGBsModule * 2).toFixed(1)} GB/s peak · ${(M.ddr.peakGBsModule * 2 / M.pcie.effGBs).toFixed(0)}× the link`);
    ui.set('snote', S.io.key === 'file1g' ? 'A long transfer is limited by the link: the setup time barely matters.' : 'A small read is limited by latency: the flash read dominates, and the link sits idle.');
    ui.set('play', S.playing ? '❚❚ Pause' : '▶ Play');
    const lanes = [0, 1, 2, 3].map((l) => {
      const on = r.s.id === 'dma';
      return `<text x="0" y="${12 + l * 13}" font-size="8.5" fill="${C.mute}" font-weight="700">LANE ${l}</text><rect x="48" y="${5 + l * 13}" width="340" height="7" fill="#e5e7ea"/><rect x="48" y="${5 + l * 13}" width="${on ? 340 * r.k : r.i > 4 ? 340 : 0}" height="7" fill="${C.violet}"/>`;
    }).join('');
    ui.html('lanes', lanes);
  };
  const dockCpu = (r) => {
    const now = r.now;
    const names = ['IF', 'ID', 'EX', 'MEM', 'WB'];
    const full = ['Fetch', 'Decode', 'Execute', 'Memory', 'Write back'];
    const pipe = names.map((n, s) => {
      const d = now.stage[s];
      let cls = '';
      let txt = '';
      if (d) {
        txt = d.I.text;
        if (d.squashed) cls = 'sq';
        else if (s === 3 && d.miss) cls = 'mi';
        else if (s < 3 && r.cc > d.st[s]) cls = 'st';
      }
      return `<div class="${cls}"><b>${full[s]}</b><span class="mono" style="font-size:9.5px">${txt || '—'}</span></div>`;
    }).join('');
    ui.html('pipe', pipe);
    const tag = {};
    now.stage.forEach((d, s) => d && !d.squashed && (tag[d.pc] = (tag[d.pc] ? tag[d.pc] + ' ' : '') + names[s]));
    ui.html('prog', M.PROG.map((p, i) => `<div class="${tag[i] ? 'on' : ''}"><span style="color:${C.mute};width:12px">${i}</span><span>${p.text}</span><span class="tg">${tag[i] || ''}</span></div>`).join(''));
    ui.html('regs', now.regs.map((v, i) => `<div class="${v !== r.prev.regs[i] ? 'ch' : ''}"><b>r${i}</b><span class="mono">${v >= 4096 ? '0x' + v.toString(16) : v}</span></div>`).join(''));
    ui.set('mem', now.mem != null ? String(now.mem) : '—');
    ui.set('cyc', `${r.cc} / ${PROGRAM.cycles - 1}`);
    const done = PROGRAM.real.filter((d) => d.st[4] <= r.cc).length;
    ui.set('ipc', r.cc ? (done / r.cc).toFixed(2) : '—');
    const mem = now.stage[3];
    const ex = now.stage[2];
    let ev = 'Flowing: instructions move one stage per cycle.';
    if (r.missNow) ev = `Load missed L1, L2 and L3: waiting for DRAM (${clamp(r.cc - mem.st[3], 0, 16)}/16 cycles shown). Everything behind it is stalled.`;
    else if (now.stage.some((d) => d && d.squashed)) ev = 'Branch mispredicted: the loop was predicted to repeat, so wrong-path instructions were fetched. They are flushed.';
    else if (now.stage[1] && r.cc > now.stage[1].st[1] && now.stage[2] && now.stage[2].I.op === 'load') ev = 'Load-use hazard: the next instruction needs the loaded value, so it waits one cycle.';
    else if (r.cc >= PROGRAM.cycles - 2) ev = `Done. r1 = ${now.regs[1]}: the sum 10 + 20 + 30 + 40. Stored to memory.`;
    ui.set('ev', ev);
    ui.set('play', S.playing ? '❚❚ Pause' : '▶ Play');
  };
  const dockThermal = () => {
    const th = S.th;
    const T = th.T;
    ui.set('cpu', `${T.cpu.toFixed(1)} °C · ${th.Pc.toFixed(0)} W of ${M.LOADS[S.load].cpu} W · clock ${(th.clock * 100).toFixed(0)}%`);
    ui.set('gpu', `${T.gpu.toFixed(1)} °C · ${th.Pg.toFixed(0)} W of ${M.LOADS[S.load].gpu} W · clock ${(th.clockG * 100).toFixed(0)}%`);
    ui.set('fan', `${Math.round(th.rpm[0])} rpm · ${th.flowCfm.toFixed(1)} CFM · ${th.fanW.toFixed(2)} W`);
    ui.set('qin', `${th.qHp.toFixed(0)} W`);
    ui.set('qout', `${(th.qFinL + th.qFinR).toFixed(0)} W`);
    ui.set('exh', th.exhaustDT > 0.05 ? `+${th.exhaustDT.toFixed(1)} °C above room (ΔT = Q ÷ ρ·V̇·cp)` : 'fans off: passive');
    ui.set('tt', `${Math.floor(th.time / 60)} min ${Math.floor(th.time % 60)} s`);
    const thr = th.tc < 0.99 || th.tg < 0.99;
    ui.set('tnote', thr ? 'The chip hit its limit and slowed itself down: thermal throttling. Power falls with the cube of clock, so a small slowdown sheds a lot of heat.' : th.rpm[0] < 50 ? 'Cool enough for the fans to stay off.' : 'The fans speed up as the die warms. Louder and more power, but more heat removed.');
    for (const k of [1, 10, 60]) ui.cls(`w-${k}`, 'on', S.warp === k);
    // chart
    const H = S.hist;
    const W2 = 470;
    const H2 = 150;
    const x0 = 34;
    const Y = (t) => 10 + (1 - (t - 20) / 90) * (H2 - 24);
    const span = 180;
    const t1 = th.time;
    const t0 = Math.max(0, t1 - span);
    const X = (t) => x0 + ((t - t0) / span) * (W2 - x0 - 4);
    let s = '';
    for (const v of [20, 40, 60, 80, 100]) s += `<line x1="${x0}" x2="${W2 - 4}" y1="${Y(v)}" y2="${Y(v)}" stroke="${v === 100 ? C.red : C.line}" ${v === 100 ? 'stroke-dasharray="4 3"' : ''}/><text x="${x0 - 4}" y="${Y(v) + 3}" font-size="8.6" fill="${C.mute}" text-anchor="end">${v}</text>`;
    const line = (key, col) => {
      let d = '';
      H.forEach((h, i) => {
        if (h.t < t0) return;
        d += `${d ? 'L' : 'M'}${X(h.t).toFixed(1)} ${Y(h[key]).toFixed(1)}`;
      });
      return d ? `<path d="${d}" fill="none" stroke="${col}" stroke-width="1.6"/>` : '';
    };
    s += line('cpu', C.red) + line('gpu', C.violet) + line('fin', C.orange) + line('ssd', C.blue);
    s += `<text x="${W2 - 4}" y="${H2 - 2}" font-size="8.6" fill="${C.mute}" text-anchor="end">last 3 min of simulated time · °C</text>`;
    ui.html('chart', s);
  };
  const dockBoot = (r) => {
    ui.html('seg', segHtml(M.BOOT.map((s) => ({name: STEPNAME[s.id], sub: '', dur: s.d})), r.i, M.BOOT_TOTAL));
    ui.set('btitle', `${r.i + 1}. ${r.step.title}`);
    ui.set('btext', r.step.text);
    const lines = [];
    M.BOOT.slice(0, r.i + 1).forEach((s, idx) => {
      const n = idx === r.i ? Math.ceil(s.log.length * Math.min(1, r.k * 1.6)) : s.log.length;
      lines.push(...s.log.slice(0, n));
    });
    ui.set('log', lines.slice(-6).join('\n'));
    for (const rl of ['aon', 'vsys', '5v', '3v3', 'ddr', 'core']) ui.cls(`rl-${rl}`, 'on', r.rails.has(rl) && r.live(rl));
    ui.set('play', S.playing ? '❚❚ Pause' : '▶ Play');
  };

  // ------------------------------------------------------------ the thermal model runs in every mode
  const stepThermalLive = (dt) => {
    const w = S.mode === 'thermal' ? S.warp : 1;
    let sim = dt * w;
    while (sim > 1e-6) {
      const h = Math.min(0.1, sim);
      M.stepThermal(S.th, h, S.load);
      sim -= h;
      S.histAcc += h;
      if (S.histAcc >= 1) {
        S.histAcc -= 1;
        S.hist.push({t: S.th.time, cpu: S.th.T.cpu, gpu: S.th.T.gpu, fin: S.th.T.finL, ssd: S.th.T.ssd});
        if (S.hist.length > 600) S.hist.shift();
      }
    }
  };

  // ------------------------------------------------------------ connection lines for the inspector's Links tab
  const linkCallouts = () => {
    if (!S.sel || S.tab !== 'links') return;
    const e = CATALOG[entryOf(S.sel)];
    const a = st.project(lap.center(S.sel));
    if (!a) return;
    for (const [to] of e.links) {
      const id = partsOf(to)[0];
      if (!id) continue;
      const b = st.project(lap.center(id));
      if (!b) continue;
      // a part out of frame gets its label on the edge of the 3D area
      const x = clamp(b[0], 340, 1240);
      const y = clamp(b[1], 110, 790);
      anchors.push({x, y: y - 6, text: CATALOG[to].short || CATALOG[to].name, tone: C.blue, from: a, dash: true});
    }
  };

  // ------------------------------------------------------------ the frame
  let last = performance.now();
  const perf = {n: 0, sum: 0, slow: 0, age: 0};
  let frameNo = 0;
  // parts that sit above the selected part and hide it fade out completely; the rest only dim
  const box = new THREE.Box3();
  const bb = (id) => {
    const b = new THREE.Box3();
    for (const m of parts[id].meshes) b.expandByObject(m);
    return b;
  };
  const recomputeOcc = () => {
    S.occ = new Set();
    if (!S.sel || isLid(S.sel)) return;
    lap.root.updateMatrixWorld(true);
    const sb = bb(S.sel);
    for (const p of Object.values(parts)) {
      if (p.entry === entryOf(S.sel) || isLid(p.id)) continue;
      const ob = bb(p.id);
      if (ob.isEmpty()) continue;
      const above = ob.max.y > sb.max.y - 0.005 && ob.min.y > sb.min.y + 0.02;
      const overlap = ob.min.x < sb.max.x && ob.max.x > sb.min.x && ob.min.z < sb.max.z && ob.max.z > sb.min.z;
      if (above && overlap) S.occ.add(p.id);
    }
  };
  const ghostTarget = (p) => {
    let g = 0;
    if (isTop(p.id) && (S.topOff || S.autoOff) && !(S.sel && p.entry === entryOf(S.sel))) g = 1;
    // looking at something inside the base: the lid is out of the way
    if (S.sel && !isLid(S.sel) && isLid(p.id)) g = 1;
    if (S.sel) {
      const e = entryOf(S.sel);
      if (p.entry !== e) g = Math.max(g, S.iso ? 1 : S.occ && S.occ.has(p.id) ? 1 : 0.92);
    }
    return g;
  };
  // section timers (ms per frame, summed): LIVE.prof shows where a frame goes
  const prof = {};
  let pt = 0;
  const mark = (k) => {
    const n = performance.now();
    if (k) prof[k] = (prof[k] || 0) + (n - pt);
    pt = n;
  };
  const frame = (now) => {
    mark();
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    S.T += dt;
    frameNo++;
    // adapt quality if frames are slow
    if (tier < TIERS.length - 1) {
      perf.age += dt;
      if (perf.age > 0.8) {
        perf.sum += dt;
        perf.n++;
        if (perf.sum >= 0.7 && perf.n >= 8) {
          perf.slow = perf.sum / perf.n > 0.026 ? perf.slow + 1 : 0;
          perf.sum = 0;
          perf.n = 0;
          if (perf.slow >= 2) {
            tier++;
            applyTier();
            Object.assign(perf, {age: 0, slow: 0});
          }
        }
      }
    }
    tourTick();
    if (S.sel && frameNo % 10 === 0) recomputeOcc();

    // tweens
    const ke = 1 - Math.exp(-dt / (S.explodeFast ? 0.07 : 0.4));
    S.explode += (S.exTarget - S.explode) * ke;
    if (Math.abs(S.exTarget - S.explode) < 0.002) {
      S.explode = S.exTarget;
      S.explodeFast = false;
    }
    S.lid += (S.lidTarget - S.lid) * (1 - Math.exp(-dt / 0.3));
    for (const p of Object.values(parts)) {
      if (p.pullT != null) p.pullK += (p.pullT - p.pullK) * (1 - Math.exp(-dt / 0.35));
    }
    ui.set('exv', `${Math.round(S.explode * 100)}%`);
    ui.set('lidv', `${Math.round(S.lid)}°`);

    stepThermalLive(dt);
    for (let i = 0; i < 2; i++) S.fanAng[i] += (S.th.rpm[i] / M.TH.fanMax) * 5 * dt;

    // mode logic: fills fx, glow and heat targets
    mark('tween');
    fx.begin(S.T);
    want.glow = {};
    want.heat = {};
    anchors.length = 0;
    let mr = null;
    if (S.mode === 'power') mr = powerMode(dt);
    else if (S.mode === 'memory') mr = memoryMode(dt);
    else if (S.mode === 'storage') mr = storageMode(dt);
    else if (S.mode === 'cpu') mr = cpuMode(dt);
    else if (S.mode === 'thermal') thermalMode(dt);
    else if (S.mode === 'boot') mr = bootMode(dt);
    mark('mode');
    fx.end();
    mark('fx');
    if (S.mode === 'boot' || S.screen !== lastScreenKey) {
      drawScreen(S.mode === 'boot' ? mr : null);
      lastScreenKey = S.screen;
    }

    mark('screen');
    // part state: ghost, glow, heat
    const hov = S.hover || S.listHover;
    const hovEntry = S.listHover ? S.listHover : S.hover ? entryOf(S.hover) : null;
    let anyFade = false;
    for (const p of Object.values(parts)) {
      const gt = ghostTarget(p);
      p.ghost += (gt - p.ghost) * (1 - Math.exp(-dt / 0.18));
      if (Math.abs(gt - p.ghost) < 0.004) p.ghost = gt;
      if (p.ghost > 0.02 && p.ghost < 0.96) anyFade = true;
      let g = want.glow[p.id] || 0;
      if (S.sel && partsOf(entryOf(S.sel)).includes(p.id)) g = Math.max(g, 0);
      if (hovEntry && p.entry === hovEntry) g = Math.max(g, 0.12);
      p.glow += (g - p.glow) * (1 - Math.exp(-dt / 0.15));
      const h = want.heat[p.id] || 0;
      p.heat += (h - p.heat) * (1 - Math.exp(-dt / 0.3));
      p.hidden = false;
    }
    // heat tints only in the cooling view; elsewhere parts stay their own colour
    if (S.mode !== 'thermal') for (const p of Object.values(parts)) if (!want.heat[p.id]) p.heat *= 0.9;
    st.gtao.enabled = TIERS[tier].ao && !anyFade;

    // camera: follow the selection, then ease
    if (S.sel && S.follow) {
      const c = lap.center(S.sel);
      camT.tx = c.x;
      camT.ty = c.y;
      camT.tz = c.z;
    }
    const kc = 1 - Math.exp(-dt / (AP.on ? 0.55 : 0.32));
    cam.az += wrap(camT.az - cam.az) * kc;
    for (const k of ['el', 'd', 'tx', 'ty', 'tz']) cam[k] += (camT[k] - cam[k]) * kc;
    const dockOn = S.mode !== 'explore';
    const cy = dockOn ? 312 : 452;
    const vis = {...cam, sx: -13, sy: cy - 450};
    // frame the machine in the free area: the camera distance counts the dock
    mark('parts');
    st.frame({explode: S.explode, lid: S.lid, fanAngle: S.fanAng}, vis);
    mark('render');

    // tooltip and hover pick
    if (S.ptr && !drag && frameNo % 3 === 0) {
      const id = st.pick(S.ptr[0], S.ptr[1]);
      S.hover = id;
      canvas.classList.toggle('hov', !!id);
    } else if (!S.ptr) S.hover = null;
    const tip = ui.tip;
    if (S.hover && S.ptr && !drag) {
      tip.style.display = '';
      tip.style.left = `${S.ptr[0]}px`;
      tip.style.top = `${S.ptr[1]}px`;
      const nm = CATALOG[entryOf(S.hover)].name + (NAMES[S.hover] ? ` · ${NAMES[S.hover]}` : '');
      if (tip.textContent !== nm) tip.textContent = nm;
    } else tip.style.display = 'none';

    mark('pick');
    // overlay
    ui.root.style.display = S.hidden ? 'none' : '';
    ui.attr('hint', 'style', S.mode === 'explore' ? 'top:802px;' : 'display:none');
    ui.set('hint', S.sel ? 'Open up · Pull out · Focus in the inspector' : 'Drag to orbit · wheel to zoom · click a part');
    linkCallouts();
    ui.callouts(anchors);
    mark('overlay');
    dockAcc += dt;
    if (dockAcc > 0.06) {
      dockAcc = 0;
      if (S.mode === 'power') dockPower(mr);
      else if (S.mode === 'memory') dockMemory(mr);
      else if (S.mode === 'storage') dockStorage(mr);
      else if (S.mode === 'cpu') dockCpu(mr);
      else if (S.mode === 'thermal') dockThermal();
      else if (S.mode === 'boot') dockBoot(mr);
      if (S.sel) liveStrip();
      const tc = ui.root.querySelector('.tour');
      const label = AP.on ? '<i></i>AUTO TOUR · CLICK TO TAKE OVER' : '▶ RESUME TOUR';
      if (tc.dataset.s !== String(AP.on)) {
        tc.dataset.s = String(AP.on);
        tc.innerHTML = label;
        tc.classList.toggle('on', AP.on);
      }
    }
    mark('dock');
    if (!window.SIM_SHOWN) {
      window.SIM_SHOWN = true;
      dispatchEvent(new Event('simframe'));
    }
    requestAnimationFrame(frame);
  };

  // the inspector's live strip: a few numbers for the selected part, from the same model
  const liveStrip = () => {
    const n = ui.node('live');
    if (!n) return;
    const th = S.th;
    const e = entryOf(S.sel);
    let t = '';
    let tag = 'ILL';
    if (e === 'soc') t = `${th.T.cpu.toFixed(0)} °C · ${th.Pc.toFixed(1)} W · clock ${(th.clock * 100).toFixed(0)}%`;
    else if (e === 'gpu') t = `${th.T.gpu.toFixed(0)} °C · ${th.Pg.toFixed(1)} W · clock ${(th.clockG * 100).toFixed(0)}%`;
    else if (e === 'fan') t = `${Math.round(th.rpm[0])} rpm · ${th.flowCfm.toFixed(1)} CFM total`;
    else if (e === 'heatpipe' || e === 'coldplate') t = `${th.qHp.toFixed(0)} W moving to the fins · hot end ${th.T.hp.toFixed(0)} °C`;
    else if (e === 'heatsink') t = `${th.T.finL.toFixed(0)} °C · ${(th.qFinL + th.qFinR).toFixed(0)} W to the air`;
    else if (e === 'ssd') {
      tag = 'TYP';
      t = `${th.T.ssd.toFixed(0)} °C · ${S.ioS.gbs.toFixed(1)} GB/s on a ${S.io.key === 'file1g' ? '1 GiB' : S.io.key === 'seq1m' ? '1 MiB' : '4 KiB'} read`;
    } else if (e === 'ram') {
      tag = 'STD';
      t = `DDR5-4800 · ${M.ddr.peakGBsModule.toFixed(1)} GB/s peak · CL${M.DDR.cl} = ${M.ddr.tCL.toFixed(1)} ns`;
    }
    else if (e === 'battery' || e === 'pd' || e === 'bms') {
      const pf = S.pf || M.powerFlow({load: S.load, adapter: S.adapter, soc: S.soc, tc: th.tc, tg: th.tg, fanW: th.fanW});
      t = `${pf.vBat.toFixed(1)} V · ${pf.pBat > 0 ? 'discharging' : 'charging'} ${fmtW(Math.abs(pf.pBat))} · system ${fmtW(pf.pSys)}`;
    } else if (e === 'vrm') {
      const pf = S.pf || M.powerFlow({load: S.load, adapter: S.adapter, soc: S.soc, tc: th.tc, tg: th.tg, fanW: th.fanW});
      t = `Core ${pf.rails[0].V.toFixed(2)} V × ${pf.rails[0].A.toFixed(0)} A = ${fmtW(pf.rails[0].pOut)}`;
    }
    if (!t) {
      n.style.display = 'none';
      return;
    }
    n.style.display = '';
    ui.html('live', `<span class="lcap">Live</span> ${t} <span class="chip ${tag}" title="${M.PROV[tag].note}">${tag}</span>`);
  };

  // ------------------------------------------------------------ start
  enterMode('explore');
  syncControls();
  ui.markList(null);
  select(null);
  ui.set('qual', `Quality · ${TIERS[tier].name}`);
  // every shader compiles at once off the main thread before the first frame (kit/warm.js)
  warmComposer(st.renderer, st.composer, st.scene, st.camera).then(() => requestAnimationFrame(frame));
  window.LIVE = {setOpen: (k) => { if (S.sel) { parts[S.sel].openK = k; refreshInspector(); } }, prof, st, S, ui, fx, lap, act, select, selectEntry, enterMode, cam, camT, setTier: (t) => { tier = clamp(t, 0, TIERS.length - 1); perf.slow = 0; perf.age = -99; applyTier(); }, get tier() {
    return tier;
  }, get T() {
    return S.T;
  }, takeOver, startTour, PROGRAM, setView, gpuName};
}
