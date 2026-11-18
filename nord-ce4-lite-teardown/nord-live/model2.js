// Phases 4 to 7: the models behind the remaining eight demonstrations. No three.js in here. Tags as in model.js:
//   STD physics or a published standard   DOC documented for the Nord CE4 Lite 5G   CALC arithmetic on documented numbers
//   ILL an illustrative parameter, NEVER a measurement of any phone   UNK not documented (so not shown as a number)

// ------------------------------------------------------------------------------------------------ touch
// A capacitive grid under the glass. The 6.67 in 20:9 screen is 69.5 x 154.5 mm (CALC from the documented diagonal and ratio).
// The grid pitch, the blob size and the scan rate are ILL: the touch sampling rate of the phone is NOT documented (UNK).
export const TOUCH = {cols: 16, rows: 36, w: 69.5, h: 154.5, sigma: 4.2, scanHz: 120};
export function touchFrame(x, y, seed = 0) {
  const px = TOUCH.w / TOUCH.cols, py = TOUCH.h / TOUCH.rows;
  const grid = [];
  let sw = 0, sx = 0, sy = 0, peak = 0;
  for (let r = 0; r < TOUCH.rows; r++) {
    const row = [];
    for (let c = 0; c < TOUCH.cols; c++) {
      const ex = (c + 0.5) * px, ey = (r + 0.5) * py;
      let v = Math.exp(-((ex - x) ** 2 + (ey - y) ** 2) / (2 * TOUCH.sigma ** 2)) + 0.02 * (Math.sin(r * 12.9 + c * 78.2 + seed * 3.1) * 0.5 + 0.5);
      if (v < 0.09) v = 0; // noise floor: below this nothing counts as touched
      row.push(v);
      sw += v; sx += v * ex; sy += v * ey; peak = Math.max(peak, v);
    }
    grid.push(row);
  }
  return {grid, cx: sw ? sx / sw : NaN, cy: sw ? sy / sw : NaN, peak, px, py};
}
export const TOUCH_LAT = [['Scan the grid', 4.2], ['Touch IC finds the finger', 1.5], ['Interrupt and driver', 1.0], ['Android input dispatch', 2.0], ['App handles the event', 3.0], ['Render and composite', 6.0], ['Display scan-out', 4.0]]; // ms, ILL

// ------------------------------------------------------------------------------------------------ camera
export const CAM = {mp: 50, bits: 10, binning: 4, jpegRatio: 10}; // 50 MP DOC; the bit depth and the ratio are ILL
export const cam = (() => {
  const raw = (CAM.mp * 1e6 * CAM.bits) / 8; // bytes
  return {rawMB: raw / 1e6, binnedMP: CAM.mp / CAM.binning, jpegMB: raw / CAM.jpegRatio / 1e6};
})();

// ------------------------------------------------------------------------------------------------ Wi-Fi and 5G link budget (free space only)
export const fspl = (dKm, fMHz) => 20 * Math.log10(dKm) + 20 * Math.log10(fMHz) + 32.45; // STD: free-space path loss, dB
export const shannon = (bHz, snrDb) => bHz * Math.log2(1 + 10 ** (snrDb / 10)); // STD: capacity limit, bit/s
export const NETS = {
  wifi: {name: 'Wi-Fi 5', fMHz: 5180, bw: 80e6, eirp: 20, dist: [5, 15, 40]}, // 802.11ac is DOC; the 80 MHz channel and 20 dBm are ILL
  nr: {name: '5G NR n78', fMHz: 3500, bw: 100e6, eirp: 55, dist: [200, 1000, 3000]}, // n78 is DOC; 100 MHz and 55 dBm are ILL
};
export function link(kind, distM) {
  const n = NETS[kind];
  const loss = fspl(distM / 1000, n.fMHz);
  const rx = n.eirp - loss;
  const noise = -174 + 10 * Math.log10(n.bw) + 7; // thermal noise plus a 7 dB receiver noise figure (ILL)
  const snr = rx - noise;
  return {loss, rx, noise, snr, cap: shannon(n.bw, snr)};
}

