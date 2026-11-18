// The phone's demonstration model. No three.js in here. Every number carries a tag, as everywhere in this project:
//   STD  fixed by a published standard (JEDEC LPDDR4X, UFS / UniPro / M-PHY, Arm architecture) or by physics
//   DOC  documented for the Nord CE4 Lite 5G (LPDDR4X, UFS 2.2, Snapdragon 695, 2.2 GHz big cores per third parties)
//   ILL  an illustrative parameter chosen to make the behaviour visible. NEVER a measurement of any phone.
// The phone's real memory speed grade, bus width and UFS speed gear are NOT documented (UNK): the grade used below is the
// highest LPDDR4X grade (STD) and is labelled as such.
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

// ------------------------------------------------------------------------------------------------ LPDDR4X
export const LP = {
  mts: 4266, // STD: LPDDR4X tops out at 4266 MT/s. The phone's actual grade is UNK.
  bl: 16, chBits: 16, // STD: burst length 16 on a 16-bit channel
  vdd2: 1.1, vddq: 0.6, // STD: LPDDR4X lowers the I/O voltage to 0.6 V
  rl: 36, wl: 18, // ILL: typical read and write latency (clocks) for the 4266 grade
  trcdNs: 18, // ILL: typical row-to-column delay
  line: 64, // TYP: a CPU cache line
  chans: 4, // ILL: four 16-bit channels (a typical 64-bit phone bus; this phone's width is UNK)
};
export const lp = (() => {
  const tck = 2000 / LP.mts; // ns: the clock is half the data rate
  const burstClk = LP.bl / 2; // two transfers per clock
  const bytes = (LP.bl * LP.chBits) / 8; // 32 B per burst
  return {tck, clkMHz: LP.mts / 2, burstClk, bytes, trcd: Math.ceil(LP.trcdNs / tck), chGBs: (LP.mts * 1e6 * (LP.chBits / 8)) / 1e9, busGBs: (LP.mts * 1e6 * (LP.chBits / 8) * LP.chans) / 1e9, bursts: LP.line / bytes};
})();
/** One DRAM access in clocks. rowOpen: the row is already open (a row hit). */
export function lpTimeline(kind = 'read', rowOpen = false) {
  const ev = [];
  let t = 0;
  if (!rowOpen) {
    ev.push({t, cmd: 'ACT', note: 'open the row'});
    t += lp.trcd;
  }
  ev.push({t, cmd: kind === 'read' ? 'RD' : 'WR', note: 'column command'});
  const lat = kind === 'read' ? LP.rl : LP.wl;
  const d0 = t + lat;
  ev.push({t: d0, cmd: 'DQ', len: lp.burstClk});
  return {ev, tData: d0, tEnd: d0 + lp.burstClk, lat};
}
export function memSteps(kind = 'read', rowOpen = false) {
  const tl = lpTimeline(kind, rowOpen);
  const ev = Object.fromEntries(tl.ev.map((e) => [e.cmd, e]));
  const c = kind === 'read' ? 'RD' : 'WR';
  const st = [];
  const add = (id, name, dur, clk0, clk1, text, who) => st.push({id, name, dur, clk0, clk1, text, who});
  add('miss', kind === 'read' ? 'Cache miss' : 'Store leaves', 1.5, 0, 0, kind === 'read' ? 'A load finds its address in no cache level, so the request goes to the memory controller inside the SoC.' : 'A modified cache line is evicted and becomes a write to DRAM.', 'cpu');
  if (!rowOpen) {
    add('act', 'ACT', 0.8, 0, 2, 'ACTIVATE: the row address goes out on the 6-bit CA bus (a command takes a few clock cycles). The row is copied into the sense amplifiers.', 'cmd');
    add('trcd', 'tRCD wait', 1.0, 2, ev[c].t, `Row-to-column delay: about ${LP.trcdNs} ns = ${lp.trcd} clocks (ILL typical).`, 'dram');
  }
  add('rw', c, 0.8, ev[c].t, ev[c].t + 2, kind === 'read' ? 'READ: the column address goes out on the CA bus.' : 'WRITE: the column address goes out; the data follows after the write latency.', 'cmd');
  add('lat', kind === 'read' ? 'Read latency' : 'Write latency', 1.0, ev[c].t + 2, tl.tData, `${kind === 'read' ? 'RL' : 'WL'} = ${tl.lat} clocks = ${(tl.lat * lp.tck).toFixed(1)} ns (ILL typical for the 4266 grade).`, 'dram');
  add('burst', 'Data burst', 1.5, tl.tData, tl.tEnd, `16 transfers on 16 data wires (two per clock, strobed by DQS) = ${lp.bytes} bytes in ${(lp.burstClk * lp.tck).toFixed(1)} ns. A 64-byte cache line needs ${lp.bursts} bursts (or two channels at once).`, 'data');
  add('fill', kind === 'read' ? 'Fill caches' : 'Done', 1.0, tl.tEnd, tl.tEnd, kind === 'read' ? 'The line is stored in the caches and the waiting instruction continues.' : 'The line is now in DRAM.', 'cpu');
  let t = 0;
  for (const s of st) { s.t0 = t; t += s.dur; s.t1 = t; }
  return {steps: st, total: t, tl};
}

