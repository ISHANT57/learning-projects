// The visualisation layer: round point sprites that run along the model's own paths (current in a copper trace,
// data on a bus, heat along a pipe, air through a fan) and glowing ribbons on the board. Immediate mode: a view
// calls fx.begin(), then flow / packet / trace as often as it needs, then fx.end() once per frame. A path is the
// polyline from the laptop model (root millimetres); `follow` moves a group with the part it rides on, so a bus
// stays on the board when the board lifts out of the base.
import * as THREE from 'three';
import {NET, PCB_OUTLINE, P} from './laptop.js';

const MAX = 2600;
const V3 = THREE.Vector3;

const VS = `
attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
varying vec3 vC; varying float vA;
uniform float uScale;
void main(){
  vC = aColor; vA = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.5, aSize * uScale / max(0.05, -mv.z));
}`;
const FS = `
varying vec3 vC; varying float vA;
void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float edge = 1.0 - smoothstep(0.55, 1.0, r2);
  float core = 1.0 - smoothstep(0.0, 0.5, r2);
  vec3 col = mix(vC, vec3(1.0), core * 0.35);
  gl_FragColor = vec4(col, vA * edge);
}`;

const cum = (path) => {
  if (path._cum) return path._cum;
  const c = [0];
  for (let i = 1; i < path.pts.length; i++) c.push(c[i - 1] + path.pts[i].distanceTo(path.pts[i - 1]));
  path._cum = c;
  return c;
};
export const pathLength = (path) => cum(path)[cum(path).length - 1];
const tmpP = new V3();
/** Point at fraction u (0..1) along a path, written into out. */
export function sample(path, u, out = tmpP) {
  const c = cum(path);
  const L = c[c.length - 1];
  const d = Math.min(1, Math.max(0, u)) * L;
  let i = 1;
  while (i < c.length - 1 && c[i] < d) i++;
  const k = (d - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1]);
  return out.lerpVectors(path.pts[i - 1], path.pts[i], Math.min(1, Math.max(0, k)));
}

