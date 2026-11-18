// The laptop, built from code in millimetres (1 scene unit = 100 mm: root.scale = 0.01). A generic 14-inch-class
// machine laid out like a real thin-and-light: battery across the front, board behind it, two blowers and three heat
// pipes at the rear, SO-DIMMs and the M.2 drives in the middle. Not a product: dimensions are TYP class values.
//
// Every visible thing is registered as a "part" with a home position, an explode vector and a window of the explode
// slider in which it moves, so the slider peels the machine top layer first. A part can also "open up" (its internal
// layers separate) and be "pulled out" on its own.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {PANEL} from './model.js';

const V3 = THREE.Vector3;
const D2R = Math.PI / 180;
const sstep = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

// ------------------------------------------------------------------------------------------------ parameter block
export const P = {
  W: 315, D: 220, wall: 2, rim: 13.4, deckTop: 15, plate: 1.5,
  pcbBot: 2.0, pcbTop: 3.2,
  lidD: 212, lidT: 6.3, hingeZ: -106,
  keyPitch: 19.05,
};
const PCB_TOP = P.pcbTop;
// the board: full width in front, only |x| < 65 behind z = -36 where the blowers sit
export const PCB_OUTLINE = [[-153, 42], [153, 42], [153, -36], [65, -36], [65, -106], [-65, -106], [-65, -36], [-153, -36]];

// ------------------------------------------------------------------------------------------------ nets: the single source of
// truth for routes. Polylines are [x, z] on the board (mm); the board texture, the glowing traces and the flow
// particles all read these, so the animation follows the copper that is drawn.
export const NET = {
  buses: {
    ddrA: {c: '#4aa3ff', pts: [[-34, -53.5], [-34, -30], [-89, -30], [-89, -22]], n: 14},
    ddrB: {c: '#4aa3ff', pts: [[-38, -53.5], [-38, -33], [-132, -33], [-132, 41.5], [-89, 41.5], [-89, 40]], n: 14},
    pcieSsd: {c: '#a77bff', pts: [[-18, -53.5], [-18, -30], [-50, -10], [-50, 27], [-46, 27]], n: 8},
    pcieGpu: {c: '#a77bff', pts: [[-6.5, -68], [16, -68]], n: 10},
    pcieWifi: {c: '#a77bff', pts: [[-10, -53.5], [-10, -24], [40, -24], [40, -3], [44, -3]], n: 3},
    edp: {c: '#38c8b8', pts: [[-6.5, -58], [8, -58], [8, -28], [80, -28], [80, -34]], n: 8},
    espi: {c: '#9aa3ad', pts: [[-36, -53.5], [-36, -47], [-104, -47], [-104, -34]], n: 4},
    spi: {c: '#9aa3ad', pts: [[-41, -53.5], [-41, -49], [-96, -49], [-96, -34]], n: 4},
    kbd: {c: '#9aa3ad', pts: [[60, 22], [60, 10]], n: 4},
    tp: {c: '#9aa3ad', pts: [[84, 38], [84, 34]], n: 4},
  },
  // power: a copper trunk along z = -26.5 with a branch to each consumer. v is the rail voltage label.
  power: {
    vbus: {c: '#ff9d1c', v: '20 V', pts: [[-157, -14], [-140, -14]]},
    pdChg: {c: '#ff7a18', v: 'VSYS', pts: [[-140, -14], [-140, -26.5]]},
    trunk: {c: '#ff7a18', v: 'VSYS', pts: [[-140, -26.5], [118, -26.5]]},
    batt: {c: '#ff7a18', v: 'VSYS', pts: [[118, -26.5], [118, 38]]},
    cpu: {c: '#ff4b6e', v: 'core', pts: [[-58, -26.5], [-58, -56]]},
    gpu: {c: '#ff4b6e', v: 'core', pts: [[59.5, -26.5], [59.5, -52]]},
    ssd: {c: '#19b8d4', v: '3.3 V', pts: [[-46, -26.5], [-46, 27]]},
    wifi: {c: '#19b8d4', v: '3.3 V', pts: [[44, -26.5], [44, -3]]},
    ram1: {c: '#f2c230', v: '5 V', pts: [[-120, -26.5], [-120, -22]]},
    ram2: {c: '#f2c230', v: '5 V', pts: [[-136, -26.5], [-136, 40], [-120, 40]]},
    disp: {c: '#ff7a18', v: 'VSYS', pts: [[80, -26.5], [80, -34]]},
    fan1: {c: '#f2c230', v: '5 V', pts: [[-62, -26.5], [-62, -38]]},
    fan2: {c: '#f2c230', v: '5 V', pts: [[62, -26.5], [62, -38]]},
  },
};