// ------------------------------------------------------------------------------------------------ UFS
export const UFS = {
  laneGbps: 5.8, lanes: 2, // STD: HS-Gear3 is 5.8 Gbit/s per lane; two lanes (UFS 2.1 and 2.2 share this top speed class)
  enc: 8 / 10, // STD: 8b/10b line coding
  eff: 0.85, // ILL: protocol overhead (UniPro, UPIU headers, flow control)
  slots: 32, // STD: UFS host controller has 32 transfer request slots
  tRead: 80, tProg: 400, ftl: 5, submit: 2, fetch: 1.5, resp: 3, // ILL microseconds
};
export const ufs = (() => {
  const raw = (UFS.laneGbps * 1e9 * UFS.lanes * UFS.enc) / 8; // bytes/s after coding
  return {rawGBs: raw / 1e9, effGBs: (raw * UFS.eff) / 1e9};
})();
export const IO = {rand4k: {name: '4 KiB random', bytes: 4096}, seq1m: {name: '1 MiB sequential', bytes: 1048576}, file1g: {name: '1 GiB file', bytes: 1073741824}};
export function ufsOp(sizeKey = 'seq1m', write = false) {
  const bytes = IO[sizeKey].bytes;
  const xfer = (bytes / (ufs.effGBs * 1e9)) * 1e6;
  const S = [
    {id: 'sub', name: 'Submit', us: UFS.submit, text: 'The driver writes a command descriptor (a UTRD) into a slot of the transfer request list in RAM, then rings the controller doorbell register.'},
    {id: 'fetch', name: 'Fetch', us: UFS.fetch, text: 'The UFS host controller in the SoC reads the descriptor from RAM by DMA and builds a command packet (UPIU).'},
  ];
  if (write) S.push({id: 'link', name: 'Data out', us: xfer, text: 'The data crosses the UniPro / M-PHY serial link to the flash chip in packets, taken from RAM by DMA.'});
  else S.push({id: 'cmd', name: 'Command', us: 1, text: 'The command packet crosses the serial link to the UFS device controller in the memory package.'});
  S.push({id: 'ftl', name: 'Map', us: UFS.ftl, text: 'The flash translation layer turns the logical block address into a physical flash page.'});
  S.push(write ? {id: 'prog', name: 'Program', us: UFS.tProg, text: 'The flash cells are programmed: charge is pushed into the floating gates, far slower than a read. Most phones absorb the burst in a fast cache first.'} : {id: 'nand', name: 'NAND read', us: UFS.tRead, text: 'The flash die senses the page and the controller corrects errors with ECC (ILL read time).'});
  if (!write) S.push({id: 'link', name: 'Data in', us: xfer, text: 'The data crosses the serial link back and the controller DMA-writes it into RAM.'});
  S.push({id: 'done', name: 'Complete', us: UFS.resp, text: 'The device sends a response packet; the controller raises an interrupt; the driver completes the request and wakes the waiting app.'});
  let t = 0;
  for (const s of S) { s.t0 = t; t += s.us; s.t1 = t; }
  return {bytes, xferUs: xfer, totalUs: t, stages: S, gbs: bytes / (t * 1e-6) / 1e9};
}

