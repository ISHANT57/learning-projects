// The phone as a page you drive: orbit, spin, explode, take the back cover or the display off, isolate, click a part. Phases
// 1 and 2 of the roadmap: the exterior, the exploded view and the internals. The eleven demonstrations come in later phases.
import {warmComposer} from 'teardown-kit/warm.js';
import * as THREE from 'three';
import {createConsole, C} from './console.js';
import {CATALOG} from './data.js';
import {createFx} from './fx.js';
import {createStage} from './stage.js';
import {createDemos, DOCKS as DOCKS1, INTRO as INTRO1, MODE_NAMES as MN1} from './demos.js';
import {createGen, DOCKS as DOCKS2, INTRO as INTRO2, MODE_NAMES as MN2, GEN_MODES, CFG} from './demos2.js';
const DOCKS = {...DOCKS1, ...DOCKS2};
const INTRO = {...INTRO1, ...INTRO2};
const MODE_NAMES = {...MN1, ...MN2};
const MODE_KEYS = ['explore', 'boot', 'cpu', 'ram', 'ufs', 'touch', 'camera', 'net', 'gps', 'charge', 'thermal', 'frame'];

const W = 1600;
const H = 900;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wrap = (d) => ((((d + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
const V3 = THREE.Vector3;
const CSS = `html,body{background:#e9ebee;overflow:hidden}
#app{position:absolute!important;inset:auto!important;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
#gl{position:absolute;left:0;top:0;width:${W}px;height:${H}px;touch-action:none;cursor:grab}#gl.drag{cursor:grabbing}#gl.hov{cursor:pointer}`;

// outer layers: faded away when you inspect something inside
const DEMO_HIDE = ['display', 'frame', 'copper', 'fp', 'frontcams', 'earpiece', 'backcover', 'mbcover'];
const SHELL = ['display', 'frame', 'backcover', 'mbcover', 'copper', 'fp', 'frontcams', 'earpiece'];
const NAMES = {soc: 'SoC', mcp: 'Memory chip', rf865: 'RF chip', codec: 'Audio codec', fem2: 'Front-end 2', wifi: 'Wi-Fi chip', fem1: 'Front-end 1', pm7250: 'PM7250', pm7150a: 'PM7150A', pm7250b: 'PM7250B', qet: 'Envelope tracker', rearcams: 'Camera group', copper: 'Copper strip', sens_prox: 'Proximity + light', sens_imu: 'Motion sensors', ant_top: 'Top edge', ant_bl: 'Bottom left', ant_br: 'Bottom right', mic_bottom: 'Bottom (documented)', mic_top: 'Top (illustrative)'};
const VIEWS = {front: {az: 0, el: 1.42, d: 4.0}, back: {az: Math.PI, el: -1.42, d: 4.0}, iso: {az: 0.55, el: 0.65, d: 3.7}, side: {az: Math.PI / 2, el: 0.1, d: 3.4}};

export async function runLive() {
  document.title = 'Phone · Teardown: an interactive 3D phone';
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const app = document.getElementById('app');
  await Promise.all([document.fonts.load('600 20px Inter'), document.fonts.load('600 20px "JetBrains Mono"')]).catch(() => {});
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);
  let st;
  try {
    st = createStage({canvas});
  } catch (e) {
    app.innerHTML = '<div style="position:absolute;left:0;top:0;width:1600px;height:900px;display:flex;align-items:center;justify-content:center;font:600 18px Inter,sans-serif;text-align:center">This page needs WebGL, which this browser did not provide.</div>';
    return;
  }
  const lap = st.lap;
  const parts = lap.parts;
  const fx = createFx(lap, st.scene, st.renderer, st.camera);
  const ui = createConsole(app);

  // quality tiers, integrated GPU first
  const TIERS = [{n: 'HIGH', samples: 4, ao: true, shadow: 2048, pr: 2}, {n: 'MEDIUM', samples: 4, ao: false, shadow: 1024, pr: 1.5}, {n: 'LOW', samples: 0, ao: false, shadow: 1024, pr: 1}];
  let gpu = '';
  try { const gl = st.renderer.getContext(); const x = gl.getExtension('WEBGL_debug_renderer_info'); gpu = x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : ''; } catch (e) {}
  const soft = /swiftshader|llvmpipe|software/i.test(gpu);
  const discrete = /nvidia|geforce|rtx|gtx|radeon (rx|pro)|arc a/i.test(gpu) && !/laptop|mobile|max-q/i.test(gpu);
  let tier = matchMedia('(pointer: coarse)').matches || soft ? 2 : discrete ? 0 : 1;
  let scale = 1;
  const fit = () => {
    scale = Math.min(innerWidth / W, innerHeight / H);
    app.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
    st.resize(W, H, clamp((devicePixelRatio || 1) * scale, 0.75, TIERS[tier].pr));
  };
  const applyTier = () => { const {pr, n, ...q} = TIERS[tier]; st.setQuality(q); fit(); ui.set('qual', `Quality · ${n}`); };
  applyTier();
  addEventListener('resize', fit);
  const toStage = (cx, cy) => { const r = app.getBoundingClientRect(); return [(cx - r.left) / scale, (cy - r.top) / scale]; };

  const S = {T: 0, sel: null, hover: null, tab: 'what', explode: 0, exTarget: 0, backOff: false, dispOff: false, xray: false, iso: false, spin: false, showIll: true, mode: 'explore', want: {glow: {}, heat: {}}, follow: false, hidden: false, info: 'home', ptr: null};
  const glow = (id, v) => { S.want.glow[id] = Math.max(S.want.glow[id] || 0, v); };
  const heat = (id, v) => { S.want.heat[id] = Math.max(S.want.heat[id] || 0, v); };
  const demos = createDemos({S, lap, fx, ui, glow});
  const gen = createGen({S, lap, fx, ui, glow, heat});
  const runner = () => (GEN_MODES.includes(S.mode) ? gen : demos);
  const cam = {az: 0.55, el: 0.65, d: 3.7, tx: 0, ty: 0.02, tz: 0};
  const camT = {...cam};
  const home = () => ({tx: 0, ty: 0.03 - 0.12 * S.explode, tz: 0});
  const setView = (v) => { Object.assign(camT, VIEWS[v], home()); camT.d *= 1 + 0.5 * S.explode; S.follow = false; };
  setView('iso');
  Object.assign(cam, camT);
  const entryOf = (id) => parts[id].entry;
  const partsOf = (e) => lap.entryParts[e] || [];
  const isShell = (id) => SHELL.includes(id);

  // ------------------------------------------------------------ selection
  const focusOn = (id) => {
    const sz = lap.sizeOf(id);
    const c = lap.center(id);
    camT.d = clamp(Math.max(sz.x, sz.z) * 2.4 + 0.75, 0.9, 6);
    camT.tx = c.x; camT.ty = c.y; camT.tz = c.z;
    camT.el = Math.sign(camT.el || 1) * Math.max(Math.abs(camT.el), 0.95);
    S.follow = true;
  };
  const refresh = () => {
    if (!S.sel) { if (S.mode !== 'explore') ui.infoHtml(MODE_NAMES[S.mode], ...INTRO[S.mode]); else ui.info(S.info); ui.mark(null); return; }
    const e = entryOf(S.sel);
    const ps = partsOf(e);
    ui.inspect(e, S.tab, {parts: ps, part: S.sel, names: NAMES, pulled: !!parts[S.sel].pullT});
    ui.mark(e);
  };
  const select = (id, fly = true) => {
    S.sel = id;
    S.occ = null;
    if (id) { S.info = 'home'; refresh(); if (fly) focusOn(id); } else { S.follow = false; refresh(); }
  };
  const selectEntry = (e) => { const ps = partsOf(e); if (ps.length) select(ps.includes(S.sel) ? S.sel : ps[0]); };

  // ------------------------------------------------------------ controls
  const sync = () => {
    ui.set('exv', `${Math.round(S.explode * 100)}%`);
    ui.set('back', S.backOff ? 'Back on' : 'Back off');
    ui.set('disp', S.dispOff ? 'Screen on' : 'Screen off');
    ui.cls('back', 'on', S.backOff); ui.cls('disp', 'on', S.dispOff); ui.cls('xray', 'on', S.xray); ui.cls('iso', 'on', S.iso); ui.cls('spin', 'on', S.spin); ui.cls('ill', 'on', S.showIll);
  };
  const enterMode = (mode) => {
    S.mode = mode; S.sel = null; S.follow = false; S.info = 'home';
    ui.setDock(mode === 'explore' ? '' : DOCKS[mode]());
    ui.topOn(mode);
    if (mode === 'explore') { S.exTarget = 0; setView('iso'); } else { const cfg = CFG[mode]; S.exTarget = cfg ? cfg.ex : 0.55; runner().enter(); Object.assign(camT, cfg && cfg.cam ? cfg.cam : {az: 0.2, el: 1.25, d: 2.3, tx: 0, ty: 0.04, tz: -0.5}); }
    refresh(); sync();
  };
  const act = (a, v) => {
    if (a === 'mode') enterMode(v);
    else if (a === 'info') { if (S.mode !== 'explore') enterMode('explore'); S.sel = null; S.info = v; refresh(); ui.topOn(v); }
    else if (a === 'pick') selectEntry(v);
    else if (a === 'part') select(v);
    else if (a === 'tab') { S.tab = v; refresh(); if (v === 'links' && S.sel) fitLinks(); else if (S.sel) focusOn(S.sel); }
    else if (a === 'back') { S.backOff = !S.backOff; setView('back'); }
    else if (a === 'disp') { S.dispOff = !S.dispOff; setView('front'); }
    else if (a === 'xray') S.xray = !S.xray;
    else if (a === 'iso') S.iso = !S.iso;
    else if (a === 'spin') S.spin = !S.spin;
    else if (a === 'ill') { S.showIll = !S.showIll; if (!S.showIll && S.sel && lap.ILL.includes(S.sel)) select(null); }
    else if (a === 'view') setView(v);
    else if (a === 'qual') { tier = (tier + 1) % TIERS.length; applyTier(); }
    else if (a === 'pull') { const p = parts[S.sel]; if (p) { p.pullT = p.pullT ? 0 : 1; refresh(); } }
    else if (a === 'focus') { if (S.sel) focusOn(S.sel); }
    else if (a === 'clear') select(null);
    else if (S.mode !== 'explore' && (GEN_MODES.includes(S.mode) ? gen.act(a, v, S.mode) : demos.act(a, v))) { /* handled by the demonstration */ }
    sync();
  };
  ui.root.addEventListener('click', (e) => {
    const qa = e.target.closest('[data-act=qa]');
    if (qa) { qa.classList.toggle('open'); return; }
    const b = e.target.closest('[data-act]');
    if (b) act(b.dataset.act, b.dataset.v);
  });
  ui.root.addEventListener('input', (e) => {
    if (e.target.dataset?.in === 'explode') { S.exTarget = Number(e.target.value) / 100; S.fast = true; sync(); }
  });
  ui.root.addEventListener('pointermove', (e) => { const it = e.target.closest?.('.it'); S.listHover = it ? it.dataset.id : null; });

  // fit the camera to the selected part and everything it links to
  const fitLinks = () => {
    const e = CATALOG[entryOf(S.sel)];
    const b = new THREE.Box3();
    b.expandByPoint(lap.center(S.sel));
    for (const [to] of e.links) { const id = partsOf(to)[0]; if (id) b.expandByPoint(lap.center(id)); }
    const c = b.getCenter(new V3());
    const sz = b.getSize(new V3());
    Object.assign(camT, {tx: c.x, ty: c.y, tz: c.z, d: clamp(Math.max(sz.x, sz.z) * 1.15 + sz.y * 0.5 + 1.6, 2.2, 6)});
    camT.el = Math.sign(camT.el || 1) * Math.max(Math.abs(camT.el), 0.95);
    S.follow = false;
  };

  // ------------------------------------------------------------ pointer: orbit, pan, zoom, hover, pick
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = {x: e.clientX, y: e.clientY, moved: 0, pan: e.button === 2 || e.shiftKey};
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('drag');
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = toStage(e.clientX, e.clientY);
    if (!drag) { S.ptr = [x, y]; return; }
    const dx = (e.clientX - drag.x) / scale;
    const dy = (e.clientY - drag.y) / scale;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX; drag.y = e.clientY;
    if (drag.pan) {
      const k = camT.d * 0.0011;
      camT.tx -= Math.cos(camT.az) * dx * k; camT.tz += Math.sin(camT.az) * dx * k; camT.ty += dy * k;
      S.follow = false;
    } else { camT.az -= dx * 0.0062; camT.el = clamp(camT.el + dy * 0.005, -1.5, 1.5); }
  });
  const endDrag = (e) => {
    if (drag && drag.moved < 5 && e.type === 'pointerup') {
      const [x, y] = toStage(e.clientX, e.clientY);
      const id = st.pick(x, y);
      if (id) select(id); else if (S.sel) select(null);
    }
    drag = null;
    canvas.classList.remove('drag');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => (S.ptr = null));
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); camT.d = clamp(camT.d * Math.exp(e.deltaY * 0.0012), 0.6, 8); }, {passive: false});
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || /input|textarea/i.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (/^[1-9]$/.test(k)) enterMode(MODE_KEYS[Number(k)]); else if (k === '0') enterMode('thermal'); else if (k === '-') enterMode('frame'); else if (k === 'e') enterMode('explore'); else if (k === 'h') S.hidden = !S.hidden; else if (k === 'escape') select(null); else if (k === ' ') act('spin'); else return;
    e.preventDefault();
  });

  // ------------------------------------------------------------ per-frame
  const box = new THREE.Box3();
  const bb = (id) => { const b = new THREE.Box3(); for (const m of parts[id].meshes) b.expandByObject(m); return b; };
  const ghostTarget = (p) => {
    let g = 0;
    if (S.mode !== 'explore') {
      const cfg = CFG[S.mode];
      if ((cfg ? cfg.hide : DEMO_HIDE).includes(p.id)) g = 1;
      if (cfg && cfg.ghost && cfg.ghost[p.id]) g = Math.max(g, cfg.ghost[p.id]);
    }
    const selE = S.sel ? entryOf(S.sel) : null;
    const mine = selE && p.entry === selE;
    if (!mine) {
      if (S.dispOff && p.id === 'display') g = 1;
      if (S.backOff && (p.id === 'backcover' || p.id === 'mbcover')) g = 1;
      if (S.xray && isShell(p.id)) g = Math.max(g, 0.93);
    }
    if (S.sel && !mine) g = Math.max(g, S.iso ? 1 : isShell(p.id) && !isShell(S.sel) ? 1 : 0.9);
    return g;
  };
  const anchors = [];
  const project = (id) => st.project(lap.center(id));
  const frame = (now) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    S.T += dt;
    const ke = 1 - Math.exp(-dt / (S.fast ? 0.07 : 0.4));
    S.explode += (S.exTarget - S.explode) * ke;
    if (Math.abs(S.exTarget - S.explode) < 0.002) { S.explode = S.exTarget; S.fast = false; }
    ui.set('exv', `${Math.round(S.explode * 100)}%`);
    for (const p of Object.values(parts)) if (p.pullT != null) p.pullK += (p.pullT - p.pullK) * (1 - Math.exp(-dt / 0.35));

    // glow: hover only; selection is shown by isolating the part
    const hovEntry = S.listHover || (S.hover ? entryOf(S.hover) : null);
    for (const p of Object.values(parts)) {
      const gt = ghostTarget(p);
      p.ghost += (gt - p.ghost) * (1 - Math.exp(-dt / 0.18));
      if (Math.abs(gt - p.ghost) < 0.004) p.ghost = gt;
      p.hidden = (S.mode === 'explore' ? !S.showIll : !(CFG[S.mode] && CFG[S.mode].ill)) && lap.ILL.includes(p.id);
      p.heat += ((S.want.heat[p.id] || 0) - p.heat) * (1 - Math.exp(-dt / 0.3));
      p.glow += ((hovEntry && p.entry === hovEntry ? 0.12 : 0) + (S.want.glow[p.id] || 0) - p.glow) * (1 - Math.exp(-dt / 0.15));
    }
    if (S.spin && !drag) camT.az += dt * 0.5;

    // illustrative signal pulses: along the three flex cables, and along the links of the selected part
    fx.begin(S.T);
    anchors.length = 0;
    S.want.glow = {};
    S.want.heat = {};
    if (S.mode !== 'explore') runner().tick(S.mode, dt);
    const flexVis = parts.flex.ghost < 0.9 && S.mode === 'explore';
    if (flexVis) FLEX.forEach((p, i) => fx.flow(p, 4, 34, i === 1 ? '#3b9bff' : '#f2a31b', 1.4, {dir: i === 2 ? -1 : 1, follow: 'flex'}));
    if (S.sel && S.tab === 'links') {
      const a = project(S.sel);
      const c0 = lap.center(S.sel).multiplyScalar(100);
      for (const [to] of CATALOG[entryOf(S.sel)].links) {
        const id = partsOf(to)[0];
        if (!id) continue;
        const c1 = lap.center(id).multiplyScalar(100);
        fx.flow({pts: [c0.clone(), c1.clone()], follow: null}, 4, 40, '#2f7de1', 1.6, {follow: null});
        const b = id && project(id);
        if (a && b) anchors.push({x: clamp(b[0], 340, 1240), y: clamp(b[1], 110, 790) - 6, text: CATALOG[to].short || CATALOG[to].name, from: a});
      }
    }
    fx.end();
    st.gtao.enabled = TIERS[tier].ao && !Object.values(parts).some((p) => p.ghost > 0.02 && p.ghost < 0.96);

    if (S.sel && S.follow) { const c = lap.center(S.sel); camT.tx = c.x; camT.ty = c.y; camT.tz = c.z; }
    const kc = 1 - Math.exp(-dt / 0.32);
    cam.az += wrap(camT.az - cam.az) * kc;
    for (const k of ['el', 'd', 'tx', 'ty', 'tz']) cam[k] += (camT[k] - cam[k]) * kc;
    st.frame({explode: S.explode}, {...cam, sx: 0, sy: S.mode === 'explore' ? 0 : -120});

    if (S.ptr && !drag && Math.floor(S.T * 20) % 2 === 0) { const id = st.pick(S.ptr[0], S.ptr[1]); S.hover = id; canvas.classList.toggle('hov', !!id); } else if (!S.ptr) S.hover = null;
    const tip = ui.tip;
    if (S.hover && S.ptr && !drag) {
      tip.style.display = ''; tip.style.left = `${S.ptr[0]}px`; tip.style.top = `${S.ptr[1]}px`;
      const nm = CATALOG[entryOf(S.hover)].name + (NAMES[S.hover] && NAMES[S.hover] !== CATALOG[entryOf(S.hover)].name ? ` · ${NAMES[S.hover]}` : '');
      if (tip.textContent !== nm) tip.textContent = nm;
    } else tip.style.display = 'none';
    ui.root.style.display = S.hidden ? 'none' : '';
    ui.hint(S.mode !== 'explore' ? '' : S.sel ? 'Pull out · Focus · Deselect in the inspector' : 'Drag to orbit · wheel to zoom · click a part');
    ui.callouts(anchors);
    if (!window.SIM_SHOWN) { window.SIM_SHOWN = true; dispatchEvent(new Event('simframe')); }
    requestAnimationFrame(frame);
  };

  // the three flex cables as paths in root millimetres (same curve as in phone.js)
  const FLEX = [29, 32, 35].map((x, i) => ({pts: new THREE.CatmullRomCurve3([new V3(x, 3.6, 62), new V3(x, 3.6, 40), new V3(x - 0.5, 3.6, 10), new V3(x, 3.6, -20), new V3(x - 2 + i, 3.6, -30)]).getPoints(30), follow: 'flex'}));
  let last = performance.now();
  sync();
  refresh();
  warmComposer(st.renderer, st.composer, st.scene, st.camera).then(() => requestAnimationFrame(frame));
  window.LIVE = {demos, gen, enterMode, st, S, ui, lap, act, select, selectEntry, cam, camT, setView, tier: () => tier, gpu, setTier: (t) => { tier = clamp(t, 0, 2); applyTier(); }};
}
