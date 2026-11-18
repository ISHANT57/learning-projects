// The laptop's model: every number the panels show and every animation follows from the functions in this file.
// No three.js in here. One reference machine: a 14-inch-class x86-64 laptop with a DDR5 SO-DIMM pair, an M.2 NVMe
// SSD, a Wi-Fi card, a discrete GPU next to the SoC, two blowers and three heat pipes.
//
// Provenance. Nothing in this file is a specific product. Each constant carries a tag:
//   STD  fixed by a published standard (JEDEC, PCI-SIG, NVMe, USB-IF, UEFI, VESA, IEEE) or by physics
//   TYP  typical of the class of machine; real products differ
//   ILL  an illustrative simulation parameter chosen to make the behaviour visible; not a measurement

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const sstep = (a, b, x) => {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

export const PROV = {
  STD: {name: 'STANDARD', note: 'Defined by a published standard or by physics.'},
  TYP: {name: 'TYPICAL', note: 'Typical of this class of laptop. Real products differ.'},
  ILL: {name: 'ILLUSTRATIVE', note: 'A simulation parameter chosen to make the behaviour visible. Not a measurement.'},
};

// ------------------------------------------------------------------------------------------------ display geometry
// A 14 inch diagonal at 16:10 gives the active area by Pythagoras (STD geometry).
export const PANEL = (() => {
  const diag = 14 * 25.4;
  const k = diag / Math.hypot(16, 10);
  return {diagMm: diag, w: 16 * k, h: 10 * k};
})();

// ------------------------------------------------------------------------------------------------ power
export const LOADS = {
  idle: {name: 'Idle', cpu: 1.5, gpu: 0.4, ram: 0.4, ssd: 0.1, wifi: 0.3, disp: 2.5, fan: 0, misc: 1.0, note: 'Desktop at rest, dGPU powered down.'},
  web: {name: 'Web', cpu: 7, gpu: 0.4, ram: 0.8, ssd: 0.3, wifi: 0.8, disp: 3.0, fan: 0, misc: 1.0, note: 'Browsing, a few tabs, short CPU bursts.'},
  video: {name: 'Video', cpu: 3, gpu: 0.4, ram: 0.8, ssd: 0.2, wifi: 1.0, disp: 3.0, fan: 0, misc: 1.0, note: 'Streaming playback, decoded by the media engine.'},
  gaming: {name: 'Gaming', cpu: 25, gpu: 60, ram: 2.5, ssd: 1.0, wifi: 1.2, disp: 3.5, fan: 0, misc: 1.5, note: 'CPU and dGPU both busy.'},
  stress: {name: 'Stress', cpu: 45, gpu: 80, ram: 3.0, ssd: 1.5, wifi: 1.0, disp: 3.5, fan: 0, misc: 1.5, note: 'Everything flat out: the cooling system is the limit.'},
};
export const LOAD_KEYS = Object.keys(LOADS);

export const PWR = {
  adapterW: {none: 0, w60: 60, w100: 100}, // USB-PD at 20 V: 3 A (60 W) or 5 A (100 W) (STD, SPR)
  pdVolt: 20, // STD: USB PD SPR fixed supplies 5 / 9 / 15 / 20 V
  etaPd: 0.97, // ILL
  etaChg: 0.93, // ILL
  chargeMaxW: 35, // ILL
  battWh: 60, // ILL capacity (STD: 100 Wh is the usual carry-on limit)
  cells: 3, // TYP: 3 cells in series
  eta: {cpu: 0.9, gpu: 0.9, ram: 0.8, ssd: 0.9, wifi: 0.9, disp: 0.88, fan: 0.92, misc: 0.9}, // ILL
};
// open-circuit voltage of one Li-ion cell against state of charge (TYP: 4.2 V full, about 3.0 V empty)
const OCV = [[0, 3.0], [0.05, 3.3], [0.2, 3.55], [0.5, 3.75], [0.8, 3.98], [0.95, 4.12], [1, 4.2]];
export const cellV = (soc) => {
  for (let i = 0; i < OCV.length - 1; i++) {
    if (soc <= OCV[i + 1][0]) return lerp(OCV[i][1], OCV[i + 1][1], (soc - OCV[i][0]) / (OCV[i + 1][0] - OCV[i][0]));
  }
  return 4.2;
};
export const packV = (soc) => PWR.cells * cellV(clamp(soc));

// rail voltages (ILL for the core rails, STD for DDR5 1.1 V and the 3.3 / 5 V rails)
export const railV = {
  cpu: (p) => 0.65 + 0.5 * Math.sqrt(clamp(p / 45)),
  gpu: (p) => 0.65 + 0.35 * Math.sqrt(clamp(p / 80)),
  ram: () => 1.1,
  ssd: () => 3.3,
  wifi: () => 3.3,
  disp: () => 11, // LED driver input from VSYS
  fan: () => 5,
  misc: () => 3.3,
};
export const RAIL_NAMES = {cpu: 'CPU core', gpu: 'GPU core', ram: 'DDR5 VDD', ssd: 'SSD 3.3 V', wifi: 'Wi-Fi 3.3 V', disp: 'Display', fan: 'Fans 5 V', misc: 'EC, audio, misc'};

/**
 * One operating point of the power tree. in: {load, adapter, soc, throttle:{cpu,gpu}, fanW}.
 * Conservation holds by construction: adapter + battery = the sum of every rail's input power.
 */
export function powerFlow({load = 'web', adapter = 'w60', soc = 0.6, tc = 1, tg = 1, fanW = 0}) {
  const L = LOADS[load];
  const out = {cpu: L.cpu * tc, gpu: L.gpu * tg, ram: L.ram, ssd: L.ssd, wifi: L.wifi, disp: L.disp, fan: fanW, misc: L.misc};
  const rails = Object.keys(out).map((id) => {
    const V = railV[id](out[id]);
    const pin = out[id] / PWR.eta[id];
    return {id, name: RAIL_NAMES[id], V, A: out[id] / V, pOut: out[id], pIn: pin, loss: pin - out[id]};
  });
  const pSys = rails.reduce((s, r) => s + r.pIn, 0);
  const vBat = packV(soc);
  const aMax = PWR.adapterW[adapter] * PWR.etaPd;
  let pAdapt = 0; // power drawn from the adapter, after the PD stage, towards VSYS
  let pBat = 0; // + discharging, - charging, at the battery terminals
  if (aMax > 0) {
    if (pSys >= aMax) {
      pAdapt = aMax;
      pBat = pSys - aMax;
    } else {
      const taper = soc > 0.8 ? 1 - 0.9 * (soc - 0.8) / 0.2 : 1; // constant-current then constant-voltage
      const chg = soc >= 0.999 ? 0 : Math.min((aMax - pSys) * PWR.etaChg, PWR.chargeMaxW * taper);
      pAdapt = pSys + chg / PWR.etaChg;
      pBat = -chg;
    }
  } else pBat = pSys;
  const pPort = pAdapt / PWR.etaPd;
  const chgLoss = pBat < 0 ? -pBat / PWR.etaChg + pBat : 0; // heat in the charger: adapter side minus battery side
  return {
    chgLoss, pdLoss: pPort - pAdapt,
    rails, pSys, vBat, iBat: pBat / vBat, pBat, pAdapt, pPort, iPort: adapter === 'none' ? 0 : pPort / PWR.pdVolt, vPort: adapter === 'none' ? 0 : PWR.pdVolt,
    adapterW: PWR.adapterW[adapter], supplement: aMax > 0 && pBat > 0, charging: pBat < 0, out,
    hoursLeft: pBat > 0 ? (soc * PWR.battWh) / pBat : Infinity,
  };
}

// ------------------------------------------------------------------------------------------------ DDR5 and PCIe
export const DDR = {
  mts: 4800, // STD: DDR5-4800 is the lowest JEDEC speed grade
  cl: 40, trcd: 39, trp: 39, // TYP: JEDEC DDR5-4800B timings
  bl: 16, // STD: burst length 16
  subBits: 32, // STD: two independent 32-bit sub-channels per module
  vdd: 1.1, vpp: 1.8, // STD
  line: 64, // TYP x86: 64-byte cache line
};
export const ddr = (() => {
  const tck = 2000 / DDR.mts; // ns; the clock runs at half the transfer rate
  const burstClk = DDR.bl / 2; // two transfers per clock
  const bytes = (DDR.bl * DDR.subBits) / 8; // 64 B: one cache line per burst
  return {
    tck, burstClk, bytes, clkMHz: DDR.mts / 2,
    peakGBsModule: (DDR.mts * 1e6 * (2 * DDR.subBits) / 8) / 1e9,
    tCL: DDR.cl * tck, tRCD: DDR.trcd * tck, tRP: DDR.trp * tck, tBurst: burstClk * tck,
    wl: DDR.cl - 2, // STD: DDR5 write latency = read latency - 2 clocks
  };
})();

/** Command timeline of one access to a closed row, in clocks from the first command. */
export function ddrTimeline(kind = 'read', rowOpen = false) {
  const ev = [];
  let t = 0;
  if (!rowOpen) {
    ev.push({t, cmd: 'PRE', note: 'close the open row'});
    t += DDR.trp;
    ev.push({t, cmd: 'ACT', note: 'open the row: copy it to the sense amps'});
    t += DDR.trcd;
  }
  ev.push({t, cmd: kind === 'read' ? 'RD' : 'WR', note: kind === 'read' ? 'column read command' : 'column write command'});
  const lat = kind === 'read' ? DDR.cl : ddr.wl;
  const d0 = t + lat;
  ev.push({t: d0, cmd: 'DQ', len: ddr.burstClk, note: kind === 'read' ? '16 beats leave the DRAM' : '16 beats arrive at the DRAM'});
  return {ev, tData: d0, tEnd: d0 + ddr.burstClk, lat, ns: (c) => c * ddr.tck};
}

export const PCIE = {gen: 4, lanes: 4, gts: 16, enc: 128 / 130, mps: 256, overhead: 24};
export const pcie = (() => {
  const lane = (PCIE.gts * 1e9 * PCIE.enc) / 8; // bytes/s after 128b/130b line coding
  const raw = lane * PCIE.lanes;
  const eff = PCIE.mps / (PCIE.mps + PCIE.overhead);
  return {laneGBs: lane / 1e9, rawGBs: raw / 1e9, eff, effGBs: (raw * eff) / 1e9};
})();

export const NVME = {sqe: 64, cqe: 16, tReadUs: 70, ctrlUs: 4, doorbellUs: 1.2, irqUs: 2}; // sizes STD; times ILL (TYP class)
export const IO = {
  rand4k: {name: '4 KiB random read', bytes: 4096},
  seq1m: {name: '1 MiB sequential read', bytes: 1048576},
  file1g: {name: '1 GiB file', bytes: 1073741824},
};
/** Stage durations (microseconds) of one NVMe read, from the model constants. */
export function nvmeRead(sizeKey = 'seq1m') {
  const bytes = IO[sizeKey].bytes;
  const xfer = (bytes / (pcie.effGBs * 1e9)) * 1e6;
  const stages = [
    {id: 'sub', name: 'Submit', us: NVME.doorbellUs + 0.8, text: 'The driver writes a 64-byte command into the submission queue in RAM, then rings the SSD doorbell with a PCIe write.'},
    {id: 'fetch', name: 'Fetch', us: 1.0, text: 'The SSD controller reads the command from host RAM over PCIe (DMA).'},
    {id: 'ftl', name: 'Map', us: NVME.ctrlUs, text: 'The flash translation layer turns the logical block address into a physical NAND page.'},
    {id: 'nand', name: 'NAND read', us: NVME.tReadUs, text: 'The NAND die senses the page into its register and the controller corrects errors with ECC.'},
    {id: 'dma', name: 'DMA to RAM', us: xfer, text: 'Data crosses PCIe in memory-write packets of up to 256 bytes and lands in DRAM through the memory controller.'},
    {id: 'done', name: 'Complete', us: NVME.irqUs, text: 'The SSD writes a 16-byte completion entry and raises an interrupt. The CPU wakes the waiting program.'},
  ];
  let t = 0;
  for (const s of stages) {
    s.t0 = t;
    t += s.us;
    s.t1 = t;
  }
  return {bytes, xferUs: xfer, totalUs: t, stages, gbs: bytes / (t * 1e-6) / 1e9};
}

// ------------------------------------------------------------------------------------------------ thermal
export const TH = {
  amb: 25, tj: 100, // ILL ambient; TYP junction limit class
  C: {cpu: 9, gpu: 12, hp: 70, finL: 30, finR: 30, ch: 300, ssd: 12}, // J/K  ILL
  R: {cpuHp: 0.6, gpuHp: 0.45, hpFin: 0.5, hpCh: 4.0, ssdCh: 3.0, chAmb: 1.6}, // K/W  ILL
  fanMax: 6400, fanMin: 2400, fanOn: 48, fanFull: 92, // rpm and degC  ILL
  cfmMax: 9, // per fan at full speed  ILL
  rho: 1.2, cp: 1005, // STD: air at room conditions, J/(kg K)
  fanW: 1.4, // per fan at full speed (ILL); power follows the cube of speed (STD fan law)
};
const Rfa = (f) => 0.28 + 1.8 / (1 + 9 * f); // fin-to-air resistance falls as the airflow rises  ILL

export function createThermal() {
  return {T: {cpu: 28, gpu: 28, hp: 27, finL: 26, finR: 26, ch: 26, ssd: 28}, rpm: [0, 0], tc: 1, tg: 1, Pc: 0, Pg: 0, fanW: 0, exhaustDT: 0, time: 0, qHp: 0, qFinL: 0, qFinR: 0};
}
/** Advance the thermal state by dt seconds of simulated time for a load profile. */
export function stepThermal(s, dt, loadKey, fanOverride = null) {
  const L = LOADS[loadKey];
  const {T} = s;
  const tmax = Math.max(T.cpu, T.gpu);
  const want = fanOverride != null ? fanOverride : tmax < TH.fanOn ? 0 : TH.fanMin + (TH.fanMax - TH.fanMin) * clamp((tmax - TH.fanOn) / (TH.fanFull - TH.fanOn));
  for (let i = 0; i < 2; i++) s.rpm[i] += (want - s.rpm[i]) * (1 - Math.exp(-dt / 1.4));
  const f = (s.rpm[0] + s.rpm[1]) / 2 / TH.fanMax;
  s.fanW = 2 * TH.fanW * f ** 3;
  // throttle: the power limit falls as the die nears its junction limit; clock goes as the cube root of power
  const thr = (t) => clamp((TH.tj - t) / 6, 0.3, 1);
  s.tc = thr(T.cpu);
  s.tg = thr(T.gpu);
  s.Pc = L.cpu * s.tc;
  s.Pg = L.gpu * s.tg;
  const vrLoss = s.Pc * (1 / PWR.eta.cpu - 1) + s.Pg * (1 / PWR.eta.gpu - 1);
  const other = L.ram + L.wifi + L.disp + L.misc + s.fanW + vrLoss;
  const rfa = Rfa(f);
  const q = {
    cpuHp: (T.cpu - T.hp) / TH.R.cpuHp, gpuHp: (T.gpu - T.hp) / TH.R.gpuHp,
    hpL: (T.hp - T.finL) / TH.R.hpFin, hpR: (T.hp - T.finR) / TH.R.hpFin, hpCh: (T.hp - T.ch) / TH.R.hpCh,
    fL: (T.finL - TH.amb) / rfa, fR: (T.finR - TH.amb) / rfa,
    ssdCh: (T.ssd - T.ch) / TH.R.ssdCh, chAmb: (T.ch - TH.amb) / TH.R.chAmb,
  };
  T.cpu += ((s.Pc - q.cpuHp) / TH.C.cpu) * dt;
  T.gpu += ((s.Pg - q.gpuHp) / TH.C.gpu) * dt;
  T.hp += ((q.cpuHp + q.gpuHp - q.hpL - q.hpR - q.hpCh) / TH.C.hp) * dt;
  T.finL += ((q.hpL - q.fL) / TH.C.finL) * dt;
  T.finR += ((q.hpR - q.fR) / TH.C.finR) * dt;
  T.ch += ((other + q.hpCh + q.ssdCh - q.chAmb) / TH.C.ch) * dt;
  T.ssd += ((L.ssd - q.ssdCh) / TH.C.ssd) * dt;
  s.qHp = q.cpuHp + q.gpuHp;
  s.qFinL = q.fL;
  s.qFinR = q.fR;
  const flow = 2 * f * TH.cfmMax * 4.719e-4; // m3/s
  s.exhaustDT = flow > 1e-5 ? (q.fL + q.fR) / (TH.rho * flow * TH.cp) : 0;
  s.clock = s.tc ** (1 / 3);
  s.clockG = s.tg ** (1 / 3);
  s.f = f;
  s.flowCfm = 2 * f * TH.cfmMax;
  s.time += dt;
  return s;
}
export const heatPct = (t) => clamp((t - 30) / (TH.tj - 30));

// ------------------------------------------------------------------------------------------------ CPU: a teaching pipeline
// Five in-order stages, a one-line program that sums four numbers, a 64-byte L1 line, static branch prediction.
// ILL: real cores are superscalar and out of order, and a DRAM miss costs hundreds of cycles, not sixteen.
export const STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB'];
export const MISS_CYC = 16;
export const PROG = [
  {text: 'mov   r1, 0', op: 'mov', rd: 1, imm: 0, note: 'sum = 0'},
  {text: 'mov   r2, 0x1000', op: 'mov', rd: 2, imm: 0x1000, note: 'pointer to the array in RAM'},
  {text: 'mov   r3, 4', op: 'mov', rd: 3, imm: 4, note: 'four elements left'},
  {text: 'load  r4, [r2]', op: 'load', rd: 4, rs: 2, note: 'L: read one 8-byte element'},
  {text: 'add   r1, r1, r4', op: 'add', rd: 1, rs: 1, rt: 4, note: 'sum += element'},
  {text: 'add   r2, r2, 8', op: 'addi', rd: 2, rs: 2, imm: 8, note: 'next element'},
  {text: 'sub   r3, r3, 1', op: 'addi', rd: 3, rs: 3, imm: -1, note: 'one fewer to go'},
  {text: 'jnz   r3, L', op: 'bnz', rs: 3, target: 3, note: 'loop while r3 != 0'},
  {text: 'store [0x2000], r1', op: 'store', rs: 1, imm: 0x2000, note: 'write the answer'},
  {text: 'halt', op: 'halt', note: 'stop'},
];
export function runProgram() {
  const mem = {0x1000: 10, 0x1008: 20, 0x1010: 30, 0x1018: 40};
  const reg = [0, 0, 0, 0, 0, 0, 0, 0];
  const l1 = new Set();
  const dyn = []; // the real instruction stream, with outcomes
  let pc = 0;
  for (let guard = 0; guard < 200; guard++) {
    const I = PROG[pc];
    const d = {pc, I, miss: false, taken: false, mispredict: false};
    if (I.op === 'mov') reg[I.rd] = I.imm;
    else if (I.op === 'addi') reg[I.rd] = reg[I.rs] + I.imm;
    else if (I.op === 'add') reg[I.rd] = reg[I.rs] + reg[I.rt];
    else if (I.op === 'load') {
      const a = reg[I.rs];
      const line = a >> 6;
      d.addr = a;
      d.miss = !l1.has(line);
      l1.add(line);
      reg[I.rd] = mem[a];
      d.val = reg[I.rd];
    } else if (I.op === 'store') {
      d.addr = I.imm;
      mem[I.imm] = reg[I.rs];
      d.val = reg[I.rs];
    } else if (I.op === 'bnz') {
      d.taken = reg[I.rs] !== 0;
      d.mispredict = !d.taken; // static rule: backward branches are predicted taken
    }
    if (I.rd != null && I.op !== 'bnz') {
      d.rd = I.rd;
      d.res = reg[I.rd];
    }
    dyn.push(d);
    if (I.op === 'halt') break;
    pc = I.op === 'bnz' && d.taken ? I.target : pc + 1;
  }
  // timing: stage s of instruction i starts once it has finished stage s-1 and the instruction ahead has left stage s
  const ready = new Array(8).fill(0);
  const done = [];
  let prev = null;
  let fetchFrom = 0;
  const list = [];
  for (const d of dyn) {
    const st = [0, 0, 0, 0, 0];
    st[0] = Math.max(prev ? prev.st[1] : 0, fetchFrom);
    st[1] = Math.max(st[0] + 1, prev ? prev.st[2] : 0);
    const srcs = [d.I.rs, d.I.rt].filter((r) => r != null && d.I.op !== 'mov' && d.I.op !== 'halt');
    const opReady = Math.max(0, ...srcs.map((r) => ready[r]));
    st[2] = Math.max(st[1] + 1, prev ? prev.st[3] : 0, opReady);
    d.memDur = 1 + (d.miss ? MISS_CYC : 0);
    st[3] = Math.max(st[2] + 1, prev ? prev.st[4] : 0);
    st[4] = Math.max(st[3] + d.memDur, prev ? prev.st[4] + 1 : 0);
    d.st = st;
    d.end = st[4] + 1;
    if (d.rd != null) ready[d.rd] = d.I.op === 'load' ? st[3] + d.memDur : st[2] + 1;
    d.idx = list.length;
    list.push(d);
    done.push(d);
    if (d.mispredict) {
      // wrong-path instructions from the loop head are fetched until the branch resolves in EX, then flushed
      const flush = st[2] + 1;
      let pw = d;
      let wpc = d.I.target;
      for (let k = 0; k < 6; k++) {
        const w = {pc: wpc, I: PROG[wpc], squashed: true, st: [0, 0, 0, 0, 0], memDur: 1};
        w.st[0] = Math.max(pw.st[1], pw === d ? d.st[0] + 1 : pw.st[0] + 1);
        if (w.st[0] >= flush) break;
        w.st[1] = Math.max(w.st[0] + 1, pw.st[2] > w.st[0] ? pw.st[2] : w.st[0] + 1);
        w.flush = flush;
        w.idx = list.length;
        list.push(w);
        pw = w;
        wpc++;
      }
      fetchFrom = flush;
    }
    prev = d;
  }
  const last = dyn[dyn.length - 1];
  const cycles = last.st[4] + 2;
  const real = dyn.filter((d) => !d.squashed);
  // per-cycle view
  const at = (c) => {
    const stage = [null, null, null, null, null];
    for (const d of list) {
      for (let s = 0; s < 5; s++) {
        const a = d.st[s];
        const b = d.squashed ? (s === 0 ? d.st[1] : d.flush) : s === 4 ? a + 1 : d.st[s + 1];
        if (d.squashed && s > 1) continue;
        if (d.squashed && s === 1 && !d.st[1]) continue;
        if (c >= a && c < b) stage[s] = d;
      }
    }
    // registers are written at the start of the WB cycle; replay the writes in program order
    const r2 = [0, 0, 0, 0, 0, 0, 0, 0];
    let memStore = null;
    for (const d of real) {
      if (d.st[4] > c) continue;
      if (d.rd != null) r2[d.rd] = d.res;
      if (d.I.op === 'store') memStore = d.val;
    }
    return {stage, regs: r2, mem: memStore};
  };
  return {list, real, cycles, ipc: real.length / (cycles - 1), at, dyn: real, missCycles: MISS_CYC};
}

// ------------------------------------------------------------------------------------------------ boot
// The order is fixed by the platform: embedded controller, power rails, reset vector, UEFI phases, bootloader,
// kernel. The durations are ILL and compressed to fit a screen.
export const BOOT = [
  {id: 'off', t: 0, d: 1.4, title: 'Powered off, EC awake', hl: ['ec', 'battery', 'pd'], rails: ['aon'],
    text: 'The laptop is "off", but the embedded controller (EC) still runs from a small always-on rail. It watches the power button, the lid, the battery gauge and the USB-C port.',
    log: ['[EC] always-on rail up (3.3 V)', '[EC] battery gauge read over SMBus', '[EC] waiting for power button']},
  {id: 'pwr', t: 1.4, d: 1.4, title: 'Power button pressed', hl: ['keyboard', 'ec', 'pd'], rails: ['aon', 'vsys'],
    text: 'The EC sees the button, checks that the battery or the adapter can supply power, and lets the main system rail (VSYS) through. If a USB-C charger is attached, the PD controller has already negotiated 20 V.',
    log: ['[EC] power button event', '[EC] VSYS enabled', '[PD] contract: 20 V (USB Power Delivery)']},
  {id: 'rails', t: 2.8, d: 1.8, title: 'Rails power up in order', hl: ['vrm', 'ram', 'ssd', 'wifi'], rails: ['aon', 'vsys', '5v', '3v3', 'ddr', 'core'],
    text: 'The platform needs its supplies in a fixed sequence: 5 V and 3.3 V first, then the DDR5 modules (each makes its 1.1 V on board), then the CPU core rail. When all are stable the EC asserts "power good".',
    log: ['[PWR] 5 V good', '[PWR] 3.3 V good', '[PWR] DDR5 VDD/VDDQ 1.1 V good', '[PWR] CPU core rail good', '[PWR] PWROK asserted']},
  {id: 'reset', t: 4.6, d: 1.4, title: 'CPU leaves reset', hl: ['soc', 'bios'], rails: ['aon', 'vsys', '5v', '3v3', 'ddr', 'core'],
    text: 'An x86 core starts in a primitive mode and fetches its first instruction from the reset vector, 16 bytes below the 4 GiB line (0xFFFFFFF0). The chipset maps that address to the SPI flash chip that holds the firmware.',
    log: ['[CPU] reset released', '[CPU] fetch 0xFFFFFFF0 -> SPI flash', '[CPU] microcode update applied']},
  {id: 'pei', t: 6.0, d: 2.2, title: 'Firmware: train the memory', hl: ['soc', 'ram', 'bios'], rails: ['aon', 'vsys', '5v', '3v3', 'ddr', 'core'],
    text: 'UEFI early phases (SEC, PEI) run from cache because no RAM works yet. They read each module\'s SPD chip, then train the DDR5 interface: they tune delays so every data line is sampled at the centre of its eye. When training succeeds, DRAM becomes usable and the firmware moves into it.',
    log: ['[PEI] cache-as-RAM', '[PEI] read SPD: DDR5 SO-DIMM x2', '[PEI] DDR5 training: CA, DQS, DQ', '[PEI] memory ready, firmware copied to RAM']},
  {id: 'dxe', t: 8.2, d: 2.0, title: 'Firmware: find the hardware', hl: ['soc', 'ssd', 'wifi', 'gpu', 'panel'], rails: ['aon', 'vsys', '5v', '3v3', 'ddr', 'core'],
    text: 'The DXE phase enumerates the PCIe tree (SSD, Wi-Fi, GPU), brings up USB and the keyboard, and starts the display. The first pixels appear on the panel over eDP.',
    log: ['[DXE] PCIe: NVMe SSD, Wi-Fi, GPU found', '[DXE] USB, keyboard ready', '[DXE] display output on (eDP)']},
  {id: 'bds', t: 10.2, d: 1.6, title: 'Boot manager reads the SSD', hl: ['ssd', 'soc'], rails: ['aon', 'vsys', '5v', '3v3', 'ddr', 'core'],
    text: 'The boot manager reads the boot order from firmware variables, reads the GPT partition table on the SSD, and finds the EFI System Partition (FAT32). With Secure Boot on, it checks the bootloader\'s signature before running it.',
    log: ['[BDS] boot order: Boot0001', '[BDS] GPT found, ESP (FAT32)', '[BDS] Secure Boot: signature OK', '[BDS] load \\EFI\\BOOT\\BOOTX64.EFI']},
  {id: 'load', t: 11.8, d: 1.8, title: 'Kernel loads into RAM', hl: ['ssd', 'ram', 'soc'], rails: ['aon', 'vsys', '5v', '3v3', 'ddr', 'core'],
    text: 'The bootloader asks the SSD for the kernel and the initial RAM disk. Each read is an NVMe transfer straight into DRAM (see the SSD to RAM view). Then it jumps into the kernel.',
    log: ['[LDR] read kernel image (NVMe)', '[LDR] read initramfs (NVMe)', '[LDR] ExitBootServices, jump to kernel']},
  {id: 'kernel', t: 13.6, d: 2.0, title: 'Operating system starts', hl: ['soc', 'ram', 'ssd', 'wifi', 'gpu'], rails: ['aon', 'vsys', '5v', '3v3', 'ddr', 'core'],
    text: 'The kernel sets up virtual memory and the scheduler, loads drivers (NVMe, Wi-Fi, GPU, input), mounts the root file system, and starts the first user program. The fans start to follow the EC\'s temperature policy.',
    log: ['[KRN] paging and scheduler up', '[KRN] drivers: nvme, wifi, gpu, hid', '[KRN] root file system mounted', '[KRN] start init (PID 1)']},
  {id: 'ready', t: 15.6, d: 2.4, title: 'Desktop ready', hl: ['panel', 'keyboard', 'touchpad', 'wifi'], rails: ['aon', 'vsys', '5v', '3v3', 'ddr', 'core'],
    text: 'Services start, Wi-Fi joins a network, the login screen draws. The whole path from the button took a few seconds on a real machine; here it is stretched so each step can be read.',
    log: ['[SYS] services started', '[WIFI] associated', '[GUI] login screen']},
];
export const BOOT_TOTAL = BOOT[BOOT.length - 1].t + BOOT[BOOT.length - 1].d;
export const bootAt = (t) => {
  let i = 0;
  while (i < BOOT.length - 1 && BOOT[i + 1].t <= t) i++;
  return {i, step: BOOT[i], k: clamp((t - BOOT[i].t) / BOOT[i].d)};
};

// ------------------------------------------------------------------------------------------------ CPU <-> RAM steps
// The animation walks the DDR5 timeline: each step covers a range of memory-clock cycles (clk0..clk1) taken from
// ddrTimeline(), so the cursor on the timing diagram is always at the cycle the model says. dur is screen seconds.
export function memSteps(kind = 'read', rowOpen = false) {
  const tl = ddrTimeline(kind, rowOpen);
  const ev = Object.fromEntries(tl.ev.map((e) => [e.cmd, e]));
  const cmdCmd = kind === 'read' ? 'RD' : 'WR';
  const st = [];
  const add = (id, name, dur, clk0, clk1, text, extra = {}) => st.push({id, name, dur, clk0, clk1, text, ...extra});
  add('miss', kind === 'read' ? 'Cache miss' : 'Store leaves the core', 1.5, 0, 0, kind === 'read'
    ? 'A load asks for an address that is in none of the caches: L1, L2 and L3 all miss, so the request goes to the memory controller.'
    : 'A dirty cache line is evicted. The memory controller turns it into a write to DRAM.', {who: 'cpu'});
  if (!rowOpen) {
    add('pre', 'PRE', 0.8, ev.PRE.t, ev.PRE.t + 2, 'PRECHARGE: a command packet on the CA bus tells the bank to close the row that is open.', {pkt: 'PRE', who: 'cmd'});
    add('trp', 'tRP wait', 1.0, ev.PRE.t + 2, ev.ACT.t, `Row precharge time: ${DDR.trp} clocks = ${(DDR.trp * ddr.tck).toFixed(1)} ns while the bit lines settle.`, {who: 'dram'});
    add('act', 'ACT', 0.8, ev.ACT.t, ev.ACT.t + 2, 'ACTIVATE: the row address is sent. The whole row is copied into the sense amplifiers.', {pkt: 'ACT', who: 'cmd'});
    add('trcd', 'tRCD wait', 1.0, ev.ACT.t + 2, ev[cmdCmd].t, `Row-to-column delay: ${DDR.trcd} clocks = ${(DDR.trcd * ddr.tck).toFixed(1)} ns until the row is ready for column access.`, {who: 'dram'});
  }
  add('rw', cmdCmd, 0.8, ev[cmdCmd].t, ev[cmdCmd].t + 2, kind === 'read' ? 'READ: the column address is sent on the CA bus.' : 'WRITE: the column address is sent, then the data follows after the write latency.', {pkt: cmdCmd, who: 'cmd'});
  add('lat', kind === 'read' ? 'CAS latency' : 'Write latency', 1.0, ev[cmdCmd].t + 2, tl.tData,
    kind === 'read' ? `CAS latency: ${DDR.cl} clocks = ${ddr.tCL.toFixed(1)} ns until the first data bit appears.` : `Write latency: ${ddr.wl} clocks (CL - 2): the controller waits, then drives the data.`, {who: 'dram'});
  add('burst', kind === 'read' ? 'Data burst' : 'Write burst', 1.6, tl.tData, tl.tEnd,
    `16 transfers on 32 data lines (two per clock, strobed by DQS) = ${ddr.bytes} bytes: one cache line in ${ddr.tBurst.toFixed(1)} ns.`, {who: 'data'});
  add('fill', kind === 'read' ? 'Fill caches' : 'Done', 1.0, tl.tEnd, tl.tEnd, kind === 'read'
    ? 'The line is stored in L3, L2 and L1 and the waiting instruction continues. Next time this address is a cache hit.'
    : 'The line is now in DRAM. The row stays open in case the next access is nearby.', {who: 'cpu'});
  let t = 0;
  for (const s of st) {
    s.t0 = t;
    t += s.dur;
    s.t1 = t;
  }
  return {steps: st, total: t, tl};
}