// ------------------------------------------------------------------------------------------------ big and little cores (ILL)
// 2 big (Cortex-A78 class, 2.2 GHz max) + 6 little (Cortex-A55 class): core types and the clock are THIRD-PARTY for the Snapdragon 695.
export const CORES = [...Array(2).fill('big'), ...Array(6).fill('little')];
export const FREQ = {big: [0.6, 1.2, 1.8, 2.2], little: [0.6, 1.0, 1.4, 1.8]};
export const WORK = {
  idle: {name: 'Idle', note: 'Screen on, nothing running: one little core wakes now and then.', util: [0, 0, 0.08, 0.03, 0, 0, 0, 0]},
  web: {name: 'Scroll', note: 'A browser thread and the UI thread: mostly little cores.', util: [0.15, 0, 0.55, 0.45, 0.25, 0.1, 0, 0]},
  game: {name: 'Game', note: 'Game logic and render threads: both big cores and some little ones.', util: [0.85, 0.7, 0.6, 0.55, 0.4, 0.4, 0.2, 0.2]},
  burst: {name: 'Launch', note: 'A short burst: the scheduler uses the big cores at top speed.', util: [1, 1, 0.8, 0.7, 0.5, 0.3, 0.1, 0.1]},
};
/** Per-core clock, voltage and power for a workload. P = C * V^2 * f (STD), with V rising with f (ILL curve). */
export function cluster(key) {
  const w = WORK[key];
  const cores = CORES.map((kind, i) => {
    const u = w.util[i];
    const steps = FREQ[kind];
    const fi = u < 0.05 ? 0 : Math.min(steps.length - 1, Math.floor(u * steps.length - 1e-6));
    const f = steps[fi];
    const v = 0.55 + 0.3 * (f / FREQ[kind][steps.length - 1]);
    const k = kind === 'big' ? 1.1 : 0.32; // ILL switched capacitance
    const p = u < 0.01 ? 0.01 : k * v * v * f * Math.max(u, 0.1);
    return {kind, u, f, v, p};
  });
  return {cores, power: cores.reduce((s, c) => s + c.p, 0)};
}

// ------------------------------------------------------------------------------------------------ CPU: a teaching pipeline
export const STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB'];
export const MISS_CYC = 16;
export const PROG = [
  {text: 'mov   x1, #0', op: 'mov', rd: 1, imm: 0, note: 'sum = 0'},
  {text: 'mov   x2, #0x1000', op: 'mov', rd: 2, imm: 0x1000, note: 'x2 points to an array in RAM'},
  {text: 'mov   x3, #4', op: 'mov', rd: 3, imm: 4, note: 'four elements left'},
  {text: 'ldr   x4, [x2]', op: 'load', rd: 4, rs: 2, note: 'L: load one 8-byte element'},
  {text: 'add   x1, x1, x4', op: 'add', rd: 1, rs: 1, rt: 4, note: 'sum += element'},
  {text: 'add   x2, x2, #8', op: 'addi', rd: 2, rs: 2, imm: 8, note: 'next element'},
  {text: 'subs  x3, x3, #1', op: 'addi', rd: 3, rs: 3, imm: -1, note: 'one fewer to go'},
  {text: 'b.ne  L', op: 'bnz', rs: 3, target: 3, note: 'loop while r3 != 0'},
  {text: 'str   x1, [x5]', op: 'store', rs: 1, imm: 0x2000, note: 'store the answer (x5 holds 0x2000)'},
  {text: 'ret', op: 'ret', note: 'stop'},
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
    if (I.op === 'ret') break;
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
    const srcs = [d.I.rs, d.I.rt].filter((r) => r != null && d.I.op !== 'mov' && d.I.op !== 'ret');
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