// ------------------------------------------------------------------------------------------------ small helpers
const geoCache = new Map();
const geo = (key, make) => {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
};
const rbox = (w, h, d, r = 0.3, seg = 2) => geo(`rb${w},${h},${d},${r},${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01)));
const box = (w, h, d) => geo(`bx${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (r, h, seg = 24, r2 = r) => geo(`cy${r},${r2},${h},${seg}`, () => new THREE.CylinderGeometry(r, r2, h, seg));

/** Rounded rectangle Shape in the (x, z) plane. */
function rrect(w, d, r, cx = 0, cz = 0) {
  const s = new THREE.Shape();
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const z0 = cz - d / 2;
  const z1 = cz + d / 2;
  s.moveTo(x0 + r, z0);
  s.lineTo(x1 - r, z0);
  s.absarc(x1 - r, z0 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x1, z1 - r);
  s.absarc(x1 - r, z1 - r, r, 0, Math.PI / 2, false);
  s.lineTo(x0 + r, z1);
  s.absarc(x0 + r, z1 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, z0 + r);
  s.absarc(x0 + r, z0 + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}
function rrectPath(w, d, r, cx = 0, cz = 0) {
  const p = new THREE.Path(rrect(w, d, r, cx, cz).getPoints(8));
  p.closePath();
  return p;
}
/** A flat plate from a Shape in (x, z): spans y in [0, t] after the rotation. */
function slab(shape, t, bevel = 0, curve = 8) {
  const g = new THREE.ExtrudeGeometry(shape, {depth: t - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: curve});
  g.rotateX(Math.PI / 2);
  g.translate(0, t - bevel, 0);
  return g;
}

const texCache = new Map();
function labelTex(text, {w = 128, h = 64, fg = '#9aa0a8', bg = null, size = 15, sub = null} = {}) {
  const key = `${text}|${sub}|${fg}|${bg}`;
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  }
  g.fillStyle = fg;
  g.font = `600 ${size}px "JetBrains Mono", monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, sub ? h * 0.38 : h / 2);
  if (sub) {
    g.font = `500 ${size * 0.62}px "JetBrains Mono", monospace`;
    g.fillText(sub, w / 2, h * 0.7);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

// ------------------------------------------------------------------------------------------------ the build
export function buildLaptop() {
  const root = new THREE.Group();
  root.scale.setScalar(0.01);
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, P.deckTop, P.hingeZ);
  root.add(lidPivot);
  const parts = {};
  const meshesAll = [];
  const hit = []; // meshes that picking may hit

  const part = (id, entry, {home = [0, 0, 0], ex = [0, 0, 0], win = [0, 1], pull = [0, 0, 0], parent = root, shell = false} = {}) => {
    const obj = new THREE.Group();
    obj.name = id;
    obj.position.set(...home);
    parent.add(obj);
    parts[id] = {id, entry, obj, home: new V3(...home), ex: new V3(...ex), win, pull: new V3(...pull), pullK: 0, openK: 0, openFns: [], mats: [], meshes: [], shell, ghost: 0, glow: 0, hover: 0, heat: 0, hidden: false};
    return parts[id];
  };
  const mat = (p, o = {}) => {
    const m = new THREE.MeshStandardMaterial({color: o.color ?? '#888', metalness: o.metal ?? 0, roughness: o.rough ?? 0.6, envMapIntensity: o.env ?? 0.7, emissive: o.emissive ?? '#000', emissiveIntensity: o.ei ?? 1, side: o.side ?? THREE.FrontSide, transparent: true, opacity: o.opacity ?? 1, map: o.map ?? null, emissiveMap: o.emissiveMap ?? null, polygonOffset: !!o.po, polygonOffsetFactor: o.po ? -2 : 0, polygonOffsetUnits: o.po ? -2 : 0});
    if (o.alphaTest) m.alphaTest = o.alphaTest;
    // every part material is permanently transparent: three bakes an OPAQUE define into the shader when the flag is false,
    // so flipping it at runtime would recompile. Solid parts keep opacity 1 and write depth, so order does not matter.
    m.userData.base = {color: m.color.clone(), emissive: m.emissive.clone(), ei: m.emissiveIntensity, opacity: m.opacity, transparent: !!o.transparent, depthWrite: true};
    p.mats.push(m);
    return m;
  };
  const add = (p, g, m, [x, y, z] = [0, 0, 0], o = {}) => {
    const me = o.instances ? new THREE.InstancedMesh(g, m, o.instances) : new THREE.Mesh(g, m);
    me.position.set(x, y, z);
    if (o.rot) me.rotation.set(...o.rot);
    // only parts big enough to throw a visible shadow cast one: it halves the shadow pass on an integrated GPU
    let cast = o.cast;
    if (cast === undefined) {
      g.computeBoundingBox();
      const sz = g.boundingBox.getSize(new V3());
      cast = Math.max(sz.x, sz.y, sz.z) >= 13;
    }
    me.castShadow = cast;
    me.receiveShadow = o.recv ?? true;
    me.userData.part = p.id;
    me.userData.baseCast = me.castShadow;
    if (o.nopick) me.userData.nopick = true;
    (o.parent || p.obj).add(me);
    p.meshes.push(me);
    meshesAll.push(me);
    if (!o.nopick) hit.push(me);
    return me;
  };
  /** A group of meshes that lifts as one layer when the part opens up. */
  const layer = (p, v, base = [0, 0, 0]) => {
    const g = new THREE.Group();
    g.position.set(...base);
    p.obj.add(g);
    p.openFns.push((k) => g.position.set(base[0] + v[0] * k, base[1] + v[1] * k, base[2] + v[2] * k));
    return g;
  };
  const addIn = (p, grp, g, m, pos, o = {}) => add(p, g, m, pos, {...o, parent: grp});
  /** Many small boxes as one draw call: items are [x, y, z, w, h, d]. */
  const unitBox = box(1, 1, 1);
  const inst = (p, material, items, o = {}) => {
    const me = add(p, unitBox, material, [0, 0, 0], {instances: items.length, cast: o.cast ?? false, parent: o.parent, nopick: o.nopick});
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new V3();
    items.forEach(([x, y, z, w, h, d], i) => me.setMatrixAt(i, m4.compose(new V3(x, y, z), q, sc.set(w, h, d))));
    me.frustumCulled = false;
    return me;
  };

  // palette
  const C = {
    alu: {color: '#a2a8b0', metal: 0.85, rough: 0.5, env: 0.6},
    aluD: {color: '#80858d', metal: 0.85, rough: 0.52, env: 0.6},
    blk: {color: '#16181b', rough: 0.55, env: 0.5},
    blk2: {color: '#25282c', rough: 0.5, env: 0.5},
    key: {color: '#202327', rough: 0.55, env: 0.45},
    pcb: {color: '#1b5a3b', rough: 0.55, env: 0.4},
    cu: {color: '#c9773b', metal: 1, rough: 0.36, env: 0.8},
    ni: {color: '#b8bdc5', metal: 1, rough: 0.3, env: 0.8},
    gold: {color: '#d6b13c', metal: 1, rough: 0.3, env: 0.8},
    epoxy: {color: '#121316', rough: 0.5, env: 0.5},
    si: {color: '#5a6573', metal: 0.7, rough: 0.28, env: 0.9},
    fin: {color: '#cfd3d9', metal: 0.9, rough: 0.4, env: 0.6},
    foil: {color: '#c3c9d2', metal: 0.8, rough: 0.35, env: 0.7},
  };

  // ============================================================ bottom cover (D cover)
  {
    const p = part('dcover', 'dcover', {ex: [0, -62, 0], win: [0.62, 1]});
    const m = mat(p, C.aluD);
    const mk = mat(p, {color: '#0d0e10', rough: 0.6});
    const plate = rrect(P.W, P.D, 9);
    // intake vents under each fan
    for (const fx of [-104, 104])
      for (let i = 0; i < 9; i++) {
        const h = rrectPath(2.2, 24, 1.1, fx - 20 + i * 5, -68);
        plate.holes.push(h);
      }
    add(p, slab(plate, P.plate, 0.2), m, [0, 0, 0]);
    const ring = rrect(P.W, P.D, 9);
    ring.holes.push(rrectPath(P.W - P.wall * 2, P.D - P.wall * 2, 7));
    add(p, slab(ring, P.rim - P.plate, 0.15), m, [0, P.plate, 0]);
    // screw posts and heads, feet
    for (const [x, z] of [[-148, -100], [148, -100], [-148, 100], [148, 100], [0, -100], [0, 100]]) add(p, cyl(2.4, 6, 14), m, [x, P.plate + 3, z]);
    for (const [x, z] of [[-135, -95], [135, -95], [-135, 95], [135, 95]]) add(p, cyl(6, 1.2, 20), mat(p, {color: '#0c0d0f', rough: 0.8}), [x, -0.6, z], {cast: false});
    for (const [x, z] of [[-60, 60], [60, 60], [-20, -90], [20, -90]]) add(p, cyl(1.6, 0.5, 12), mk, [x, -0.1, z], {cast: false});
    // port openings and rear exhaust slots on the walls (dark inserts)
    const hole = (w, h, x, y, z, rotY) => add(p, rbox(w, h, 0.8, 0.4, 1), mk, [x, y, z], {cast: false, rot: [0, rotY, 0]});
    for (const z of [-14, 2]) hole(9, 3.2, -157.2, 6.5, z, Math.PI / 2);
    hole(15, 6.5, -157.2, 6.8, 18, Math.PI / 2);
    hole(7, 7, -157.2, 7, 34, Math.PI / 2);
    for (const z of [-10, 12]) hole(14, 6.5, 157.2, 6.8, z, Math.PI / 2);
    hole(7, 7, 157.2, 7, 34, Math.PI / 2);
    const slots = [];
    for (let i = 0; i < 16; i++) for (const sx of [-1, 1]) slots.push([sx * (84 + i * 3.4), 8, -110.3, 2.2, 5, 0.8]);
    inst(p, mk, slots);
  }

  // ============================================================ top case (C cover) with keyboard and touchpad openings
  {
    const p = part('ccover', 'ccover', {home: [0, P.rim, 0], ex: [0, 78, 0], win: [0, 0.4], shell: true});
    const m = mat(p, C.alu);
    const shape = rrect(P.W, P.D, 9);
    shape.holes.push(rrectPath(291, 113, 2, 0, -43));
    shape.holes.push(rrectPath(111, 69, 3, 0, 69));
    add(p, slab(shape, P.deckTop - P.rim, 0.25), m, [0, 0, 0]);
    // speaker grilles above the speakers
    const gm = mat(p, {color: '#08090a', rough: 0.7});
    const grille = [];
    for (const sx of [-1, 1]) for (let i = 0; i < 9; i++) grille.push([sx * (124 + (i - 4) * 3.3), P.deckTop - P.rim + 0.02, 92, 1.4, 0.4, 20]);
    inst(p, gm, grille);
  }

  // ============================================================ keyboard
  const KB = {x: 0, z: -43, top: 15.4};
  {
    const p = part('keyboard', 'keyboard', {home: [0, 0, 0], ex: [0, 66, 0], win: [0, 0.4]});
    // layout: 15 units wide, function row 0.7 unit tall
    const L = (str) => str.split(' ').map((k) => [k, 1]);
    const rows = [
      {h: 0.7, keys: [['Esc', 1], ...L('F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12'), ['Del', 1], ['Pwr', 1]]},
      {h: 1, keys: [...L('` 1 2 3 4 5 6 7 8 9 0 - ='), ['Bksp', 2]]},
      {h: 1, keys: [['Tab', 1.5], ...L('Q W E R T Y U I O P [ ]'), ['\\', 1.5]]},
      {h: 1, keys: [['Caps', 1.75], ...L("A S D F G H J K L ; '"), ['Enter', 2.25]]},
      {h: 1, keys: [['Shift', 2.25], ...L('Z X C V B N M , . /'), ['Shift', 2.75]]},
      {h: 1, keys: [['Ctrl', 1.25], ['Fn', 1], ['Win', 1], ['Alt', 1.25], ['', 6.25], ['Alt', 1], ['Ctrl', 1], ['←', 1], ['↑↓', 1], ['→', 1]]},
    ];
    const keys = [];
    let zc = 0;
    rows.forEach((r, ri) => {
      const list = r.keys;
      const rh = r.h * P.keyPitch;
      let xc = -7.5 * P.keyPitch;
      for (const [label, u] of list) {
        keys.push({x: xc + (u * P.keyPitch) / 2, z: zc + rh / 2, w: u * P.keyPitch - 3.0, d: rh - 3.0, label});
        xc += u * P.keyPitch;
      }
      zc += rh;
    });
    const zOff = -43 - zc / 2; // centre the key field in the deck opening
    keys.forEach((k) => (k.z += zOff));
    // back plate
    const plateM = mat(p, {color: '#6a6f77', metal: 0.8, rough: 0.5, env: 0.5});
    const lPlate = layer(p, [0, -8, 0]);
    addIn(p, lPlate, rbox(289, 0.9, 111, 0.3, 1), plateM, [0, 9.9, -43]);
    // membrane sheet and rubber domes
    const lMem = layer(p, [0, -3, 0]);
    addIn(p, lMem, rbox(287, 0.4, 109, 0.2, 1), mat(p, {color: '#2b2d31', rough: 0.6, env: 0.3}), [0, 10.7, -43]);
    const dm = mat(p, {color: '#cfd4d8', rough: 0.5, env: 0.3, transparent: true, opacity: 0.75});
    const lDome = layer(p, [0, 3, 0]);
    const domes = addIn(p, lDome, cyl(2.6, 0.9, 12), dm, [0, 11.3, 0], {instances: keys.length, cast: false});
    const dmx = new THREE.Matrix4();
    keys.forEach((k, i) => domes.setMatrixAt(i, dmx.makeTranslation(k.x, 0, k.z)));
    // keycaps, instanced; legends on a transparent decal plane above them
    const lCaps = layer(p, [0, 12, 0]);
    const km = mat(p, C.key);
    const caps = addIn(p, lCaps, rbox(1, 1, 1, 0.1, 2), km, [0, 0, 0], {instances: keys.length});
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    keys.forEach((k, i) => {
      m4.compose(new V3(k.x, 13.6, k.z), q, new V3(k.w, 3.6, k.d));
      caps.setMatrixAt(i, m4);
    });
    caps.frustumCulled = false;
    // legends: one canvas for the whole key field
    const S = 7;
    const cv = document.createElement('canvas');
    cv.width = Math.round(291 * S);
    cv.height = Math.round(113 * S);
    const g = cv.getContext('2d');
    g.fillStyle = '#d9dde3';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const k of keys) {
      const px = (k.x + 145.5) * S;
      const pz = (k.z - (-43 - 56.5)) * S;
      const long = k.label.length > 1;
      g.font = `600 ${(long ? 3.1 : 5.2) * S}px Inter, sans-serif`;
      if (k.label) g.fillText(k.label, px, pz + 0.2 * S);
    }
    const lt = new THREE.CanvasTexture(cv);
    lt.colorSpace = THREE.SRGBColorSpace;
    lt.anisotropy = 8;
    const legend = new THREE.Mesh(new THREE.PlaneGeometry(291, 113), new THREE.MeshBasicMaterial({map: lt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, toneMapped: false}));
    legend.rotation.x = -Math.PI / 2;
    legend.position.set(0, 15.43, -43);
    legend.userData.part = 'keyboard';
    legend.userData.nopick = true;
    lCaps.add(legend);
    p.legend = legend;
    p.mats.push(legend.material);
    legend.material.userData.base = {color: legend.material.color.clone(), emissive: new THREE.Color(), ei: 1, opacity: 1, transparent: true, depthWrite: false};
    p.keys = keys;
    // a faint backlight sheet shows under the caps in the open view
    parts.keyboard.caps = caps;
  }

  // ============================================================ touchpad
  {
    const p = part('touchpad', 'touchpad', {ex: [0, 52, 12], win: [0.05, 0.45]});
    const lG = layer(p, [0, 7, 0]);
    addIn(p, lG, rbox(110, 0.7, 68, 0.6, 2), mat(p, {color: '#191b1e', rough: 0.18, metal: 0.1, env: 0.8}), [0, 14.65, 69]);
    const lS = layer(p, [0, -2, 0]);
    addIn(p, lS, rbox(104, 0.8, 62, 0.3, 1), mat(p, C.pcb), [0, 13, 69]);
    inst(p, mat(p, C.gold), Array.from({length: 6}, (_, i) => [0, 13.45, 42 + i * 10.5, 98, 0.06, 0.18]), {parent: lS});
    for (const x of [-48, 48]) add(p, box(8, 1, 6), mat(p, C.ni), [x, 12, 98]);
  }

  // ============================================================ board
  {
    const p = part('board', 'board', {ex: [0, -4, 0], win: [0.45, 0.95]});
    const outline = new THREE.Shape(PCB_OUTLINE.map(([x, z]) => new THREE.Vector2(x, z)));
    const g = slab(outline, 1.2, 0, 4);
    const pos = g.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = (pos.getX(i) + 153) / 306;
      uv[i * 2 + 1] = 1 - (pos.getZ(i) + 106) / 148;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const tex = pcbTexture();
    p.tex = tex;
    const top = mat(p, {...C.pcb, map: tex, rough: 0.5});
    const side = mat(p, {color: '#12402a', rough: 0.6});
    const me = new THREE.Mesh(g, [top, side]);
    me.position.set(0, P.pcbBot, 0);
    me.castShadow = true;
    me.receiveShadow = true;
    me.userData.part = 'board';
    p.obj.add(me);
    p.meshes.push(me);
    meshesAll.push(me);
    hit.push(me);
    // standoff screws at the corners
    for (const [x, z] of [[-148, 38], [148, 38], [-60, -100], [60, -100], [0, 18], [150, -32], [-150, -32]]) add(p, cyl(2.2, 1.6, 14), mat(p, C.ni), [x, PCB_TOP + 0.8, z]);
    // connectors for the cables
    for (const [x, z, w, d] of [[80, -34, 14, 4], [60, 22, 12, 3.5], [84, 38, 10, 3.5], [118, 38, 10, 5], [-62, -38, 6, 4], [62, -38, 6, 4]]) add(p, rbox(w, 2.2, d, 0.3, 1), mat(p, {color: '#e8e4d6', rough: 0.5}), [x, PCB_TOP + 1.1, z]);
    // passives: instanced chip resistors and capacitors, kept clear of the big parts
    const clear = [[-45, -80, -4, -51], [14, -84, 50, -48], [-64, -78, -46, -54], [52, -78, 64, -50], [-160, -48, -140, 42], [140, -48, 160, 42], [-124, -26, -52, 12], [-124, 8, -52, 42], [-48, 14, 36, 40], [42, -16, 76, 10], [-116, -37, -92, -25], [20, -50, 52, -30], [-6, -30, 6, -20], [110, 34, 126, 42]];
    const inClear = (x, z) => clear.some(([a, b, c, d]) => x > a && x < c && z > b && z < d);
    const N = 380;
    const cap = add(p, box(1.0, 0.5, 0.6), mat(p, {color: '#ffffff', rough: 0.5}), [0, PCB_TOP + 0.25, 0], {instances: N, cast: false});
    const cols = ['#8f7a55', '#8f7a55', '#2b2c2f', '#6f5a3a', '#a89560'].map((c) => new THREE.Color(c));
    let s = 746337;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const m4 = new THREE.Matrix4();
    let n = 0;
    for (let tries = 0; n < N && tries < 6000; tries++) {
      const near = r() < 0.55;
      const x = near ? (r() < 0.5 ? -24 : 34) + (r() - 0.5) * 80 : (r() - 0.5) * 300;
      const z = near ? -66 + (r() - 0.5) * 50 : -34 + r() * 74;
      const inb = PCB_OUTLINE && x > -151 && x < 151 && z > -104 && z < 41 && (z > -36 || Math.abs(x) < 64);
      if (!inb || inClear(x, z)) continue;
      m4.makeRotationY(r() < 0.5 ? 0 : Math.PI / 2).setPosition(x, 0, z);
      cap.setMatrixAt(n, m4);
      cap.setColorAt(n, cols[Math.floor(r() * cols.length)]);
      n++;
    }
    cap.count = n;
    p.openFns.push(() => {});
  }

  // ============================================================ SoC (CPU) and GPU packages
  const dieTex = (kind) => {
    const c = document.createElement('canvas');
    c.width = 560;
    c.height = 400;
    const g = c.getContext('2d');
    g.fillStyle = '#26303b';
    g.fillRect(0, 0, 560, 400);
    const blk = (x, y, w, h, col, label) => {
      g.fillStyle = col;
      g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(255,255,255,.25)';
      g.lineWidth = 1.5;
      g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      g.fillStyle = 'rgba(255,255,255,.88)';
      g.font = '600 18px "JetBrains Mono", monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, x + w / 2, y + h / 2);
    };
    if (kind === 'soc') {
      for (let i = 0; i < 4; i++) blk(14 + i * 78, 14, 72, 128, '#2f6fb6', `CORE ${i}`);
      blk(332, 14, 214, 128, '#2f8f9b', 'iGPU');
      blk(14, 152, 318, 102, '#3a4a60', 'L3 CACHE (shared)');
      blk(332, 152, 100, 102, '#8a5aa8', 'DISPLAY');
      blk(442, 152, 104, 102, '#a8663d', 'MEDIA');
      blk(14, 264, 150, 122, '#b4533f', 'MEMORY CTRL');
      blk(172, 264, 180, 122, '#6a5aa8', 'PCIe + USB');
      blk(360, 264, 186, 122, '#5a6a54', 'FABRIC / IO');
    } else {
      for (let r = 0; r < 3; r++) for (let q = 0; q < 4; q++) blk(14 + q * 100, 14 + r * 84, 94, 78, '#3b8f5a', `SM`);
      blk(420, 14, 126, 246, '#3a4a60', 'L2');
      blk(14, 272, 250, 114, '#b4533f', 'MEMORY CTRL');
      blk(272, 272, 274, 114, '#6a5aa8', 'PCIe · DISPLAY');
    }
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.font = '500 13px "JetBrains Mono", monospace';
    g.textAlign = 'left';
    g.fillText('ILLUSTRATIVE FLOORPLAN', 18, 396);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const pkg = (id, entry, x, z, pw, pd, dw, dd, kind, label) => {
    const p = part(id, entry, {home: [x, PCB_TOP, z], ex: [0, 22, 0], win: [0.3, 0.75]});
    add(p, rbox(pw, 1.0, pd, 0.3, 2), mat(p, {color: '#2a4d3a', rough: 0.5}), [0, 0.5, 0]);
    // solder balls hint along the edge
    add(p, rbox(pw - 1, 0.35, pd - 1, 0.1, 1), mat(p, {color: '#b9bfc7', metal: 1, rough: 0.4}), [0, 0.1, 0], {cast: false});
    const lD = layer(p, [0, 8, 0]);
    const dt = dieTex(kind);
    const dm = mat(p, {color: '#ffffff', metal: 0.2, rough: 0.35, env: 0.8, map: dt});
    const die = new THREE.Mesh(box(dw, 0.8, dd), [mat(p, C.si), mat(p, C.si), dm, mat(p, C.si), mat(p, C.si), mat(p, C.si)]);
    die.position.set(0, 1.4, 0);
    die.castShadow = true;
    die.userData.part = id;
    lD.add(die);
    p.meshes.push(die);
    meshesAll.push(die);
    hit.push(die);
    const lT = layer(p, [0, 14, 0]);
    addIn(p, lT, box(dw + 1, 0.12, dd + 1), mat(p, {color: '#9aa0a8', rough: 0.4, metal: 0.6, transparent: true, opacity: 0.9}), [0, 1.9, 0], {cast: false});
    // package marking
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(14, 5), new THREE.MeshBasicMaterial({map: labelTex(label, {w: 256, h: 96, fg: '#cfd5dd', size: 22, sub: 'ILLUSTRATIVE'}), transparent: true, toneMapped: false}));
    lab.rotation.x = -Math.PI / 2;
    lab.position.set(-pw / 2 + 9, 1.03, pd / 2 - 3.2);
    p.obj.add(lab);
    return p;
  };
  pkg('soc', 'soc', -24, -66, 35, 25, 14.5, 10.5, 'soc', 'REF SoC');
  pkg('gpu', 'gpu', 32, -66, 32, 32, 20, 17, 'gpu', 'REF dGPU');

  // GDDR6 chips around the GPU
  {
    const p = part('vram', 'vram', {ex: [0, 16, 0], win: [0.3, 0.75]});
    const m = mat(p, C.epoxy);
    for (const [x, z] of [[24, -96], [40, -96], [24, -40], [40, -40]]) {
      add(p, rbox(14, 1.0, 12, 0.3, 1), m, [x, PCB_TOP + 0.5, z]);
      const l = new THREE.Mesh(new THREE.PlaneGeometry(10, 4), new THREE.MeshBasicMaterial({map: labelTex('GDDR6', {w: 160, h: 64, fg: '#8d949c', size: 24}), transparent: true, toneMapped: false}));
      l.rotation.x = -Math.PI / 2;
      l.position.set(x, PCB_TOP + 1.03, z);
      p.obj.add(l);
    }
  }

  // ============================================================ VRM, PD, EC, firmware
  const vrm = (id, x, z0, nz) => {
    const p = part(id, 'vrm', {home: [x, PCB_TOP, z0], ex: [0, 12, 0], win: [0.35, 0.8]});
    const mc = mat(p, {color: '#3b3f45', metal: 0.5, rough: 0.5, env: 0.6});
    const ms = mat(p, C.epoxy);
    for (let i = 0; i < nz; i++) {
      add(p, rbox(7, 2.6, 7, 0.4, 1), mc, [0, 1.3, i * 8]);
      add(p, rbox(4.6, 0.8, 4.4, 0.2, 1), ms, [x < 0 ? 8 : -8.2, 0.4, i * 8]);
    }
    return p;
  };
  vrm('vrm_cpu', -57, -74, 3);
  vrm('vrm_gpu', 59.5, -74, 3);
  {
    const p = part('pd', 'pd', {home: [-138, PCB_TOP, -14], ex: [0, 10, 0], win: [0.35, 0.8]});
    add(p, rbox(7, 0.9, 7, 0.25, 1), mat(p, C.epoxy), [0, 0.45, 0]);
    add(p, rbox(8, 3, 8, 0.4, 1), mat(p, {color: '#3b3f45', metal: 0.5, rough: 0.5}), [0, 1.5, 10]);
    add(p, rbox(5, 0.9, 5, 0.25, 1), mat(p, C.epoxy), [0, 0.45, -9]);
    const l = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({map: labelTex('PD', {w: 96, h: 48, fg: '#8d949c', size: 22}), transparent: true, toneMapped: false}));
    l.rotation.x = -Math.PI / 2;
    l.position.set(0, 0.93, 0);
    p.obj.add(l);
  }
  {
    const p = part('ec', 'ec', {home: [-112, PCB_TOP, -32], ex: [0, 11, 0], win: [0.35, 0.8]});
    add(p, rbox(7, 1.0, 7, 0.25, 1), mat(p, C.epoxy), [0, 0.5, 0]);
    const l = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), new THREE.MeshBasicMaterial({map: labelTex('EC', {w: 96, h: 56, fg: '#8d949c', size: 24}), transparent: true, toneMapped: false}));
    l.rotation.x = -Math.PI / 2;
    l.position.set(0, 1.03, 0);
    p.obj.add(l);
  }
  {
    const p = part('bios', 'bios', {home: [-96, PCB_TOP, -32], ex: [0, 11, 0], win: [0.35, 0.8]});
    add(p, rbox(5.4, 0.9, 6.2, 0.2, 1), mat(p, C.epoxy), [0, 0.45, 0]);
    const pins = [];
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) pins.push([sx * 3, 0.1, -2.2 + i * 1.5, 0.6, 0.15, 0.4]);
    inst(p, mat(p, C.ni), pins);
    const l = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshBasicMaterial({map: labelTex('SPI', {w: 80, h: 56, fg: '#8d949c', size: 22}), transparent: true, toneMapped: false}));
    l.rotation.x = -Math.PI / 2;
    l.position.set(0, 0.93, 0);
    p.obj.add(l);
  }

  // ============================================================ RAM: two DDR5 SO-DIMMs
  const dimm = (id, x, zSlot, dir, tag) => {
    // dir: +1 the module extends toward +z from its slot, -1 toward -z
    const p = part(id, 'ram', {home: [x, PCB_TOP, zSlot], ex: [0, 30, 0], win: [0.25, 0.75], pull: [0, 24, 52 * dir]});
    // the slot and its clips are soldered to the board: they stay when the module lifts out
    const bd = parts.board;
    add(bd, rbox(70.5, 4.6, 4.6, 0.5, 1), mat(bd, {color: '#1a1c1f', rough: 0.55}), [x, PCB_TOP + 2.3, zSlot]);
    for (const sx of [-1, 1]) add(bd, rbox(1.4, 4.2, 3.2, 0.3, 1), mat(bd, C.ni), [x + sx * 36, PCB_TOP + 2.5, zSlot + 4.2 * dir]);
    const grp = new THREE.Group();
    grp.position.set(0, 3.1, 0);
    p.obj.add(grp);
    const pcbm = mat(p, {color: '#1f5a3b', rough: 0.5});
    add(p, rbox(69.6, 1.2, 30, 0.3, 1), pcbm, [0, 0, 15 * dir], {parent: grp});
    // gold fingers along the slot edge, with the key notch
    const fg = mat(p, C.gold);
    for (const [a, b] of [[-34, -3], [-1.5, 34]]) add(p, box(b - a, 0.2, 2.4), fg, [(a + b) / 2, 0.5, 1.4 * dir], {parent: grp, cast: false});
    const l1 = layer(p, [0, 7, 0], [0, 3.1, 0]);
    const lm = mat(p, C.epoxy);
    for (let i = 0; i < 4; i++) {
      addIn(p, l1, rbox(11, 1.0, 9, 0.3, 1), lm, [-24 + i * 14.5 + (i > 1 ? 4 : 0), 1.1, 17 * dir]);
      const t = new THREE.Mesh(new THREE.PlaneGeometry(8, 3), new THREE.MeshBasicMaterial({map: labelTex('DDR5', {w: 128, h: 48, fg: '#8d949c', size: 22}), transparent: true, toneMapped: false}));
      t.rotation.x = -Math.PI / 2;
      t.position.set(-24 + i * 14.5 + (i > 1 ? 4 : 0), 1.63, 17 * dir);
      l1.add(t);
    }
    addIn(p, grp, rbox(5.5, 0.9, 5.5, 0.25, 1), mat(p, {color: '#1b1d20', rough: 0.45}), [-31, 1.0, 5 * dir]); // PMIC
    addIn(p, grp, rbox(3, 0.7, 2.4, 0.2, 1), lm, [27, 0.9, 5 * dir]); // SPD hub
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(8, 3), new THREE.MeshBasicMaterial({map: labelTex('PMIC', {w: 128, h: 48, fg: '#8d949c', size: 22}), transparent: true, toneMapped: false}));
    lab.rotation.x = -Math.PI / 2;
    lab.position.set(-31, 1.5, 5 * dir);
    grp.add(lab);
    p.grp = grp;
    return p;
  };
  dimm('ram1', -89, -22, 1, '1');
  dimm('ram2', -89, 40, -1, '2');

  // ============================================================ SSD (M.2 2280)
  {
    const p = part('ssd', 'ssd', {home: [-6, PCB_TOP, 27], ex: [0, 26, 8], win: [0.25, 0.75], pull: [60, 16, 0]});
    const bd = parts.board;
    add(bd, rbox(8, 2.8, 24, 0.4, 1), mat(bd, {color: '#17191c', rough: 0.5}), [-46, PCB_TOP + 1.4, 27]); // M.2 socket
    add(bd, cyl(2, 3, 14), mat(bd, C.ni), [34, PCB_TOP + 1.5, 27]); // standoff
    add(bd, cyl(1.5, 0.8, 14), mat(bd, C.ni), [34, PCB_TOP + 3.1, 27]);
    const grp = new THREE.Group();
    grp.position.set(0, 2.9, 0);
    p.obj.add(grp);
    add(p, rbox(80, 0.8, 22, 0.3, 1), mat(p, {color: '#1c4d36', rough: 0.5}), [0, 0, 0], {parent: grp});
    inst(p, mat(p, C.gold), Array.from({length: 22}, (_, i) => [-38.8, 0.45, -10 + i * 0.95, 1.8, 0.15, 0.5]), {parent: grp});
    const lN = layer(p, [0, 7, 0], [0, 2.9, 0]);
    const nm = mat(p, C.epoxy);
    for (const x of [-16, 12]) {
      addIn(p, lN, rbox(15, 1.0, 17, 0.3, 1), nm, [x, 0.95, 0]);
      const t = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.4), new THREE.MeshBasicMaterial({map: labelTex('NAND', {w: 128, h: 48, fg: '#8d949c', size: 22}), transparent: true, toneMapped: false}));
      t.rotation.x = -Math.PI / 2;
      t.position.set(x, 1.48, 0);
      lN.add(t);
    }
    const lC = layer(p, [0, 12, 0], [0, 2.9, 0]);
    addIn(p, lC, rbox(12, 1.0, 12, 0.3, 1), mat(p, {color: '#16181b', rough: 0.4}), [-33, 0.95, 0]);
    const t2 = new THREE.Mesh(new THREE.PlaneGeometry(8, 3), new THREE.MeshBasicMaterial({map: labelTex('CTRL', {w: 128, h: 48, fg: '#8d949c', size: 22}), transparent: true, toneMapped: false}));
    t2.rotation.x = -Math.PI / 2;
    t2.position.set(-33, 1.48, 0);
    lC.add(t2);
    // label sticker over the NAND
    const lL = layer(p, [0, 18, 0], [0, 2.9, 0]);
    addIn(p, lL, box(30, 0.08, 18.5), mat(p, {color: '#3d4a5c', rough: 0.5, metal: 0.3}), [0, 2.1, 0], {cast: false});
    p.grp = grp;
  }

  // ============================================================ Wi-Fi card (M.2 2230)
  {
    const p = part('wifi', 'wifi', {home: [59, PCB_TOP, -3], ex: [0, 24, 0], win: [0.3, 0.8], pull: [30, 18, 0]});
    const bd = parts.board;
    add(bd, rbox(6, 2.6, 18, 0.4, 1), mat(bd, {color: '#17191c', rough: 0.5}), [43, PCB_TOP + 1.3, -3]);
    add(bd, cyl(1.7, 2.6, 12), mat(bd, C.ni), [76, PCB_TOP + 1.3, -3]);
    const grp = new THREE.Group();
    grp.position.set(0, 2.7, 0);
    p.obj.add(grp);
    add(p, rbox(30, 0.8, 22, 0.3, 1), mat(p, {color: '#1c4d36', rough: 0.5}), [0, 0, 0], {parent: grp});
    const lS = layer(p, [0, 8, 0], [0, 2.7, 0]);
    addIn(p, lS, rbox(13, 1.6, 13, 0.3, 1), mat(p, {color: '#858b94', metal: 0.9, rough: 0.4, env: 0.5}), [-3, 1.2, 0]); // RF shield can
    for (const z of [-4, 4]) add(p, rbox(3, 1.2, 3, 0.3, 1), mat(p, C.gold), [11, 0.95, z], {parent: grp}); // MHF4 jacks
    p.grp = grp;
  }

  // ============================================================ battery: 3 pouch cells and a protection board
  {
    const p = part('battery', 'battery', {ex: [0, -26, 18], win: [0.45, 0.9], pull: [0, -8, 60]});
    const foil = mat(p, {color: '#a3abb6', metal: 0.8, rough: 0.4, env: 0.6});
    const tape = mat(p, {color: '#17191c', rough: 0.6});
    const lab = labelTex('Li-ion · 3S', {w: 512, h: 256, fg: '#2a3340', bg: '#cfd5dc', size: 54, sub: 'ILLUSTRATIVE CELL'});
    const lm = mat(p, {color: '#ffffff', rough: 0.45, map: lab, env: 0.4});
    [-70, 0, 70].forEach((cx, i) => {
      const l = layer(p, [(i - 1) * 8, i === 1 ? 4 : 0, 0]);
      addIn(p, l, rbox(66, 5.6, 58, 1.2, 2), foil, [cx, 4.8, 77]);
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(50, 25), new THREE.MeshStandardMaterial({map: lab, roughness: 0.5, transparent: true}));
      pl.rotation.x = -Math.PI / 2;
      pl.position.set(cx, 7.64, 78);
      pl.userData.part = 'battery';
      l.add(pl);
      p.meshes.push(pl);
      meshesAll.push(pl);
      hit.push(pl);
      p.mats.push(pl.material);
      pl.material.userData.base = {color: pl.material.color.clone(), emissive: pl.material.emissive.clone(), ei: 1, opacity: 1, transparent: false, depthWrite: true};
      pl.renderOrder = 1;
      // tabs
      addIn(p, l, box(10, 0.3, 4), mat(p, C.ni), [cx - 12, 4.8, 48], {cast: false});
      addIn(p, l, box(10, 0.3, 4), mat(p, C.cu), [cx + 12, 4.8, 48], {cast: false});
      addIn(p, l, rbox(66, 0.2, 59, 0.2, 1), tape, [cx, 2.1, 77], {cast: false});
    });
    // series straps between cells
    addIn(p, p.obj, box(70, 0.3, 4), mat(p, C.ni), [-35, 5.2, 44], {cast: false});
    // plastic frame
    add(p, rbox(214, 2.6, 2, 0.5, 1), tape, [0, 3.3, 107]);
    add(p, rbox(214, 2.6, 2, 0.5, 1), tape, [0, 3.3, 47.2]);
  }
  {
    const p = part('bms', 'bms', {home: [118, 3, 58], ex: [0, -26, 26], win: [0.45, 0.9]});
    add(p, rbox(20, 1.0, 40, 0.3, 1), mat(p, {color: '#1c4d36', rough: 0.5}), [0, 0, 0]);
    for (let i = 0; i < 3; i++) add(p, rbox(5, 0.9, 5, 0.25, 1), mat(p, C.epoxy), [-4, 0.9, -10 + i * 9]);
    add(p, rbox(7, 3, 10, 0.4, 1), mat(p, {color: '#eeeee8', rough: 0.5}), [4, 2, 12]);
  }

  // ============================================================ speakers
  const speaker = (id, x, z) => {
    const p = part(id, 'speaker', {home: [x, 2, z], ex: [0, -20, 10], win: [0.5, 0.95]});
    add(p, rbox(32, 7, 28, 0.8, 2), mat(p, {color: '#1b1d20', rough: 0.55}), [0, 3.5, 0]);
    add(p, cyl(10, 1.2, 28), mat(p, {color: '#2f3237', rough: 0.6}), [0, 7.2, 0]);
    add(p, cyl(4.2, 1.6, 20), mat(p, {color: '#3a3e44', rough: 0.4}), [0, 7.6, 0]);
    return p;
  };
  speaker('speaker1', -124, 92);
  speaker('speaker2', 124, 92);

  // ============================================================ cooling: fans, heat pipes, cold plate, fins
  const FAN = {r: 32, z: -68, x: 104};
  const fan = (id, sx) => {
    const x = sx * FAN.x;
    const p = part(id, 'fan', {home: [x, PCB_TOP - 1.2, FAN.z], ex: [sx * 10, 36, -2], win: [0.2, 0.7], pull: [sx * 24, 30, 0]});
    const hm = mat(p, {color: '#17191c', rough: 0.55, env: 0.4});
    const cm = mat(p, {color: '#6e737b', metal: 0.8, rough: 0.5, env: 0.5});
    // housing: floor with inlet, and a volute wall that opens to the rear
    const floor = rrect(64, 64, 14);
    floor.holes.push(circlePath(0, 0, 18));
    add(p, slab(floor, 0.6, 0), hm, [0, 0, 0]);
    const wall = new THREE.Shape();
    const pts = [];
    const pin = [];
    const N = 56;
    for (let i = 0; i <= N; i++) {
      const a = Math.PI * 1.62 + (i / N) * Math.PI * 1.76; // starts beside the rear outlet and winds round
      const rr = 25 + 5.5 * (i / N);
      pts.push([Math.cos(a) * (rr + 1.4), Math.sin(a) * (rr + 1.4)]);
      pin.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    wall.moveTo(...pts[0]);
    pts.forEach((q) => wall.lineTo(...q));
    pin.reverse().forEach((q) => wall.lineTo(...q));
    wall.closePath();
    add(p, slab(wall, 6, 0), hm, [0, 0.6, 0]);
    // outlet duct toward the rear
    for (const sx2 of [-1, 1]) add(p, rbox(1.2, 6, 6, 0.3, 1), hm, [sx2 * 12.2, 3.6, -31.5]);
    // top cover with the inlet
    const lC = layer(p, [0, 14, 0]);
    const cover = rrect(63, 63, 14);
    cover.holes.push(circlePath(0, 0, 21));
    addIn(p, lC, slab(cover, 0.5, 0), cm, [0, 6.6, 0]);
    // impeller: hub and curved blades, rotated by update()
    const lI = layer(p, [0, 6, 0]);
    const rot = new THREE.Group();
    rot.position.set(0, 0, 0);
    lI.add(rot);
    p.rotor = rot;
    const bm = mat(p, {color: '#2a2d32', rough: 0.45, env: 0.5});
    const hub = new THREE.Mesh(cyl(9, 5.4, 28), bm);
    hub.position.set(0, 3.3, 0);
    hub.castShadow = true;
    hub.userData.part = id;
    rot.add(hub);
    p.meshes.push(hub);
    meshesAll.push(hub);
    hit.push(hub);
    const cap = new THREE.Mesh(cyl(4, 0.6, 20), mat(p, C.ni));
    cap.position.set(0, 6.2, 0);
    rot.add(cap);
    p.meshes.push(cap);
    meshesAll.push(cap);
    const blades = new THREE.InstancedMesh(bladeGeo(), bm, 33);
    blades.castShadow = false;
    blades.userData.baseCast = false;
    blades.userData.part = id;
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 33; i++) {
      m4.makeRotationY((i / 33) * Math.PI * 2).setPosition(0, 1.3, 0);
      blades.setMatrixAt(i, m4);
    }
    blades.frustumCulled = false;
    rot.add(blades);
    p.meshes.push(blades);
    meshesAll.push(blades);
    hit.push(blades);
    // shroud ring on the impeller
    const ringg = new THREE.RingGeometry(10, 25.5, 48);
    ringg.rotateX(-Math.PI / 2);
    const rm = new THREE.Mesh(ringg, new THREE.MeshStandardMaterial({color: '#202327', roughness: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.55}));
    rm.position.set(0, 6.0, 0);
    rm.userData.part = id;
    rot.add(rm);
    p.meshes.push(rm);
    meshesAll.push(rm);
    p.mats.push(rm.material);
    rm.material.userData.base = {color: rm.material.color.clone(), emissive: rm.material.emissive.clone(), ei: 1, opacity: 0.55, transparent: true, depthWrite: true};
    return p;
  };
  fan('fan1', -1);
  fan('fan2', 1);

  const finStack = (id, sx) => {
    const x0 = sx < 0 ? -126 : 76;
    const p = part(id, 'heatsink', {home: [x0 + 25, PCB_TOP - 1.1, -104], ex: [sx * 16, 38, -4], win: [0.2, 0.7], pull: [sx * 20, 24, -4]});
    const fm = mat(p, C.fin);
    const NF = 38;
    const pitch = 50 / NF;
    const fins = add(p, box(0.25, 6.6, 8), fm, [0, 3.7, 0], {instances: NF, cast: true});
    const m4 = new THREE.Matrix4();
    const place = (k) => {
      for (let i = 0; i < NF; i++) {
        m4.makeTranslation((i - (NF - 1) / 2) * pitch * (1 + k * 1.4), 0, 0);
        fins.setMatrixAt(i, m4);
      }
      fins.instanceMatrix.needsUpdate = true;
    };
    place(0);
    fins.frustumCulled = false;
    p.openFns.push(place);
    add(p, box(52, 0.5, 8), mat(p, C.cu), [0, 0.45, 0]);
    return p;
  };
  finStack('fins1', -1);
  finStack('fins2', 1);

  // cold plate over both dies, heat pipes on top
  {
    const p = part('coldplate', 'coldplate', {home: [3, 5.55, -66], ex: [0, 34, 0], win: [0.25, 0.7]});
    const m = mat(p, {color: '#9aa0a8', metal: 1, rough: 0.5, env: 0.55});
    const shape = rrect(98, 34, 4);
    for (const [x, z] of [[-44, -14], [44, -14], [-44, 14], [44, 14]]) shape.holes.push(circlePath(x, z, 1.2));
    add(p, slab(shape, 0.8, 0.1), m, [0, -0.4, 0]);
    for (const [x, z] of [[-44, -14], [44, -14], [-44, 14], [44, 14]]) add(p, cyl(2.4, 0.8, 16), mat(p, C.ni), [x, 0.8, z]);
  }
  const HP = [
    {id: 'hp1', pts: [[-24, -72], [-40, -74], [-62, -76], [-70, -92], [-82, -104], [-100, -104], [-126, -104]]},
    {id: 'hp2', pts: [[32, -62], [50, -66], [62, -74], [72, -92], [84, -104], [104, -104], [126, -104]]},
    {id: 'hp3', pts: [[-20, -62], [-6, -78], [20, -91], [52, -98], [80, -104], [104, -104], [126, -104]]},
  ];
  for (const h of HP) {
    const p = part(h.id, 'heatpipe', {ex: [0, 40, 0], win: [0.2, 0.7], pull: [0, 20, -8]});
    const y = 7.0;
    const curve = new THREE.CatmullRomCurve3(h.pts.map(([x, z]) => new V3(x, y, z)), false, 'catmullrom', 0.3);
    const g = new THREE.TubeGeometry(curve, 90, 3, 12, false);
    g.scale(1, 0.4, 1);
    add(p, g, mat(p, {color: '#cf7a3d', metal: 1, rough: 0.34, env: 0.8}), [0, 0, 0]);
    h.curve = curve;
  }

  // ============================================================ ports (connectors on the board edge)
  {
    const p = part('port_usbc', 'port_usbc', {home: [-153.5, PCB_TOP, 0], ex: [-22, 14, 0], win: [0.35, 0.8], pull: [-40, 6, 0]});
    for (const z of [-14, 2]) {
      add(p, rbox(8, 2.8, 8.4, 0.9, 2), mat(p, {color: '#b3b8c0', metal: 1, rough: 0.3}), [0, 1.4, z]);
      add(p, rbox(3, 0.7, 6.5, 0.3, 1), mat(p, {color: '#0f1012', rough: 0.5}), [-1.6, 1.4, z]);
    }
  }
  {
    const p = part('port_hdmi', 'port_hdmi', {home: [-152.5, PCB_TOP, 18], ex: [-22, 14, 0], win: [0.35, 0.8], pull: [-40, 6, 0]});
    add(p, rbox(10, 5.6, 15, 0.5, 1), mat(p, {color: '#b3b8c0', metal: 1, rough: 0.3}), [0, 2.8, 0]);
    add(p, rbox(3, 1.4, 12, 0.3, 1), mat(p, {color: '#0f1012', rough: 0.5}), [-2, 2.8, 0]);
  }
  {
    const p = part('port_audio', 'port_audio', {home: [-152, PCB_TOP, 34], ex: [-22, 14, 0], win: [0.35, 0.8], pull: [-40, 6, 0]});
    add(p, rbox(9, 5.5, 7, 0.6, 1), mat(p, {color: '#17191c', rough: 0.5}), [0, 2.75, 0]);
    add(p, cyl(1.6, 6, 16), mat(p, {color: '#050506'}), [-3, 2.75, 0], {rot: [0, 0, Math.PI / 2]});
  }
  {
    const p = part('port_usba', 'port_usba', {home: [150, PCB_TOP, 0], ex: [22, 14, 0], win: [0.35, 0.8], pull: [40, 6, 0]});
    for (const z of [-10, 12]) {
      add(p, rbox(15, 6.2, 13.5, 0.5, 1), mat(p, {color: '#b3b8c0', metal: 1, rough: 0.3}), [0, 3.1, z]);
      add(p, rbox(10, 1.6, 11, 0.3, 1), mat(p, {color: '#2a6fd0', rough: 0.5}), [1.4, 3.1, z]);
    }
    add(p, rbox(9, 5.5, 7, 0.6, 1), mat(p, {color: '#17191c', rough: 0.5}), [1.5, 2.75, 34]);
  }

  // ============================================================ display (inside the lid): lid shell, panel stack, camera, antennas, hinges
  const lidW = P.W;
  const lidZ0 = 2;
  const lidMid = lidZ0 + P.lidD / 2;
  const panelZ = 18.5 + PANEL.h / 2; // active area centre, local z
  const screen = makeScreen();
  {
    const p = part('lid_a', 'lid', {parent: lidPivot, ex: [0, 40, 0], win: [0.1, 0.5], shell: true});
    const m = mat(p, C.alu);
    const outer = rrect(lidW, P.lidD, 9, 0, lidMid);
    add(p, slab(outer, 1.6, 0.25), m, [0, P.lidT - 1.6, 0]);
    const ring = rrect(lidW, P.lidD, 9, 0, lidMid);
    ring.holes.push(rrectPath(lidW - 3.2, P.lidD - 3.2, 7, 0, lidMid));
    add(p, slab(ring, P.lidT - 1.6, 0.15), m, [0, 0.4, 0]);
    // a plain badge disc so the back is not blank
    add(p, cyl(11, 0.25, 36), mat(p, {color: '#c7ccd3', metal: 1, rough: 0.28}), [0, P.lidT + 0.1, lidMid], {cast: false});
  }
  {
    const p = part('bezel', 'lid', {parent: lidPivot, ex: [0, -26, 0], win: [0.1, 0.5], shell: true});
    const m = mat(p, {color: '#101214', rough: 0.4, env: 0.5});
    const fr = rrect(lidW - 3.2, P.lidD - 3.2, 7, 0, lidMid);
    fr.holes.push(rrectPath(PANEL.w + 0.4, PANEL.h + 0.4, 1, 0, panelZ));
    add(p, slab(fr, 1.0, 0.15), m, [0, 0, 0]);
  }
  {
    const p = part('panel', 'panel', {parent: lidPivot, ex: [0, -6, 0], win: [0.1, 0.5]});
    // layers from the user inward (local y grows away from the user when the lid is closed)
    const lg = layer(p, [0, -16, 0]);
    const glass = mat(p, {color: '#050608', rough: 0.08, metal: 0.2, env: 1.0, emissive: '#ffffff', emissiveMap: screen.tex, ei: 0});
    p.screenMat = glass;
    // the visible picture: a plane facing -y at the cover glass
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(PANEL.w, PANEL.h), glass);
    scr.rotation.x = Math.PI / 2;
    scr.position.set(0, 0.55, panelZ);
    scr.userData.part = 'panel';
    lg.add(scr);
    p.meshes.push(scr);
    meshesAll.push(scr);
    hit.push(scr);
    const edge = mat(p, {color: '#0a0b0d', rough: 0.3, env: 0.7});
    addIn(p, lg, rbox(PANEL.w + 4, 0.6, PANEL.h + 4, 0.2, 1), edge, [0, 0.95, panelZ], {cast: false});
    const lc = layer(p, [0, -8, 0]);
    addIn(p, lc, rbox(PANEL.w + 3, 1.2, PANEL.h + 3, 0.2, 1), mat(p, {color: '#2f3b4a', rough: 0.2, metal: 0.3, env: 0.9, transparent: true, opacity: 0.88}), [0, 1.7, panelZ], {cast: false});
    const lp = layer(p, [0, 0, 0]);
    addIn(p, lp, rbox(PANEL.w + 2, 0.5, PANEL.h + 2, 0.15, 1), mat(p, {color: '#d9dde2', rough: 0.6, transparent: true, opacity: 0.8}), [0, 2.6, panelZ], {cast: false});
    const lgp = layer(p, [0, 8, 0]);
    addIn(p, lgp, rbox(PANEL.w + 2, 0.8, PANEL.h + 2, 0.15, 1), mat(p, {color: '#e9eef3', rough: 0.3, transparent: true, opacity: 0.7, env: 0.5}), [0, 3.3, panelZ], {cast: false});
    inst(p, mat(p, {color: '#fff6c8', emissive: '#ffe9a0', ei: 0.35, rough: 0.5}), Array.from({length: 40}, (_, i) => [-(PANEL.w / 2 - 6) + i * ((PANEL.w - 12) / 39), 3.3, panelZ - PANEL.h / 2 - 1.2, 2.6, 0.5, 1.2]), {parent: lgp});
    const lr = layer(p, [0, 16, 0]);
    addIn(p, lr, rbox(PANEL.w + 2, 0.5, PANEL.h + 2, 0.15, 1), mat(p, {color: '#9aa0a8', metal: 0.6, rough: 0.4}), [0, 4.1, panelZ], {cast: false});
    // timing controller flex at the bottom edge
    addIn(p, lc, rbox(40, 0.8, 8, 0.2, 1), mat(p, C.pcb), [60, 1.7, 14]);
  }
  {
    const p = part('webcam', 'webcam', {parent: lidPivot, ex: [0, -34, 0], win: [0.1, 0.5]});
    const z = 210.5;
    add(p, rbox(14, 2.2, 4, 0.4, 1), mat(p, {color: '#16181b', rough: 0.5}), [0, 1.3, z]);
    add(p, cyl(1.1, 0.6, 18), mat(p, {color: '#05060a', rough: 0.1, metal: 0.3}), [0, -0.02, z]);
    add(p, cyl(0.45, 0.5, 10), mat(p, {color: '#46d96b', emissive: '#46d96b', ei: 0.6}), [-4.5, -0.02, z], {cast: false});
    for (const sx of [-1, 1]) add(p, cyl(0.35, 0.4, 8), mat(p, {color: '#030304'}), [sx * 8.5, -0.02, z], {cast: false});
  }
  {
    const p = part('antenna', 'antenna', {parent: lidPivot, ex: [0, 28, 0], win: [0.1, 0.5]});
    const m = mat(p, {color: '#cfae3e', metal: 1, rough: 0.35, env: 0.7});
    add(p, box(52, 0.2, 3.2), m, [112, 4.6, 209], {cast: false});
    add(p, box(36, 0.2, 3.2), m, [34, 4.6, 209], {cast: false});
    for (const x of [86, 16]) add(p, rbox(4, 0.8, 4, 0.2, 1), mat(p, C.ni), [x, 4.4, 209], {cast: false});
  }

  // hinges: barrel on the pivot line, a fixed bracket in the base and an arm that follows the lid
  {
    const p = part('hinge', 'hinge', {home: [0, P.deckTop, P.hingeZ], ex: [0, 14, -14], win: [0.15, 0.5]});
    const m = mat(p, {color: '#6f747c', metal: 0.9, rough: 0.4, env: 0.6});
    p.arm = [];
    for (const sx of [-1, 1]) {
      const x = sx * 140;
      add(p, cyl(4.2, 26, 24), m, [x, 0, 0], {rot: [0, 0, Math.PI / 2]});
      add(p, rbox(26, 1.6, 12, 0.4, 1), m, [x, -8, 4]);
      const arm = new THREE.Group();
      arm.position.set(x, 0, 0);
      p.obj.add(arm);
      add(p, rbox(26, 1.6, 40, 0.4, 1), m, [0, 3, 20], {parent: arm});
      p.arm.push(arm);
    }
  }

  // ============================================================ cables
  const tube = (id, entry, pts, r, color, opt = {}) => {
    const p = part(id, entry, {parent: opt.parent || root, home: [0, 0, 0], ex: opt.ex || [0, 0, 0], win: opt.win || [0.3, 0.8]});
    const curve = new THREE.CatmullRomCurve3(pts.map((q) => new V3(...q)), false, 'catmullrom', 0.2);
    const g = new THREE.TubeGeometry(curve, Math.max(24, pts.length * 12), r, 8, false);
    if (opt.flat) g.scale(1, opt.flat, 1);
    add(p, g, mat(p, {color, rough: 0.55, env: 0.4, metal: opt.metal ?? 0}), [0, 0, 0], {cast: false});
    return p;
  };
  // display cable: board connector, along the right side, up the hinge into the lid
  tube('cable_edp', 'cable_edp', [[80, 4.8, -34], [80, 6, -30], [120, 6, -30], [147, 6, -36], [147, 6, -98], [148, 11, -106], [148, 15, -106]], 1.4, '#111418', {flat: 0.5, ex: [0, 40, 0], win: [0.25, 0.7]});
  tube('cable_edp_lid', 'cable_edp', [[148, 0, 0], [148, 3.4, 8], [130, 3.4, 12], [96, 3.4, 18]], 1.4, '#111418', {parent: lidPivot, flat: 0.5, ex: [0, 40, 0], win: [0.1, 0.5]});
  tube('cable_ant', 'cable_ant', [[72, 5.8, -8], [80, 5.8, -16], [150, 5.8, -20], [151, 6, -98], [151, 12, -106], [151, 15, -106]], 0.55, '#1d2024', {ex: [0, 36, 0], win: [0.25, 0.7]});
  tube('cable_ant_lid', 'cable_ant', [[151, 0, 0], [151, 4, 6], [151, 4.4, 200], [112, 4.4, 209]], 0.55, '#8a8f97', {parent: lidPivot, ex: [0, 36, 0], win: [0.1, 0.5]});
  tube('cable_kb', 'cable_kb', [[60, 10, 10.5], [60, 6, 14], [60, 4.4, 20]], 6, '#d6a24a', {flat: 0.08, ex: [0, 44, 0], win: [0.1, 0.5], metal: 0});
  tube('cable_tp', 'cable_tp', [[84, 12, 36], [84, 8, 38], [84, 4.4, 38]], 4, '#d6a24a', {flat: 0.08, ex: [0, 40, 0], win: [0.1, 0.5]});
  tube('cable_bat', 'cable_bat', [[118, 3.6, 70], [118, 3.6, 52], [118, 4.5, 44], [118, 4.5, 38]], 1.6, '#c0392b', {ex: [0, -24, 8], win: [0.45, 0.9]});

  // ------------------------------------------------------------------------------------------------ board texture
  function pcbTexture() {
    const S = 6.7;
    const c = document.createElement('canvas');
    c.width = 2048;
    c.height = Math.round(148 * S);
    const g = c.getContext('2d');
    const X = (x) => (x + 153) * S;
    const Z = (z) => (z + 106) * S;
    g.fillStyle = '#1b5a3b';
    g.fillRect(0, 0, c.width, c.height);
    const grd = g.createLinearGradient(0, 0, c.width, c.height);
    grd.addColorStop(0, 'rgba(255,255,255,.05)');
    grd.addColorStop(1, 'rgba(0,0,0,.12)');
    g.fillStyle = grd;
    g.fillRect(0, 0, c.width, c.height);
    // fine copper noise
    let s = 1337;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    g.strokeStyle = 'rgba(120,200,150,.10)';
    g.lineWidth = 1;
    for (let i = 0; i < 700; i++) {
      let x = r() * 306 - 153;
      let z = r() * 148 - 106;
      g.beginPath();
      g.moveTo(X(x), Z(z));
      for (let k = 0; k < 3; k++) {
        if (r() < 0.5) x += (r() - 0.5) * 30;
        else z += (r() - 0.5) * 30;
        g.lineTo(X(x), Z(z));
      }
      g.stroke();
    }
    // the real routes: bundles of parallel traces along each bus
    for (const b of Object.values(NET.buses)) {
      const n = b.n;
      const sp = 0.55;
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * sp;
        g.beginPath();
        b.pts.forEach(([x, z], k) => {
          const prev = b.pts[Math.max(0, k - 1)];
          const next = b.pts[Math.min(b.pts.length - 1, k + 1)];
          const dx = next[0] - prev[0];
          const dz = next[1] - prev[1];
          const len = Math.hypot(dx, dz) || 1;
          const px = x + (-dz / len) * off;
          const pz = z + (dx / len) * off;
          if (k === 0) g.moveTo(X(px), Z(pz));
          else g.lineTo(X(px), Z(pz));
        });
        g.strokeStyle = 'rgba(214,184,96,.55)';
        g.lineWidth = 0.28 * S;
        g.lineJoin = 'round';
        g.stroke();
      }
    }
    for (const b of Object.values(NET.power)) {
      g.beginPath();
      b.pts.forEach(([x, z], k) => (k ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
      g.strokeStyle = 'rgba(224,170,80,.55)';
      g.lineWidth = 1.8 * S;
      g.lineJoin = 'round';
      g.stroke();
    }
    // vias
    g.fillStyle = 'rgba(214,190,120,.8)';
    for (let i = 0; i < 520; i++) {
      const x = r() * 300 - 150;
      const z = r() * 144 - 104;
      g.beginPath();
      g.arc(X(x), Z(z), 0.42 * S, 0, 7);
      g.fill();
    }
    // silkscreen outlines for the main parts
    g.strokeStyle = 'rgba(235,240,235,.75)';
    g.lineWidth = 0.22 * S;
    const outline = (cx, cz, w, d, label) => {
      g.strokeRect(X(cx - w / 2), Z(cz - d / 2), w * S, d * S);
      if (label) {
        g.fillStyle = 'rgba(235,240,235,.75)';
        g.font = `${2.6 * S}px "JetBrains Mono", monospace`;
        g.textAlign = 'center';
        g.fillText(label, X(cx), Z(cz + d / 2 + 3.6));
      }
    };
    outline(-24, -66, 38, 28, 'U1');
    outline(32, -66, 35, 35, 'U2');
    outline(-89, -7, 72, 31, 'DIMM1');
    outline(-89, 25, 72, 31, 'DIMM2');
    outline(-6, 27, 82, 24, 'M.2 SSD');
    outline(59, -3, 32, 24, 'M.2 WLAN');
    g.fillStyle = 'rgba(235,240,235,.6)';
    g.font = `${3 * S}px "JetBrains Mono", monospace`;
    g.textAlign = 'left';
    g.fillText('REFERENCE BOARD · ILLUSTRATIVE LAYOUT', X(-146), Z(38));
    // sockets pads
    g.fillStyle = 'rgba(214,190,120,.9)';
    for (const [x, z, w, d] of [[-46, 27, 4, 20], [44, -3, 4, 16], [-89, -22, 66, 2.4], [-89, 40, 66, 2.4]]) g.fillRect(X(x - w / 2), Z(z - d / 2), w * S, d * S);
    // mounting holes
    for (const [x, z] of [[-148, 38], [148, 38], [-60, -100], [60, -100], [0, 18], [150, -32], [-150, -32]]) {
      g.fillStyle = '#d6b87a';
      g.beginPath();
      g.arc(X(x), Z(z), 3.2 * S, 0, 7);
      g.fill();
      g.fillStyle = '#10151a';
      g.beginPath();
      g.arc(X(x), Z(z), 1.8 * S, 0, 7);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  // ------------------------------------------------------------------------------------------------ screen texture
  function makeScreen() {
    const c = document.createElement('canvas');
    c.width = 960;
    c.height = 600;
    const g = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    let last = '';
    const draw = (state) => {
      const key = JSON.stringify(state);
      if (key === last) return false;
      last = key;
      const W = c.width;
      const H = c.height;
      g.clearRect(0, 0, W, H);
      if (state.kind === 'boot') {
        g.fillStyle = '#05070a';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#9fb0c4';
        g.font = '600 22px "JetBrains Mono", monospace';
        g.textAlign = 'left';
        (state.lines || []).slice(-17).forEach((l, i) => g.fillText(l, 28, 44 + i * 30));
        if (state.logo) {
          g.fillStyle = 'rgba(5,7,10,.88)';
          g.fillRect(0, 0, W, H);
          g.strokeStyle = '#cfd6e0';
          g.lineWidth = 5;
          g.beginPath();
          g.arc(W / 2, H / 2 - 20, 38, 0, 7);
          g.stroke();
          g.fillStyle = '#cfd6e0';
          g.font = '600 20px Inter, sans-serif';
          g.textAlign = 'center';
          g.fillText('REFERENCE LAPTOP', W / 2, H / 2 + 60);
        }
      } else if (state.kind === 'desktop') {
        const gr = g.createLinearGradient(0, 0, W, H);
        gr.addColorStop(0, '#1d4f8f');
        gr.addColorStop(1, '#6b3fa0');
        g.fillStyle = gr;
        g.fillRect(0, 0, W, H);
        g.fillStyle = 'rgba(255,255,255,.12)';
        g.beginPath();
        g.arc(W * 0.72, H * 0.4, 190, 0, 7);
        g.fill();
        g.fillStyle = 'rgba(18,22,30,.92)';
        g.fillRect(0, H - 44, W, 44);
        g.fillStyle = 'rgba(255,255,255,.85)';
        for (let i = 0; i < 5; i++) g.fillRect(W / 2 - 100 + i * 42, H - 34, 28, 24);
        g.fillStyle = 'rgba(245,247,250,.95)';
        g.fillRect(150, 110, 470, 300);
        g.fillStyle = '#e1e5ea';
        g.fillRect(150, 110, 470, 34);
        g.fillStyle = '#6b7380';
        g.font = '600 18px Inter, sans-serif';
        g.textAlign = 'left';
        g.fillText('Simulator', 168, 134);
        g.fillStyle = '#2a3340';
        g.font = '500 20px Inter, sans-serif';
        g.fillText('A desktop drawn by the model.', 172, 190);
        g.fillStyle = '#5a6472';
        g.font = '400 17px Inter, sans-serif';
        g.fillText('Illustrative picture, not a real OS.', 172, 224);
      } else {
        g.fillStyle = '#04050a';
        g.fillRect(0, 0, W, H);
      }
      tex.needsUpdate = true;
      return true;
    };
    return {tex, draw};
  }

  // ------------------------------------------------------------------------------------------------ small geometry builders
  function circlePath(x, z, r) {
    const p = new THREE.Path();
    p.absarc(x, z, r, 0, Math.PI * 2, true);
    return p;
  }
  function bladeGeo() {
    return geo('blade', () => {
      // one backward-curved blade: a thin arc from r = 12 to r = 26.5, 5.2 mm tall
      const sh = new THREE.Shape();
      const a = [];
      const b = [];
      for (let i = 0; i <= 8; i++) {
        const u = i / 8;
        const rr = 11 + u * 14;
        const th = -u * u * 0.55 - u * 0.15;
        a.push([Math.cos(th) * rr, Math.sin(th) * rr]);
        b.push([Math.cos(th) * (rr + 0.0) - Math.sin(th) * 0.4, Math.sin(th) * rr + Math.cos(th) * 0.4]);
      }
      sh.moveTo(...a[0]);
      a.forEach((q) => sh.lineTo(...q));
      b.reverse().forEach((q) => sh.lineTo(...q));
      sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, {depth: 5.2, bevelEnabled: false});
      // shape plane is XY with depth on z: lay it so depth is y and the plane is xz
      g.rotateX(-Math.PI / 2);
      return g;
    });
  }

  // ------------------------------------------------------------------------------------------------ pose
  const pos = new V3();
  /** pose(state): explode k in [0,1], lid angle in degrees, fan angles, per-part glow handled by the stage. */
  const pose = ({explode = 0, lid = 105, fanAngle = [0, 0]} = {}) => {
    lidPivot.rotation.x = -lid * D2R;
    parts.hinge.arm.forEach((a) => (a.rotation.x = -lid * D2R));
    for (const p of Object.values(parts)) {
      const u = sstep(p.win[0], p.win[1], explode);
      pos.copy(p.home).addScaledVector(p.ex, u).addScaledVector(p.pull, p.pullK);
      p.obj.position.copy(pos);
      const ok = p.openK;
      if (ok !== p._ok) {
        p.openFns.forEach((f) => f(ok));
        p._ok = ok;
      }
    }
    if (parts.fan1.rotor) {
      parts.fan1.rotor.rotation.y = fanAngle[0];
      parts.fan2.rotor.rotation.y = -fanAngle[1];
    }
  };

  // chip markings and other basic-material decals: give them to their part so they fade, hide and cast with it
  for (const p of Object.values(parts)) {
    p.obj.traverse((o) => {
      if (!o.isMesh || Array.isArray(o.material) || !o.material.isMeshBasicMaterial || p.mats.includes(o.material)) return;
      o.userData.part = p.id;
      o.userData.nopick = true;
      o.castShadow = false;
      o.material.userData.base = {color: o.material.color.clone(), emissive: new THREE.Color(), ei: 1, opacity: o.material.opacity, transparent: true, depthWrite: true};
      p.mats.push(o.material);
      p.meshes.push(o);
    });
  }

  // ------------------------------------------------------------------------------------------------ the heat of a part
  const entryParts = {};
  for (const p of Object.values(parts)) (entryParts[p.entry] ||= []).push(p.id);

  const center = (id, out = new V3()) => {
    root.updateMatrixWorld(true);
    const b = new THREE.Box3();
    const pp = parts[id];
    pp.meshes.forEach((m) => b.expandByObject(m));
    if (b.isEmpty()) return out.set(0, 0, 0);
    return b.getCenter(out);
  };
  const sizeOf = (id) => {
    root.updateMatrixWorld(true);
    const b = new THREE.Box3();
    parts[id].meshes.forEach((m) => b.expandByObject(m));
    return b.getSize(new V3());
  };

  // ------------------------------------------------------------------------------------------------ flow paths in world (root) coordinates
  const mk = (arr, y) => arr.map(([x, z]) => new V3(x, y, z));
  const pcbY = PCB_TOP + 0.35;
  const PATH = {};
  for (const [k, b] of Object.entries(NET.buses)) PATH[`bus_${k}`] = {pts: mk(b.pts, pcbY), c: b.c};
  for (const [k, b] of Object.entries(NET.power)) PATH[`pwr_${k}`] = {pts: mk(b.pts, pcbY), c: b.c, v: b.v};
  const hpPts = (h, n = 40) => h.curve.getPoints(n);
  HP.forEach((h, i) => (PATH[`hp${i + 1}`] = {pts: hpPts(h), c: '#ff5a2a'}));
  // battery to the board: the cable, then the board connector
  PATH.cell = {pts: [new V3(-70, 8, 78), new V3(0, 8, 78), new V3(70, 8, 78), new V3(104, 5.8, 70), new V3(118, 4.8, 60)], c: '#ff7a18'};
  PATH.cable_bat = {pts: [new V3(118, 4.6, 60), new V3(118, 4.6, 40), new V3(118, pcbY, 38)], c: '#ff7a18'};
  // airflow: in through the bottom vents, up the axis, out through the fins and the rear slots
  const air = (sx) => {
    const x = sx * 104;
    const fx = sx * 101;
    return [
      {pts: [new V3(x - 8, -14, -68), new V3(x - 8, 0, -68), new V3(x - 4, 6, -66), new V3(x, 8, -66)], c: '#3b9bff', tag: 'in'},
      {pts: [new V3(x, 7, -66), new V3(x + 12, 6, -62), new V3(x + 18, 6, -74), new V3(fx + 4, 6, -92), new V3(fx, 6, -104), new V3(fx, 6, -132)], c: '#3b9bff', tag: 'out'},
      {pts: [new V3(x, 7, -66), new V3(x - 12, 6, -62), new V3(x - 18, 6, -74), new V3(fx - 4, 6, -92), new V3(fx - 10, 6, -104), new V3(fx - 10, 6, -132)], c: '#3b9bff', tag: 'out'},
      {pts: [new V3(x + 6, 7, -66), new V3(x + 22, 6, -70), new V3(fx + 14, 6, -94), new V3(fx + 12, 6, -104), new V3(fx + 12, 6, -132)], c: '#3b9bff', tag: 'out'},
    ];
  };
  PATH.air1 = air(-1);
  PATH.air2 = air(1);

  return {root, lidPivot, parts, meshes: meshesAll, hit, pose, center, sizeOf, entryParts, screen, PATH, HP, FAN, KB, mat, geo};
}