export function createFx(lap, scene, renderer, camera) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  const siz = new Float32Array(MAX);
  const alp = new Float32Array(MAX);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, uniforms: {uScale: {value: 1000}}});
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 20;
  pts.scale.setScalar(1); // positions are written in root millimetres; the Points live inside the root
  lap.root.add(pts);
  let n = 0;
  const colors = new Map();
  const rgb = (c) => {
    if (!colors.has(c)) colors.set(c, new THREE.Color(c));
    return colors.get(c);
  };
  const disp = new V3();
  const displacement = (id) => {
    if (!id) return disp.set(0, 0, 0);
    const p = lap.parts[id];
    return p ? disp.copy(p.obj.position).sub(p.home) : disp.set(0, 0, 0);
  };
  const put = (v, d, c, size, a) => {
    if (n >= MAX) return;
    const i = n++;
    pos[i * 3] = v.x + d.x;
    pos[i * 3 + 1] = v.y + d.y;
    pos[i * 3 + 2] = v.z + d.z;
    const k = rgb(c);
    col[i * 3] = k.r;
    col[i * 3 + 1] = k.g;
    col[i * 3 + 2] = k.b;
    siz[i] = size * 1.45;
    alp[i] = a;
  };
  let time = 0;
  const v = new V3();
  const fx = {
    /** Prepare for a new frame at animation time t seconds. */
    begin(t) {
      n = 0;
      time = t;
      for (const tr of traces.values()) tr.want = 0;
    },
    /** Particles streaming along a path: count dots at speed mm/s, dir +1 forward or -1 back. */
    flow(path, count, speed, color, size = 1.6, o = {}) {
      if (!path || count <= 0) return;
      const L = pathLength(path);
      const d = displacement(o.follow !== undefined ? o.follow : path.follow).clone();
      if (o.lift) d.y += o.lift;
      const dir = o.dir ?? 1;
      for (let i = 0; i < count; i++) {
        const ph = (i / count + (o.seed ?? 0)) % 1;
        let u = (ph + (dir * speed * time) / L) % 1;
        if (u < 0) u += 1;
        const fade = Math.min(1, u * 8, (1 - u) * 8);
        sample(path, u, v);
        if (o.jitter) {
          const j = o.jitter;
          v.x += Math.sin(i * 12.9 + time * 3) * j;
          v.z += Math.cos(i * 7.7 + time * 2.3) * j;
          v.y += Math.sin(i * 3.3 + time * 1.7) * j * 0.5;
        }
        put(v, d, color, size, (o.alpha ?? 0.95) * (o.fade === false ? 1 : fade));
      }
    },
    /** One dot at fraction u of a path (a packet, a pulse). */
    packet(path, u, color, size = 2.4, o = {}) {
      if (!path || u < 0 || u > 1) return;
      sample(path, u, v);
      const d = displacement(o.follow !== undefined ? o.follow : path.follow).clone();
      if (o.lift) d.y += o.lift;
      put(v, d, color, size, o.alpha ?? 1);
    },
    /** A short train of dots: len mm long, behind the head at u. */
    train(path, u, lenMm, count, color, size = 2.0, o = {}) {
      const L = pathLength(path);
      for (let i = 0; i < count; i++) {
        const uu = u - (i / Math.max(1, count - 1)) * (lenMm / L);
        if (uu < 0 || uu > 1) continue;
        fx.packet(path, uu, color, size * (1 - 0.4 * (i / count)), {...o, alpha: (o.alpha ?? 1) * (1 - 0.6 * (i / count))});
      }
    },
    /** A dot at a fixed point. */
    dot(x, y, z, color, size = 3, alpha = 1, follow = null) {
      v.set(x, y, z);
      put(v, displacement(follow).clone(), color, size, alpha);
    },
    /** Light a glowing ribbon (by net id like 'bus_ddrA' or 'pwr_cpu') with a colour and strength 0..1. */
    trace(id, color, k = 1) {
      const tr = traces.get(id);
      if (!tr) return;
      tr.want = Math.max(tr.want, k);
      tr.mat.color.set(color);
    },
    end() {
      geo.setDrawRange(0, n);
      for (const a of ['position', 'aColor', 'aSize', 'aAlpha']) geo.attributes[a].needsUpdate = true;
      for (const tr of traces.values()) {
        tr.cur += (tr.want - tr.cur) * 0.25;
        tr.mesh.visible = tr.cur > 0.02;
        tr.mat.opacity = Math.min(1, tr.cur) * 0.9;
      }
      mat.uniforms.uScale.value = (renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360))) * 0.01;
    },
    get count() {
      return n;
    },
  };

  // glowing ribbons laid on the board along the nets
  const traces = new Map();
  const ribbon = (ptsXZ, w, y) => {
    const verts = [];
    const idx = [];
    const m = ptsXZ.length;
    const perp = (a, b) => {
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const l = Math.hypot(dx, dz) || 1;
      return [-dz / l, dx / l];
    };
    for (let i = 0; i < m; i++) {
      const p0 = ptsXZ[Math.max(0, i - 1)];
      const p1 = ptsXZ[i];
      const p2 = ptsXZ[Math.min(m - 1, i + 1)];
      const a = perp(p0, p1);
      const b = perp(p1, p2);
      let nx = a[0] + b[0];
      let nz = a[1] + b[1];
      const l = Math.hypot(nx, nz) || 1;
      nx /= l;
      nz /= l;
      const cosHalf = Math.max(0.55, nx * a[0] + nz * a[1]);
      const hw = w / 2 / cosHalf;
      verts.push(p1[0] + nx * hw, y, p1[1] + nz * hw, p1[0] - nx * hw, y, p1[1] - nz * hw);
      if (i < m - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    return g;
  };
  const board = lap.parts.board.obj;
  const addTrace = (id, ptsXZ, w) => {
    const mt = new THREE.MeshBasicMaterial({color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, toneMapped: false});
    const me = new THREE.Mesh(ribbon(ptsXZ, w, P.pcbTop + 0.12), mt);
    me.visible = false;
    me.renderOrder = 8;
    board.add(me);
    traces.set(id, {mesh: me, mat: mt, cur: 0, want: 0});
  };
  for (const [k, b] of Object.entries(NET.buses)) addTrace(`bus_${k}`, b.pts, 1.6);
  for (const [k, b] of Object.entries(NET.power)) addTrace(`pwr_${k}`, b.pts, 2.2);
  return fx;
}