// ------------------------------------------------------------------------------------------------ GPS position fix
// Satellites are placed in the sky by hand (ILL); the arithmetic is real: pseudoranges from the geometry, then Gauss-Newton
// least squares for position and receiver clock bias, with the dilution of precision from the geometry matrix.
export const C_LIGHT = 299792458; // STD, m/s
export const GNSS = ['GPS L1', 'BDS B1I', 'GLONASS G1', 'Galileo E1', 'QZSS L1']; // DOC for the Nord CE4 Lite 5G
export const SATS = [[20, 62, 'G'], [95, 28, 'E'], [160, 48, 'G'], [215, 20, 'R'], [265, 55, 'C'], [320, 33, 'G'], [45, 14, 'E'], [190, 74, 'C']]; // az, el degrees: ILL
export const TRUTH = {x: 120, y: -80, z: 30, b: 85e-6}; // metres and seconds: ILL
function solve4(A, b) {
  const n = 4;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    for (let r = i + 1; r < n; r++) { const f = M[r][i] / M[i][i]; for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c]; }
  }
  const x = [0, 0, 0, 0];
  for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let c = i + 1; c < n; c++) s -= M[i][c] * x[c]; x[i] = s / M[i][i]; }
  return x;
}
export function gpsFix(nSat = 8) {
  const R = 22e6;
  const sats = SATS.slice(0, nSat).map(([az, el, c], i) => {
    const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
    return {az, el, c, p: [R * Math.cos(e) * Math.sin(a), R * Math.cos(e) * Math.cos(a), R * Math.sin(e)], noise: 3 * Math.sin(i * 7.3 + 1.1)};
  });
  const rho = sats.map((s) => Math.hypot(s.p[0] - TRUTH.x, s.p[1] - TRUTH.y, s.p[2] - TRUTH.z) + C_LIGHT * TRUTH.b + s.noise);
  let st = [0, 0, 0, 0]; // x, y, z, c*b
  const truthCb = C_LIGHT * TRUTH.b;
  const iters = [{x: 0, y: 0, z: 0, cb: 0, err: Math.hypot(TRUTH.x, TRUTH.y, TRUTH.z), cbErr: truthCb, rms: NaN, start: true}];
  let H = null;
  for (let it = 0; it < 6; it++) {
    H = sats.map((s) => { const d = Math.hypot(s.p[0] - st[0], s.p[1] - st[1], s.p[2] - st[2]); return [-(s.p[0] - st[0]) / d, -(s.p[1] - st[1]) / d, -(s.p[2] - st[2]) / d, 1]; });
    const res = sats.map((s, i) => rho[i] - (Math.hypot(s.p[0] - st[0], s.p[1] - st[1], s.p[2] - st[2]) + st[3]));
    const N = [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => H.reduce((a, row) => a + row[r] * row[c], 0)));
    const g = [0, 1, 2, 3].map((r) => H.reduce((a, row, i) => a + row[r] * res[i], 0));
    const d = solve4(N, g);
    st = st.map((v, i) => v + d[i]);
    iters.push({x: st[0], y: st[1], z: st[2], cb: st[3], err: Math.hypot(st[0] - TRUTH.x, st[1] - TRUTH.y, st[2] - TRUTH.z), cbErr: Math.abs(st[3] - truthCb), rms: Math.sqrt(res.reduce((a, r) => a + r * r, 0) / res.length)});
  }
  const N = [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => H.reduce((a, row) => a + row[r] * row[c], 0)));
  let tr = 0;
  for (let k = 0; k < 4; k++) { const e = [0, 0, 0, 0]; e[k] = 1; tr += solve4(N, e)[k]; }
  return {sats, rho, iters, gdop: Math.sqrt(tr), finalErr: iters[iters.length - 1].err};
}

