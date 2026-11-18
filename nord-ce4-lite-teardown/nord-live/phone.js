// The reference phone, built from code in millimetres (1 scene unit = 100 mm). The internals follow iFixit's OnePlus Nord
// (2020) teardown: the traced board outline and chip positions (board.js), the layer order, the three long flex cables,
// the copper strip between battery and display, the bottom board with the USB-C port, the SIM tray and the vibration motor.
// Sizes that the photos do not give are APPROX and labelled so in data.js. Lying display-up: x across, z along (top of the
// phone at -z), y up toward the display. Same part machinery as the laptop: home, explode vector, window of the slider.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {BOARD, SHIELDS} from './board.js';

const V3 = THREE.Vector3;
const sstep = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
export const PH = {W: 73.3, L: 158.3, T: 8.2}; // DOC: OnePlus Nord (2020) 158.3 x 73.3 x 8.2 mm
const BX = -PH.W / 2 + 3.5; // board top-left corner
const BZ = -PH.L / 2 + 4.2;
const Y = {back: 0.8, board: 2.8, mid: 5.6, disp: 6.5};

const geoCache = new Map();
const geo = (k, f) => (geoCache.has(k) ? geoCache.get(k) : (geoCache.set(k, f()), geoCache.get(k)));
const rbox = (w, h, d, r = 0.3, s = 2) => geo(`rb${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, s, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01)));
const box = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (r, h, n = 24) => geo(`c${r},${h},${n}`, () => new THREE.CylinderGeometry(r, r, h, n));
function rrect(w, d, r, cx = 0, cz = 0) {
  const s = new THREE.Shape();
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  s.moveTo(x0 + r, z0); s.lineTo(x1 - r, z0); s.absarc(x1 - r, z0 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x1, z1 - r); s.absarc(x1 - r, z1 - r, r, 0, Math.PI / 2, false);
  s.lineTo(x0 + r, z1); s.absarc(x0 + r, z1 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, z0 + r); s.absarc(x0 + r, z0 + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}
const rrectPath = (w, d, r, cx = 0, cz = 0) => {
  const p = new THREE.Path(rrect(w, d, r, cx, cz).getPoints(8));
  p.closePath();
  return p;
};
/** Plate from a Shape in (x, z): spans y in [0, t]. */
function slab(shape, t, bevel = 0) {
  const g = new THREE.ExtrudeGeometry(shape, {depth: t - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 8});
  g.rotateX(Math.PI / 2);
  g.translate(0, t - bevel, 0);
  return g;
}
const texCache = new Map();
function labelTex(text, {w = 192, h = 96, fg = '#cfd5dd', size = 20, sub = null} = {}) {
  const key = `${text}|${sub}`;
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = fg; g.font = `600 ${size}px "JetBrains Mono", monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, sub ? h * 0.36 : h / 2);
  if (sub) { g.font = `500 ${size * 0.62}px "JetBrains Mono", monospace`; g.fillText(sub, w / 2, h * 0.7); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

export function buildPhone() {
  const root = new THREE.Group();
  root.scale.setScalar(0.01);
  const parts = {};
  const meshesAll = [];
  const hit = [];
  const part = (id, entry, {home = [0, 0, 0], ex = [0, 0, 0], win = [0, 1], pull = [0, 0, 0]} = {}) => {
    const obj = new THREE.Group();
    obj.position.set(...home);
    root.add(obj);
    parts[id] = {id, entry, obj, home: new V3(...home), ex: new V3(...ex), win, pull: new V3(...pull), pullK: 0, mats: [], meshes: [], ghost: 0, glow: 0, heat: 0, hidden: false};
    return parts[id];
  };
  const mat = (p, o = {}) => {
    const m = new THREE.MeshStandardMaterial({color: o.color ?? '#888', metalness: o.metal ?? 0, roughness: o.rough ?? 0.6, envMapIntensity: o.env ?? 0.7, emissive: o.emissive ?? '#000', emissiveIntensity: o.ei ?? 1, side: o.side ?? THREE.FrontSide, transparent: true, opacity: o.opacity ?? 1, map: o.map ?? null, emissiveMap: o.emissiveMap ?? null});
    m.userData.base = {color: m.color.clone(), emissive: m.emissive.clone(), ei: m.emissiveIntensity, opacity: m.opacity, transparent: !!o.transparent, depthWrite: true};
    p.mats.push(m);
    return m;
  };
  const add = (p, g, m, [x, y, z] = [0, 0, 0], o = {}) => {
    const me = o.instances ? new THREE.InstancedMesh(g, m, o.instances) : new THREE.Mesh(g, m);
    me.position.set(x, y, z);
    if (o.rot) me.rotation.set(...o.rot);
    let cast = o.cast;
    if (cast === undefined) { g.computeBoundingBox(); const s = g.boundingBox.getSize(new V3()); cast = Math.max(s.x, s.y, s.z) >= 12; }
    me.castShadow = cast; me.userData.baseCast = cast; me.receiveShadow = true;
    me.userData.part = p.id;
    (o.parent || p.obj).add(me);
    p.meshes.push(me); meshesAll.push(me);
    if (!o.nopick) hit.push(me);
    return me;
  };
  const label = (p, text, x, y, z, w, h, sub = null) => {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({map: labelTex(text, {sub}), transparent: true, toneMapped: false}));
    l.rotation.x = -Math.PI / 2; l.position.set(x, y, z);
    l.userData.part = p.id; l.userData.nopick = true;
    l.material.userData.base = {color: l.material.color.clone(), emissive: new THREE.Color(), ei: 1, opacity: 1, transparent: true, depthWrite: true};
    p.mats.push(l.material); p.obj.add(l); p.meshes.push(l); meshesAll.push(l);
  };
  const C = {
    frame: {color: '#3d4148', rough: 0.55}, alu: {color: '#9aa0a8', metal: 0.85, rough: 0.5, env: 0.6},
    blk: {color: '#16181b', rough: 0.5}, pcb: {color: '#4a4538', rough: 0.55, env: 0.4}, cu: {color: '#b4693a', metal: 1, rough: 0.45, env: 0.6},
    ni: {color: '#b8bdc5', metal: 1, rough: 0.3, env: 0.8}, gold: {color: '#d6b13c', metal: 1, rough: 0.3, env: 0.8}, epoxy: {color: '#121316', rough: 0.5},
    flex: {color: '#16120c', rough: 0.55}, si: {color: '#2a2e35', metal: 0.4, rough: 0.35},
  };
  const body = (w = PH.W, d = PH.L, r = 9) => rrect(w, d, r);

  // ---------------------------------------------------------------- back cover
  {
    const p = part('backcover', 'backcover', {ex: [0, -64, 0], win: [0.55, 1]});
    const g = body(PH.W - 2.4, PH.L - 2.4, 8);
    // four camera openings, a straight line along the left edge seen from the back = the right side seen from the front
    const cam = [[0, -66, 6.5], [0, -56, 12], [0, -45.5, 8], [0, -37, 8]];
    for (const [, z, d] of cam) g.holes.push(rrectPath(d, d, 2, 24, z));
    add(p, slab(g, Y.back, 0.2), mat(p, {color: '#59606a', metal: 0.5, rough: 0.28, env: 0.9}), [0, 0, 0]);
    // the lens ring around the camera openings
    for (const [, z, d] of cam) add(p, rbox(d + 2, 0.6, d + 2, 1.2, 1), mat(p, C.alu), [24, Y.back + 0.3, z], {cast: false, nopick: false});
    label(p, 'OnePlus', 0, 0.05, 42, 18, 6);
  }
  // ---------------------------------------------------------------- frame: plastic bezel ring and metal plate
  {
    const p = part('frame', 'frame', {ex: [0, 22, 0], win: [0.2, 0.55]});
    const ring = body(PH.W, PH.L, 9);
    ring.holes.push(rrectPath(PH.W - 3.2, PH.L - 3.2, 7.4));
    add(p, slab(ring, PH.T - 0.2, 0.2), mat(p, {color: '#5a6573', metal: 0.7, rough: 0.35, env: 0.8}), [0, 0, 0]);
    const plate = body(PH.W - 3.4, PH.L - 3.4, 7.2);
    add(p, slab(plate, 0.8, 0.1), mat(p, C.alu), [0, Y.mid, 0]);
    // a rectangular window where the display's fingerprint sensor sits (documented as "somewhat oddly tilted")
    add(p, rbox(14, 0.4, 20, 0.8, 1), mat(p, {color: '#26282c', rough: 0.4}), [0, Y.mid + 0.8, 44], {rot: [0, 0.14, 0], cast: false});
  }
  // ---------------------------------------------------------------- copper strip and graphite foil on the frame (documented)
  {
    const p = part('copper', 'thermal', {ex: [0, 12, 0], win: [0.2, 0.55]});
    add(p, rbox(15, 0.5, 66, 0.4, 1), mat(p, C.cu), [8, Y.mid + 0.9, -4]);
    add(p, rbox(15, 0.35, 24, 0.4, 1), mat(p, {color: '#e0b030', rough: 0.5}), [8, Y.mid + 0.9, 38], {cast: false}); // yellow polyimide tape
    add(p, rbox(26, 0.3, 30, 0.6, 1), mat(p, {color: '#6a6f77', metal: 0.4, rough: 0.7}), [-3, Y.mid + 0.9, -45], {cast: false}); // graphite foil behind the board
  }
  // ---------------------------------------------------------------- display and what is under it
  {
    const p = part('display', 'display', {ex: [0, 42, 0], win: [0, 0.35]});
    const c = document.createElement('canvas');
    c.width = 360; c.height = 780;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 360, 780);
    gr.addColorStop(0, '#1a3a6a'); gr.addColorStop(1, '#5a3a8a');
    g.fillStyle = gr; g.fillRect(0, 0, 360, 780);
    g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '600 78px Inter, sans-serif'; g.textAlign = 'center'; g.fillText('9:31', 180, 190);
    g.font = '500 22px Inter, sans-serif'; g.fillText('Illustrative lock screen', 180, 236);
    g.fillStyle = '#000'; g.beginPath(); g.arc(46, 40, 11, 0, 7); g.arc(84, 40, 11, 0, 7); g.fill();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const gl = mat(p, {color: '#050608', rough: 0.1, metal: 0.2, env: 1, emissive: '#ffffff', emissiveMap: tex, ei: 0.9});
    p.screenMat = gl;
    const dw = PH.W - 3, dl = PH.L - 3;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(dw - 1.6, dl - 1.6), gl);
    scr.rotation.x = -Math.PI / 2; scr.position.set(0, PH.T - 0.05, 0);
    scr.userData.part = 'display'; p.obj.add(scr); p.meshes.push(scr); meshesAll.push(scr); hit.push(scr);
    add(p, slab(body(dw, dl, 8), 1.55, 0.2), mat(p, {color: '#0b0c0e', rough: 0.3, metal: 0.2, env: 0.8}), [0, Y.disp, 0]);
    // the panel's flex tail and driver, folded to the back at the bottom (documented: a flex to the bottom board)
    add(p, rbox(30, 0.4, 16, 0.2, 1), mat(p, C.flex), [4, Y.disp - 0.3, 66], {cast: false});
  }
  // front cameras and earpiece: two hole-punch selfie cameras, 32 MP + 8 MP (documented); positions top-left (3RD, product photos)
  {
    const p = part('frontcams', 'frontcam', {ex: [0, 30, 0], win: [0.15, 0.5]});
    for (const x of [-26.5, -21.5]) {
      add(p, rbox(5, 2.2, 5, 1, 1), mat(p, C.blk), [x, Y.mid - 1.4, -73.6]);
      add(p, cyl(1.2, 0.5, 18), mat(p, {color: '#05060a', rough: 0.1, metal: 0.3}), [x, Y.mid - 0.2, -73.6], {cast: false});
    }
    add(p, rbox(22, 0.5, 5, 0.3, 1), mat(p, C.flex), [-18, Y.mid - 0.8, -69], {cast: false});
  }
  {
    const p = part('earpiece', 'earpiece', {ex: [0, 26, 0], win: [0.15, 0.5]});
    add(p, rbox(14, 2.2, 3.4, 0.8, 1), mat(p, {color: '#1d2024', rough: 0.5}), [0, Y.mid - 1.4, -76.4]);
  }
  {
    const p = part('fp', 'fp', {ex: [0, 28, 0], win: [0.15, 0.5]});
    add(p, rbox(12, 0.7, 12, 1, 1), mat(p, {color: '#2f343b', metal: 0.4, rough: 0.3}), [0, Y.mid - 0.7, 44], {rot: [0, 0.14, 0]});
    add(p, rbox(3, 0.25, 24, 0.1, 1), mat(p, {color: '#c9962c', rough: 0.5}), [2, Y.mid - 0.9, 58], {cast: false}); // breakout flex toward the bottom board
  }

  // ---------------------------------------------------------------- the motherboard (traced) and its chips
  const bx = (x) => BX + x;
  const bz = (z) => BZ + z;
  {
    const p = part('board', 'board', {ex: [0, -2, 0], win: [0.35, 0.8]});
    const sh = new THREE.Shape(BOARD.outer.map(([x, y]) => new THREE.Vector2(bx(x), bz(y))));
    for (const h of BOARD.holes) sh.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(bx(x), bz(y)))));
    add(p, slab(sh, 0.8, 0), mat(p, C.pcb), [0, Y.board, 0]);
    // the two screws (documented: two Phillips) and a smear of thermal paste on the SoC side (documented)
    for (const [x, y] of [[33, 6.5], [22, 46]]) add(p, cyl(1.3, 0.5, 14), mat(p, C.ni), [bx(x), Y.board + 1.05, bz(y)], {cast: false});
  }
  const chip = (id, entry, side, box, h, name, sub, ex) => {
    const [x0, z0, x1, z1] = box;
    const p = part(id, entry, {ex: [0, side > 0 ? ex : -ex, 0], win: [0.3, 0.75]});
    const w = x1 - x0, d = z1 - z0;
    const y = side > 0 ? Y.board + 0.8 + h / 2 : Y.board - h / 2;
    add(p, rbox(w, h, d, 0.25, 1), mat(p, id === 'soc' ? {color: '#1b1d21', rough: 0.35, metal: 0.3} : C.epoxy), [bx(x0 + w / 2), y, bz(z0 + d / 2)]);
    if (w > 5) label(p, name, bx(x0 + w / 2), side > 0 ? y + h / 2 + 0.03 : y - h / 2 - 0.03, bz(z0 + d / 2), Math.min(w - 0.6, 9), Math.min(d - 0.6, 4.5), sub);
    if (side < 0) p.meshes.at(-1).rotation.x = Math.PI / 2;
    return p;
  };
  const A = BOARD.chipsA;
  const B = BOARD.chipsB;
  chip('soc', 'soc', 1, A.soc, 0.9, 'SM7250', 'Snapdragon 765G', 9);
  chip('mcp', 'memory', 1, A.mcp, 1.0, 'KM8V8001JM', 'UFS 2.1 + LPDDR4X', 9);
  chip('rf865', 'rf', 1, A.rf865, 0.8, 'RF?', 'iFixit: "865"', 11);
  chip('codec', 'audio', 1, A.codec, 0.7, 'WCD9385', null, 12);
  chip('fem2', 'rf', 1, A.fem2, 0.7, 'SKY53735', null, 12);
  chip('wifi', 'wifi', 1, A.wifi, 0.6, 'WCN3998', null, 12);
  chip('fem1', 'rf', -1, B.fem1, 0.8, 'SKY58094', null, 9);
  chip('pm7250', 'pmic', -1, B.pm7250, 0.7, 'PM7250', null, 11);
  chip('pm7150a', 'pmic', -1, B.pm7150a, 0.7, 'PM7150A', null, 12);
  chip('pm7250b', 'pmic', -1, B.pm7250b, 0.7, 'PM7250B', null, 13);
  chip('qet', 'rf', -1, B.qet, 0.5, 'QET5100', null, 10);

  // ---------------------------------------------------------------- battery BLP785 (documented 4,115 mAh, 3.87 V, 15.92 Wh)
  {
    const p = part('battery', 'battery', {ex: [0, -14, 0], win: [0.4, 0.9], pull: [0, -6, 30]});
    add(p, rbox(46, 4.9, 90, 1.2, 2), mat(p, {color: '#a9b0ba', metal: 0.7, rough: 0.4, env: 0.6}), [-4, 3.5, 20]);
    add(p, rbox(20, 0.1, 3, 0.05, 1), mat(p, {color: '#d63a30', rough: 0.5}), [4, 6.0, 62], {cast: false}); // the red pull tab
    label(p, 'BLP785', -4, 6.0, 8, 22, 8, '4115 mAh 3.87 V');
    add(p, rbox(6, 0.5, 5, 0.2, 1), mat(p, C.gold), [-4, 2.6, -26], {cast: false}); // connector end
  }
  // ---------------------------------------------------------------- cover over the board with the NFC antenna (documented: 11 screws)
  {
    const p = part('mbcover', 'mbcover', {ex: [0, -34, 0], win: [0.5, 0.85]});
    const sh = new THREE.Shape(BOARD.outer.map(([x, y]) => new THREE.Vector2(bx(x), bz(y))));
    add(p, slab(sh, 0.7, 0), mat(p, {color: '#202226', rough: 0.6}), [0, 1.3, 0]);
    add(p, rbox(14, 0.2, 14, 0.4, 1), mat(p, C.cu), [bx(10), 2.1, bz(10)], {cast: false}); // NFC antenna coil
    const sc = [[4, 4], [20, 3], [33, 4], [48, 4], [62, 5], [5, 26], [6, 44], [30, 46], [48, 44], [60, 28], [58, 14]];
    sc.forEach(([x, y]) => add(p, cyl(1.1, 0.5, 12), mat(p, C.ni), [bx(x), 2.2, bz(y)], {cast: false}));
  }
  // ---------------------------------------------------------------- rear cameras (documented: 48 + 8 + 5 + 2 MP), as a group
  {
    const p = part('rearcams', 'camera', {ex: [0, -26, 0], win: [0.5, 0.9]});
    const mods = [[-66, 6.5, '8MP', 'ultra-wide'], [-56, 11.5, '48MP', 'Sony IMX586'], [-45.5, 7.5, '5MP', 'depth'], [-37, 7.5, '2MP', 'macro']];
    for (const [z, d, a, b] of mods) {
      add(p, rbox(d, 3.9, d, 1, 1), mat(p, {color: '#2d3136', rough: 0.45, metal: 0.3}), [24, 2.9, z]);
      add(p, cyl(d * 0.32, 0.6, 20), mat(p, {color: '#05060a', rough: 0.08, metal: 0.4}), [24, 0.9, z], {cast: false});
    }
    add(p, rbox(4, 0.3, 40, 0.1, 1), mat(p, C.flex), [31, 2.6, -52], {cast: false});
  }

  // ---------------------------------------------------------------- the bottom end: daughterboard, USB-C, SIM tray, speaker, vibration motor
  {
    const p = part('bottomboard', 'bottomboard', {ex: [0, -10, 4], win: [0.4, 0.85]});
    add(p, rbox(52, 0.8, 11, 0.4, 1), mat(p, C.pcb), [-2, Y.board, 71.5]);
    add(p, rbox(8, 0.8, 22, 0.4, 1), mat(p, C.pcb), [20, Y.board, 63]);
    add(p, rbox(5, 0.9, 5, 0.2, 1), mat(p, C.epoxy), [-12, Y.board + 0.8, 71]);
    label(p, 'bottom board', -2, Y.board + 0.43, 73, 22, 5);
  }
  {
    const p = part('usbc', 'usbc', {ex: [0, -14, 8], win: [0.4, 0.85], pull: [0, -4, 16]});
    add(p, rbox(9.2, 3.4, 7, 1, 1), mat(p, {color: '#b3b8c0', metal: 1, rough: 0.3}), [3, 3.0, 75.4]);
    add(p, rbox(6.5, 0.8, 5.5, 0.3, 1), mat(p, {color: '#0f1012', rough: 0.5}), [3, 3.0, 74.8], {cast: false});
  }
  {
    const p = part('sim', 'sim', {ex: [0, -12, 6], win: [0.4, 0.85], pull: [0, -2, 14]});
    add(p, rbox(15, 1.4, 20, 0.4, 1), mat(p, {color: '#6e757f', metal: 0.8, rough: 0.4}), [-27, 3.5, 66]);
    add(p, rbox(15.6, 1.2, 1.2, 0.3, 1), mat(p, {color: '#d63a30', rough: 0.5}), [-27, 3.5, 76.3], {cast: false}); // the red SIM-tray tab
  }
  {
    const p = part('speaker', 'speaker', {ex: [0, -14, 0], win: [0.4, 0.85]});
    add(p, rbox(26, 3.6, 8, 0.8, 1), mat(p, {color: '#1b1d20', rough: 0.5}), [-18, 3.0, 71]);
    add(p, cyl(2.8, 0.4, 20), mat(p, {color: '#33373d', rough: 0.5}), [-18, 4.9, 71], {cast: false});
  }
  {
    const p = part('vib', 'vib', {ex: [0, -16, -3], win: [0.4, 0.85]});
    add(p, cyl(5.2, 3.2, 28), mat(p, {color: '#6a7078', metal: 0.8, rough: 0.35}), [20, 3.4, 56]);
  }
  // ---------------------------------------------------------------- three long flex cables, bottom board to main board (documented)
  {
    const p = part('flex', 'flex', {ex: [0, -9, 0], win: [0.35, 0.8]});
    [[29, 'a'], [32, 'b'], [35, 'c']].forEach(([x], i) => {
      const curve = new THREE.CatmullRomCurve3([new V3(x, 3.0, 62), new V3(x, 3.0, 40), new V3(x - 0.5, 3.0, 10), new V3(x, 3.0, -20), new V3(x - 2 + i, 3.0, -30)]);
      const g = new THREE.TubeGeometry(curve, 40, 1.2, 6, false);
      g.scale(1, 0.12, 1);
      add(p, g, mat(p, C.flex), [0, 0, 0], {cast: false});
    });
  }


  // ---------------------------------------------------------------- shield cans (traced from the photos: APPROX)
  {
    const p = part('shield', 'shield', {ex: [0, 7, 0], win: [0.3, 0.75]});
    const plate = (loops, y, up) => {
      const [outer, ...holes] = loops;
      const sh = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(bx(x), bz(z))));
      for (const h of holes) sh.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(bx(x), bz(z)))));
      add(p, slab(sh, 0.45, 0), mat(p, {color: '#a9aeb6', metal: 0.9, rough: 0.45, env: 0.7}), [0, y, 0], {cast: false});
    };
    SHIELDS.A.forEach((c) => plate(c, Y.board + 0.8, true));
    SHIELDS.B.forEach((c) => plate(c, Y.board - 0.45, false));
  }
  // the bottom microphone: iFixit lists "a microphone hole" on the bottom edge; its position on the edge is APPROX
  {
    const p = part('mic_bottom', 'mic', {ex: [0, -14, 8], win: [0.4, 0.85]});
    add(p, cyl(1.3, 1.6, 16), mat(p, {color: '#2b2f35', metal: 0.6, rough: 0.4}), [14, 3.0, 76.8]);
    add(p, cyl(0.45, 0.3, 12), mat(p, {color: '#050608'}), [14, 3.0, 77.8], {rot: [Math.PI / 2, 0, 0], cast: false});
  }
  // ---------------------------------------------------------------- ILLUSTRATIVE parts: they exist in every phone but their positions are not documented
  const ill = {color: '#7a5af0', rough: 0.5, opacity: 0.7, emissive: '#3a2a90', ei: 0.5};
  const ILL = [];
  const illPart = (id, entry, ex, win) => { ILL.push(id); return part(id, entry, {ex, win}); };
  {
    const t = illPart('ant_top', 'antenna', [0, 22, 0], [0.2, 0.55]);
    add(t, rbox(46, 0.4, 2.2, 0.2, 1), mat(t, ill), [0, Y.mid - 1.0, -77.2], {cast: false});
    const bl = illPart('ant_bl', 'antenna', [0, 22, 0], [0.2, 0.55]);
    add(bl, rbox(22, 0.4, 2.2, 0.2, 1), mat(bl, ill), [-22, Y.mid - 1.0, 77.2], {cast: false});
    const br = illPart('ant_br', 'antenna', [0, 22, 0], [0.2, 0.55]);
    add(br, rbox(22, 0.4, 2.2, 0.2, 1), mat(br, ill), [22, Y.mid - 1.0, 77.2], {cast: false});
    const m = illPart('mic_top', 'mic', [0, 22, 0], [0.2, 0.55]);
    add(m, cyl(1.2, 1.2, 16), mat(m, ill), [22, Y.mid - 1.2, -77.4]);
    const s1 = illPart('sens_prox', 'sensors', [0, 28, 0], [0.15, 0.5]);
    add(s1, rbox(3, 0.8, 2, 0.3, 1), mat(s1, ill), [12, Y.mid - 0.8, -75.5]);
    add(s1, cyl(0.9, 0.5, 14), mat(s1, ill), [17, Y.mid - 0.6, -75.5]);
    const s2 = illPart('sens_imu', 'sensors', [0, 12, 0], [0.3, 0.75]);
    add(s2, rbox(3, 0.8, 3, 0.3, 1), mat(s2, ill), [bx(28), Y.board + 1.5, bz(21)]);
  }

  // chip markings and other decals: give them to their part
  const entryParts = {};
  for (const p of Object.values(parts)) (entryParts[p.entry] ||= []).push(p.id);

  const pos = new V3();
  const pose = ({explode = 0} = {}) => {
    for (const p of Object.values(parts)) {
      const u = sstep(p.win[0], p.win[1], explode);
      pos.copy(p.home).addScaledVector(p.ex, u).addScaledVector(p.pull, p.pullK);
      p.obj.position.copy(pos);
    }
  };
  const center = (id, out = new V3()) => {
    root.updateMatrixWorld(true);
    const b = new THREE.Box3();
    parts[id].meshes.forEach((m) => b.expandByObject(m));
    return b.isEmpty() ? out.set(0, 0, 0) : b.getCenter(out);
  };
  const sizeOf = (id) => {
    root.updateMatrixWorld(true);
    const b = new THREE.Box3();
    parts[id].meshes.forEach((m) => b.expandByObject(m));
    return b.getSize(new V3());
  };
  return {root, parts, meshes: meshesAll, hit, pose, center, sizeOf, entryParts, BX, BZ, Y, ILL};
}
