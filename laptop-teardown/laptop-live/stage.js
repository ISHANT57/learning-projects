// The laptop's stage: a pale studio, one soft key light with a shadow, soft boxes for the metal to catch, an invisible
// shadow floor. frame(state, cam) poses the machine and draws one frame. Parts can be ghosted (seen through),
// tinted by temperature or lit by the accent; picking is a ray against the parts that are solid right now.
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {buildLaptop} from './laptop.js';

const V3 = THREE.Vector3;
export const BG = {top: '#f4f5f6', mid: '#eaecee', low: '#e1e3e6'};
export const ACCENT = new THREE.Color('#e5342b');

// heat colour ramp: cool grey-blue, amber, red-orange
const HEAT = [new THREE.Color('#000000'), new THREE.Color('#5a2a00'), new THREE.Color('#c04a10'), new THREE.Color('#ff7a18')];
const heatColor = (u, out) => {
  const k = Math.min(1, Math.max(0, u)) * (HEAT.length - 1);
  const i = Math.min(HEAT.length - 2, Math.floor(k));
  return out.copy(HEAT[i]).lerp(HEAT[i + 1], k - i);
};

export function createStage({canvas}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'default'});
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; // refreshed only when something moved (see frame)
  let shadowKey = '';
  const scene = new THREE.Scene();
  {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 512;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, BG.top);
    gr.addColorStop(0.55, BG.mid);
    gr.addColorStop(1, BG.low);
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
  }
  const camera = new THREE.PerspectiveCamera(26, 16 / 9, 0.1, 80);
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 4}));
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 4, 4);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.7;
  gtao.updateGtaoMaterial({radius: 0.06, distanceExponent: 1.4, thickness: 0.5, scale: 1.0, samples: 12, distanceFallOff: 1.0, screenSpaceRadius: false});
  gtao.updatePdMaterial({lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12});
  gtao.enabled = false;
  composer.addPass(gtao);
  composer.addPass(new OutputPass());

  // studio reflections: a big top box, two side strips, a low front strip
  {
    const env = new THREE.Scene();
    env.background = new THREE.Color('#d9dadd');
    const box = (w, h, pos, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(1, 1, 1).multiplyScalar(k), side: THREE.DoubleSide}));
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    box(12, 12, new V3(0, 14, 2), 2.4);
    box(3, 14, new V3(-12, 4, 6), 3.0);
    box(3, 14, new V3(12, 4, -4), 2.0);
    box(18, 2, new V3(0, 2, 14), 1.4);
    const g = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshBasicMaterial({color: '#c9cacd', side: THREE.DoubleSide}));
    g.rotation.x = -Math.PI / 2;
    g.position.y = -2;
    env.add(g);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.02).texture;
    scene.environmentIntensity = 0.9;
    pm.dispose();
  }
  const sun = new THREE.DirectionalLight('#ffffff', 2.0);
  sun.position.set(-2.4, 5.2, 3.0);
  sun.target.position.set(0, 0.4, 0);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, {left: -3.4, right: 3.4, top: 3.4, bottom: -3.4, near: 1, far: 14});
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.003;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#ffffff', '#cfd0d3', 0.8));

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({color: '#5d636c', opacity: 0.26, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8}));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  floor.receiveShadow = true;
  scene.add(floor);

  const lap = buildLaptop();
  scene.add(lap.root);

  const size = {w: 1600, h: 900};
  const resize = (w, h, pr) => {
    size.w = w;
    size.h = h;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const tmp = new THREE.Color();
  const apply = (p) => {
    // p.ghost: 0 solid .. 1 see-through; p.glow: accent tint; p.heat: 0..1 temperature tint; p.hidden
    const g = p.ghost;
    p.obj.visible = !p.hidden && g < 0.96;
    const key = `${g.toFixed(3)}|${p.glow.toFixed(3)}|${p.heat.toFixed(3)}`;
    if (key === p._key) return;
    p._key = key;
    const ghosted = g > 0.01;
    for (const m of p.mats) {
      const b = m.userData.base;
      m.opacity = b.opacity * (1 - 0.9 * g);
      m.depthWrite = ghosted ? false : b.depthWrite;
      if (m.emissive && m !== p.screenMat) {
        m.emissive.copy(b.emissive);
        if (p.heat > 0.002) m.emissive.add(heatColor(p.heat, tmp));
        if (p.glow > 0.002) m.emissive.lerp(ACCENT, Math.min(0.5, p.glow * 0.3));
        m.emissiveIntensity = b.ei > 0 ? b.ei : 1;
      }
    }
    const solid = g < 0.5;
    for (const me of p.meshes) me.castShadow = me.userData.baseCast !== false && solid;
  };

  // the section of the camera: target, azimuth (from +z toward +x), elevation, distance, screen shift
  const frame = (state, cam) => {
    lap.pose(state);
    let key = `${state.lid.toFixed(1)}`;
    for (const p of Object.values(lap.parts)) {
      apply(p);
      const q = p.obj.position;
      key += `|${q.x.toFixed(1)},${q.y.toFixed(1)},${q.z.toFixed(1)},${p.ghost < 0.5 ? 1 : 0}${p.obj.visible ? 1 : 0}${p.openK.toFixed(2)}`;
    }
    if (key !== shadowKey) {
      shadowKey = key;
      renderer.shadowMap.needsUpdate = true;
    }
    const {tx, ty, tz, az, el, d} = cam;
    camera.position.set(tx + d * Math.cos(el) * Math.sin(az), ty + d * Math.sin(el), tz + d * Math.cos(el) * Math.cos(az));
    camera.lookAt(tx, ty, tz);
    camera.setViewOffset(size.w, size.h, -(cam.sx ?? 0), -(cam.sy ?? 0), size.w, size.h);
    camera.updateMatrixWorld();
    floor.position.y = Math.min(-0.02, lap.parts.dcover.obj.position.y * 0.01 - 0.03);
    composer.render();
  };
  const pv = new V3();
  const project = (v) => {
    pv.copy(v).project(camera);
    if (pv.z > 1) return null;
    return [(pv.x * 0.5 + 0.5) * size.w, (-pv.y * 0.5 + 0.5) * size.h];
  };
  const ray = new THREE.Raycaster();
  const nd = new THREE.Vector2();
  /** The part id under stage point (x, y), or null. Ghosted and hidden parts are skipped. */
  const pick = (x, y) => {
    nd.set((x / size.w) * 2 - 1, -(y / size.h) * 2 + 1);
    ray.setFromCamera(nd, camera);
    const cands = lap.hit.filter((m) => {
      const p = lap.parts[m.userData.part];
      return p && !p.hidden && p.ghost < 0.5 && m.visible;
    });
    const hits = ray.intersectObjects(cands, false);
    return hits.length ? hits[0].object.userData.part : null;
  };
  const setQuality = ({samples, ao, shadow}) => {
    shadowKey = '';
    if (samples !== undefined) {
      for (const t of [composer.renderTarget1, composer.renderTarget2]) {
        t.samples = samples;
        t.dispose();
      }
    }
    if (ao !== undefined) gtao.enabled = ao;
    if (shadow !== undefined) {
      sun.shadow.mapSize.set(shadow, shadow);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
  };
  return {renderer, scene, camera, composer, gtao, sun, lap, resize, frame, project, pick, setQuality, size, floor};
}