// ------------------------------------------------------------------------------------------------ charging
// A generic constant-power then tapering Li-ion profile. 80 W is the documented adapter rating (DOC); SUPERVOOC's internal
// voltages and currents are NOT documented, so none are shown. The shape and the 92% efficiency are ILL.
export const CHARGE = {wh: (5500 * 3.88) / 1000, peakW: 80, eta: 0.92}; // 5,500 mAh is third-party (India model); 3.88 V is CALC from the global 19.83 Wh / 5,110 mAh
export const chargeP = (soc) => (soc < 0.35 ? CHARGE.peakW : soc < 0.8 ? CHARGE.peakW - ((soc - 0.35) / 0.45) * 55 : 25 - ((soc - 0.8) / 0.2) * 22);
export const chargeCurve = (() => {
  const pts = [];
  let t = 0;
  for (let soc = 0; soc < 1 - 1e-9; soc += 0.005) {
    const p = chargeP(soc);
    pts.push({soc, min: t / 60, p});
    t += (CHARGE.wh * 0.005 * 3600) / (p * CHARGE.eta);
  }
  pts.push({soc: 1, min: t / 60, p: chargeP(1)});
  return pts;
})();
export const chargeAt = (soc) => chargeCurve[Math.min(chargeCurve.length - 1, Math.max(0, Math.round(soc / 0.005)))];

// ------------------------------------------------------------------------------------------------ thermal (passive, no fan)
export const TP = {
  amb: 25, tjDie: 95, tSkin: 43, // ILL: the die limit and a skin comfort limit
  C: {die: 3, spread: 15, skin: 80}, // J/K, ILL
  R: {dieSp: 2.0, spSkin: 3.0, skinAmb: 4.5}, // K/W, ILL
};
export const TLOADS = {idle: {name: 'Idle', w: 0.3}, web: {name: 'Scroll', w: 1.2}, game: {name: 'Game', w: 4.5}, gamechg: {name: 'Game + charging', w: 7.0}}; // watts, ILL
export const createTP = () => ({T: {die: 28, spread: 27, skin: 26}, scale: 1, P: 0, time: 0, clock: 1});
export function stepTP(s, dt, key) {
  const {T} = s;
  const thr = Math.min(1, Math.max((TP.tjDie - T.die) / 8, 0.3), Math.max((TP.tSkin + 3 - T.skin) / 3, 0.3)); // the OS lowers power near either limit
  s.scale = thr;
  s.P = TLOADS[key].w * s.scale;
  const q1 = (T.die - T.spread) / TP.R.dieSp, q2 = (T.spread - T.skin) / TP.R.spSkin, q3 = (T.skin - TP.amb) / TP.R.skinAmb;
  T.die += ((s.P - q1) / TP.C.die) * dt;
  T.spread += ((q1 - q2) / TP.C.spread) * dt;
  T.skin += ((q2 - q3) / TP.C.skin) * dt;
  s.clock = s.scale ** (1 / 3); // P ~ f^3 (STD, from P = C V^2 f with V ~ f)
  s.time += dt;
  return s;
}

// ------------------------------------------------------------------------------------------------ one frame
export const SCREEN = {w: 1080, h: 2400, bpp: 4}; // DOC resolution; 4 bytes per pixel (TYP)
export function frameModel(hz = 120, jank = false) {
  const budget = 1000 / hz;
  const st = [['Input', 0.6], ['App UI thread', jank ? 6.8 : 2.2], ['RenderThread', 1.1], ['GPU', jank ? 4.2 : 3.0], ['Composite', 0.5]]; // ms, ILL
  const sum = st.reduce((a, s) => a + s[1], 0);
  const vsyncs = Math.ceil(sum / budget);
  const mb = (SCREEN.w * SCREEN.h * SCREEN.bpp) / 1e6;
  return {budget, st, sum, missed: sum > budget, vsyncs, shownMs: vsyncs * budget, mb, gbs: (mb * hz) / 1000};
}
