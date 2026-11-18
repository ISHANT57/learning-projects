// Phase 3: three demonstrations that run on the model in model.js and drive the 3D chips: the CPU executing a program,
// the CPU talking to LPDDR4X, and UFS storage. Everything here is a conceptual model (tagged ILL), never a measurement.
// The SoC and the memory package sit side by side on the board, so the buses are drawn as arcs between the chips: a visual
// aid only. The real traces run on inner layers of the board.
import * as THREE from 'three';
import * as M from './model.js';
import {C} from './console.js';

const V3 = THREE.Vector3;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const chipP = (t) => `<span class="pv" style="background:${{ILL: '#7a5af0', STD: '#4a5a6a', '3RD': '#8a6d3b', DOC: '#1f7a4d', UNK: '#b8332b'}[t]}">${{ILL: 'ILLUSTRATIVE', STD: 'STANDARD', '3RD': 'THIRD-PARTY', DOC: 'DOCUMENTED', UNK: 'UNKNOWN'}[t]}</span>`;
const loadChips = () => Object.keys(M.WORK).map((k) => `<div class="btn sm" data-act="work" data-v="${k}" data-k="w-${k}">${M.WORK[k].name}</div>`).join('');

export const MODE_NAMES = {cpu: 'CPU RUNS', ram: 'CPU ↔ RAM', ufs: 'UFS STORAGE'};
export const INTRO = {
  cpu: ['The CPU runs a program', `<p>An instruction is <b>fetched</b>, <b>decoded</b>, <b>executed</b>, may touch <b>memory</b>, and is <b>written back</b>. While one executes, the next is decoding: a pipeline.</p><p>The program adds four numbers from RAM. Watch for a <b>load miss</b> that stalls the line, a <b>load-use</b> stall, and a <b>mispredicted branch</b>.</p><p>Below, the <b>eight cores</b>: two big and six little. The scheduler puts light work on little cores and wakes the big ones for bursts; each core's clock rises with its load (DVFS).</p><p style="color:${C.mute}">The pipeline is a teaching model (ILL). Core types and clocks are third-party for the Snapdragon 695; the real cores are wider and out of order.</p>`],
  ram: ['One trip to the memory', `<p>A load that misses every cache goes to DRAM. The memory controller in the SoC sends a <b>command</b> on a small bus, waits for the DRAM array, then <b>16 transfers</b> come back on 16 wires: 32 bytes. A 64-byte cache line needs two bursts.</p><p><b>LPDDR4X</b> is low-power DRAM: it runs its I/O at only 0.6 V. Memory and storage sit in one package next to the SoC (the Samsung chip in the teardown).</p><p style="color:${C.mute}">Clock counts follow the LPDDR4X standard at its fastest grade (4266 MT/s); your phone's real grade, bus width and timings are not documented (UNK). Latencies are illustrative.</p>`],
  ufs: ['A file read or write', `<p>The CPU never copies the file. It writes a command descriptor into RAM, rings a doorbell, and the UFS controller does the rest: it sends the command over a fast serial link to the flash chip, which looks up the page, reads it and sends the data back.</p><p>Compare <b>4 KiB</b> with <b>1 GiB</b>: a small read is all latency, a big one is all link bandwidth. Writes are slower because programming flash is slower than reading it.</p><p style="color:${C.mute}">The link ceiling (HS-Gear3, 2 lanes, 8b/10b) is a standard that UFS 2.1 and 2.2 share. Your phone's actual gear is not documented. Flash times are illustrative.</p>`],
};

export const DOCKS = {
  cpu: () => `<h3>CPU executes a program</h3>${chipP('ILL')}${chipP('3RD')}<span class="lsub">One cycle at a time, then the eight cores.</span>
    <div class="lrow" style="margin-top:8px"><div class="btn sm red" data-act="dplay" data-k="play"></div><div class="btn sm" data-act="cstep" data-v="-1">◀ Step</div><div class="btn sm" data-act="cstep" data-v="1">Step ▶</div><div class="btn sm" data-act="drestart">⟲ Restart</div><div class="btn sm" data-act="dslow" data-k="slow"></div>
      <span class="lcap" style="margin-left:8px">Cycle</span><b class="mono" data-k="cyc"></b><span class="lcap">IPC</span><b class="mono" data-k="ipc"></b><span style="width:6px"></span>${loadChips()}</div>
    <div style="display:flex;gap:12px;margin-top:6px"><div class="lprog mono" data-k="prog" style="width:190px;flex:none"></div>
      <div style="flex:1;min-width:0"><div class="pipe" data-k="pipe"></div><div class="note b" data-k="ev" style="min-height:30px"></div></div>
      <div style="width:150px;flex:none"><div class="lcap" style="margin-bottom:3px">Registers x0-x7</div><div class="regs" data-k="regs"></div></div></div>
    <div style="display:flex;gap:4px;margin-top:5px" data-k="cores"></div>
    <div class="note" style="color:${C.mute};font-size:10.5px" data-k="cnote"></div>`,
  ram: () => `<h3>CPU ↔ RAM (LPDDR4X)</h3>${chipP('STD')}${chipP('ILL')}<span class="lsub">One cache-line access. Time is slowed; clock counts follow the standard.</span>
    <div class="lrow" style="margin-top:8px"><div class="btn sm" data-act="mrw" data-v="read" data-k="m-read">Read</div><div class="btn sm" data-act="mrw" data-v="write" data-k="m-write">Write</div><span style="width:6px"></span>
      <div class="btn sm" data-act="mrow" data-v="0" data-k="m-closed">Row closed</div><div class="btn sm" data-act="mrow" data-v="1" data-k="m-open">Row open</div><span style="width:6px"></span>
      <div class="btn sm red" data-act="dplay" data-k="play"></div><div class="btn sm" data-act="drestart">⟲ Restart</div><div class="btn sm" data-act="dslow" data-k="slow"></div></div>
    <div class="seg" data-k="seg"></div>
    <div style="display:flex;gap:16px"><svg data-k="mtl" width="590" height="104" style="flex:none"></svg><div style="flex:1"><div class="note b" data-k="stext" style="min-height:56px"></div>
      <div class="kv" style="margin-top:2px"><span>Clock</span><span data-k="clk"></span><span>Row-miss read</span><span data-k="tmiss"></span><span>Row-hit read</span><span data-k="thit"></span><span>Peak, if ${M.LP.chans} channels</span><span data-k="peak"></span></div></div></div>`,
  ufs: () => `<h3>UFS storage read and write</h3>${chipP('STD')}${chipP('ILL')}<span class="lsub">What happens when an app reads or writes a file.</span>
    <div class="lrow" style="margin-top:8px"><div class="btn sm" data-act="urw" data-v="read" data-k="u-read">Read</div><div class="btn sm" data-act="urw" data-v="write" data-k="u-write">Write</div><span style="width:6px"></span>
      <div class="btn sm" data-act="usz" data-v="rand4k" data-k="io-rand4k">4 KiB</div><div class="btn sm" data-act="usz" data-v="seq1m" data-k="io-seq1m">1 MiB</div><div class="btn sm" data-act="usz" data-v="file1g" data-k="io-file1g">1 GiB</div><span style="width:6px"></span>
      <div class="btn sm red" data-act="dplay" data-k="play"></div><div class="btn sm" data-act="drestart">⟲ Restart</div><div class="btn sm" data-act="dslow" data-k="slow"></div></div>
    <div class="seg" data-k="seg"></div>
    <div style="display:flex;gap:18px"><div style="flex:1"><div class="note b" data-k="stext" style="min-height:70px"></div><svg data-k="lanes" width="400" height="40"></svg></div>
      <div style="width:330px"><div class="kv"><span>Link ceiling</span><span data-k="link"></span><span>Data moved</span><span data-k="bytes"></span><span>Total time</span><b data-k="ttot"></b><span>Throughput</span><b data-k="gbs"></b><span>Queue depth</span><span>${M.UFS.slots} slots (STD)</span></div>
      <div class="note" style="margin-top:6px;color:${C.mute}" data-k="snote"></div></div></div>`,
};

export function createDemos({S, lap, fx, ui, glow}) {
  const D = {play: true, slow: 1, work: 'web', mem: {kind: 'read', rowOpen: false, t: 0}, ufs: {key: 'seq1m', write: false, t: 0}, cpu: {c: 0}, acc: 0};
  const PROGRAM = M.runProgram();
  let memS = M.memSteps('read', false);
  let ufsS = M.ufsOp('seq1m', false);
  const arc = (lift, off = 0) => {
    const a = lap.center('soc').multiplyScalar(100);
    const b = lap.center('mcp').multiplyScalar(100);
    const o = new V3(0, 0, off);
    return {pts: [a.clone().add(o), a.clone().add(new V3(0, lift, off)), b.clone().add(new V3(0, lift, off)), b.clone().add(o)], follow: null};
  };
  const rev = (p) => ({pts: [...p.pts].reverse(), follow: null});
  const stepAt = (steps, t, key = 't') => {
    let i = steps.length - 1;
    for (let k = 0; k < steps.length; k++) if (t < steps[k].t1) { i = k; break; }
    const s = steps[i];
    return {i, s, k: clamp((t - s.t0) / Math.max(1e-6, s.t1 - s.t0), 0, 1)};
  };
  const seg = (items, cur, total) => items.map((it, i) => `<div class="${i === cur ? 'on' : i < cur ? 'done' : ''}" data-act="dseek" data-v="${i}" style="width:${Math.max(56, ((880 - 2 * items.length) * it.w) / total).toFixed(0)}px">${it.name}<small>${it.sub || ''}</small></div>`).join('');
  const ufsDur = () => {
    let t = 0;
    return ufsS.stages.map((s) => { const d = 0.9 + 0.55 * Math.log10(1 + s.us); const o = {...s, d0: t, d1: t + d, d}; t += d; return o; });
  };

  // ---- the timing diagram for LPDDR4X
  const timingSvg = (clkNow) => {
    const tl = memS.tl;
    const rd = D.mem.kind === 'read';
    const total = tl.tEnd + 6;
    const x0 = 46, x1 = 584;
    const X = (c) => x0 + (c / total) * (x1 - x0);
    const w = (x1 - x0) / total;
    let s = '';
    for (const [y, l] of [[20, 'CK'], [46, 'CA'], [70, 'DQS'], [86, 'DQ']]) s += `<text x="4" y="${y + 9}" font-size="9" font-weight="700" fill="${C.mute}">${l}</text>`;
    let ck = `M${X(0)} 32`;
    for (let c = 0; c < total; c++) ck += `H${X(c)}V22H${X(c + 0.5)}V32H${X(c + 1)}`;
    s += `<path d="${ck}" fill="none" stroke="${C.ink}" stroke-width=".9"/>`;
    const col = {ACT: '#2f7de1', RD: '#1f9d62', WR: '#f26a1b'};
    for (const e of tl.ev.filter((q) => q.cmd !== 'DQ')) s += `<rect x="${X(e.t)}" y="38" width="${Math.max(26, 2 * w)}" height="20" fill="${col[e.cmd]}"/><text x="${X(e.t) + Math.max(13, w)}" y="52" font-size="10" font-weight="700" fill="#fff" text-anchor="middle">${e.cmd}</text>`;
    const br = (a, b, label) => (s += `<line x1="${X(a)}" x2="${X(b)}" y1="12" y2="12" stroke="${C.mute}"/><line x1="${X(a)}" x2="${X(a)}" y1="8" y2="16" stroke="${C.mute}"/><line x1="${X(b)}" x2="${X(b)}" y1="8" y2="16" stroke="${C.mute}"/><text x="${(X(a) + X(b)) / 2}" y="9" font-size="8.6" fill="${C.ink}" text-anchor="middle" font-weight="600">${label}</text>`);
    const ev = Object.fromEntries(tl.ev.map((q) => [q.cmd, q]));
    const rw = ev.RD || ev.WR;
    if (ev.ACT) br(ev.ACT.t, rw.t, `tRCD ${M.lp.trcd} clk`);
    br(rw.t, tl.tData, `${rd ? 'RL' : 'WL'} ${tl.lat} clk · ${(tl.lat * M.lp.tck).toFixed(1)} ns`);
    const d0 = tl.tData, d1 = tl.tEnd;
    s += `<rect x="${X(d0)}" y="82" width="${X(d1) - X(d0)}" height="16" fill="${rd ? '#d7f0e1' : '#fde6d6'}" stroke="${rd ? '#1f9d62' : '#f26a1b'}"/>`;
    for (let b = 1; b < 16; b++) s += `<line x1="${X(d0) + ((X(d1) - X(d0)) * b) / 16}" x2="${X(d0) + ((X(d1) - X(d0)) * b) / 16}" y1="82" y2="98" stroke="${rd ? '#1f9d62' : '#f26a1b'}" stroke-width=".6"/>`;
    s += `<text x="${(X(d0) + X(d1)) / 2}" y="110" font-size="8.6" text-anchor="middle" fill="${C.ink}" font-weight="600">16 beats = ${M.lp.bytes} B</text>`;
    let dqs = `M${X(d0 - 1)} 78`;
    for (let b = 0; b < 16; b++) dqs += `L${X(d0) + ((X(d1) - X(d0)) * b) / 16} ${b % 2 ? 68 : 78}`;
    s += `<path d="${dqs} H${X(d1 + 1)}" fill="none" stroke="${C.ink}" stroke-width=".9"/>`;
    const cx = X(clkNow);
    return s + `<line x1="${cx}" x2="${cx}" y1="14" y2="100" stroke="${C.red}" stroke-width="1.6"/><circle cx="${cx}" cy="14" r="3" fill="${C.red}"/>`;
  };

  const modes = {
    // ================================================================ CPU
    cpu(dt, refresh) {
      const c = D.cpu;
      if (D.play) { c.c += dt * 1.7 * D.slow; if (c.c > PROGRAM.cycles + 2.5) c.c = 0; }
      const cc = clamp(Math.floor(c.c), 0, PROGRAM.cycles - 1);
      const now = PROGRAM.at(cc);
      const prev = PROGRAM.at(Math.max(0, cc - 1));
      const act = now.stage.filter(Boolean).length / 5;
      glow('soc', 0.25 + 0.6 * act);
      const mem = now.stage[3];
      let miss = false;
      if (mem && mem.miss) {
        miss = true;
        const u = clamp((cc - mem.st[3]) / PROGRAM.missCycles, 0, 1);
        glow('mcp', 0.7);
        const p = arc(8);
        if (u < 0.35) fx.train(p, u / 0.35, 14, 5, '#2f7de1', 2.2, {follow: null});
        else if (u > 0.55) fx.train(rev(p), clamp((u - 0.55) / 0.45, 0, 1), 16, 6, '#1f9d62', 2.2, {follow: null});
      }
      if (!refresh) return;
      const names = ['IF', 'ID', 'EX', 'MEM', 'WB'], full = ['Fetch', 'Decode', 'Execute', 'Memory', 'Write back'];
      ui.html('pipe', names.map((n, s) => {
        const d = now.stage[s];
        let cls = '', txt = '';
        if (d) { txt = d.I.text; if (d.squashed) cls = 'sq'; else if (s === 3 && d.miss) cls = 'mi'; else if (s < 3 && cc > d.st[s]) cls = 'st'; }
        return `<div class="${cls}"><b>${full[s]}</b><span class="mono" style="font-size:9.5px">${txt || '—'}</span></div>`;
      }).join(''));
      const tag = {};
      now.stage.forEach((d, s) => d && !d.squashed && (tag[d.pc] = (tag[d.pc] ? tag[d.pc] + ' ' : '') + names[s]));
      ui.html('prog', M.PROG.map((p, i) => `<div class="${tag[i] ? 'on' : ''}"><span style="color:${C.mute};width:12px">${i}</span><span>${p.text}</span><span class="tg">${tag[i] || ''}</span></div>`).join(''));
      ui.html('regs', now.regs.map((v, i) => `<div class="${v !== prev.regs[i] ? 'ch' : ''}"><b>x${i}</b><span class="mono">${v >= 4096 ? '0x' + v.toString(16) : v}</span></div>`).join(''));
      ui.set('cyc', `${cc} / ${PROGRAM.cycles - 1}`);
      ui.set('ipc', cc ? (PROGRAM.real.filter((d) => d.st[4] <= cc).length / cc).toFixed(2) : '—');
      let ev = 'Flowing: instructions move one stage per cycle.';
      if (miss) ev = `Load missed the caches: waiting for DRAM (${clamp(cc - mem.st[3], 0, 16)}/16 cycles shown). Everything behind it is stalled.`;
      else if (now.stage.some((d) => d && d.squashed)) ev = 'Branch mispredicted: wrong-path instructions were fetched and are flushed.';
      else if (now.stage[1] && cc > now.stage[1].st[1] && now.stage[2] && now.stage[2].I.op === 'load') ev = 'Load-use hazard: the next instruction needs the loaded value, so it waits one cycle.';
      else if (cc >= PROGRAM.cycles - 2) ev = `Done. x1 = ${now.regs[1]}: the sum 10 + 20 + 30 + 40, stored to memory.`;
      ui.set('ev', ev);
      ui.set('play', D.play ? '❚❚ Pause' : '▶ Play');
      ui.set('slow', `Speed ${D.slow}×`);
      for (const k of Object.keys(M.WORK)) ui.cls(`w-${k}`, 'on', D.work === k);
      const cl = M.cluster(D.work);
      ui.html('cores', cl.cores.map((q, i) => `<div style="flex:1;border:1px solid ${C.line};background:#fff;padding:3px 5px;font-size:9.5px"><b style="color:${q.kind === 'big' ? C.red : C.mute}">${q.kind === 'big' ? 'BIG' : 'little'} ${i}</b> ${q.f.toFixed(1)} GHz<div style="height:5px;background:#e5e7ea;margin-top:3px"><i style="display:block;height:5px;width:${(q.u * 100).toFixed(0)}%;background:${q.kind === 'big' ? C.red : '#8a8f97'}"></i></div></div>`).join(''));
      ui.set('cnote', `${M.WORK[D.work].note} Cluster power ${cl.power.toFixed(2)} W (P ≈ C·V²·f, ILL curve). Fewer, slower cores when idle is how a phone saves battery.`);
    },
    // ================================================================ CPU <-> RAM
    ram(dt, refresh) {
      const m = D.mem;
      const total = memS.total + 1;
      if (D.play) m.t = (m.t + dt * D.slow) % total;
      const t = Math.min(m.t, memS.total - 0.001);
      const {i, s, k} = stepAt(memS.steps, t);
      const rd = m.kind === 'read';
      const p = arc(8);
      glow('soc', 0.3); glow('mcp', 0.25);
      if (s.id === 'miss') { glow('soc', 0.8); fx.packet(p, k * 0.12, '#ff4b6e', 2.4, {follow: null}); }
      else if (s.who === 'cmd') { fx.train(p, k, 12, 5, '#2f7de1', 2.4, {follow: null}); glow('mcp', 0.3 + 0.4 * k); }
      else if (s.who === 'dram') glow('mcp', 0.55 + 0.25 * Math.sin(S.T * 9));
      else if (s.who === 'data') {
        for (let q = 0; q < 16; q++) {
          const u = rd ? 1 - (k * 1.35 - q * 0.032) : k * 1.35 - q * 0.032;
          if (u >= 0 && u <= 1) fx.packet(p, u, rd ? '#1f9d62' : '#f26a1b', 2.3, {follow: null});
        }
        glow('mcp', 0.8); glow('soc', 0.5);
      } else if (s.id === 'fill') glow('soc', 0.8 * (1 - k) + 0.2);
      if (!refresh) return;
      ui.html('seg', seg(memS.steps.map((q) => ({name: q.name, sub: q.clk1 > q.clk0 ? `${q.clk1 - q.clk0} clk` : '', w: q.dur})), i, memS.total));
      ui.set('stext', s.text);
      const clk = s.clk0 + (s.clk1 - s.clk0) * k;
      ui.html('mtl', timingSvg(clk));
      ui.set('play', D.play ? '❚❚ Pause' : '▶ Play'); ui.set('slow', `Speed ${D.slow}×`);
      ui.cls('m-read', 'on', rd); ui.cls('m-write', 'on', !rd); ui.cls('m-closed', 'on', !m.rowOpen); ui.cls('m-open', 'on', m.rowOpen);
      const miss = M.lpTimeline('read', false), hit = M.lpTimeline('read', true);
      ui.set('clk', `${M.lp.clkMHz} MHz, tCK ${M.lp.tck.toFixed(3)} ns`);
      ui.set('tmiss', `${miss.tEnd} clk = ${(miss.tEnd * M.lp.tck).toFixed(1)} ns`);
      ui.set('thit', `${hit.tEnd} clk = ${(hit.tEnd * M.lp.tck).toFixed(1)} ns`);
      ui.set('peak', `${M.lp.busGBs.toFixed(1)} GB/s`);
    },
    // ================================================================ UFS
    ufs(dt, refresh) {
      const u = D.ufs;
      const stg = ufsDur();
      const total = stg[stg.length - 1].d1 + 1.2;
      if (D.play) u.t = (u.t + dt * D.slow) % total;
      const t = Math.min(u.t, total - 1.2 - 0.001);
      let i = stg.findIndex((q) => t < q.d1);
      if (i < 0) i = stg.length - 1;
      const s = stg[i];
      const k = clamp((t - s.d0) / s.d, 0, 1);
      const bus = arc(8, 0);      // the memory bus (blue)
      const ufsL = arc(4, 1.5);   // the UFS serial link (purple)
      glow('soc', 0.3); glow('mcp', 0.3);
      const wr = u.write;
      if (s.id === 'sub') { if (k < 0.5) fx.train(bus, k * 2, 12, 5, '#2f7de1', 2.4, {follow: null}); else fx.train(ufsL, k * 2 - 1, 12, 5, '#7a5af0', 2.4, {follow: null}); glow('soc', 0.7); }
      else if (s.id === 'fetch') { fx.train(rev(bus), k, 12, 5, '#2f7de1', 2.4, {follow: null}); fx.train(ufsL, k, 12, 4, '#7a5af0', 2.4, {follow: null}); glow('mcp', 0.5); }
      else if (s.id === 'cmd') fx.train(ufsL, k, 12, 5, '#7a5af0', 2.4, {follow: null});
      else if (s.id === 'ftl') glow('mcp', 0.7 + 0.3 * Math.sin(S.T * 10));
      else if (s.id === 'nand' || s.id === 'prog') glow('mcp', 0.6 + 0.4 * Math.sin(S.T * 6) ** 2);
      else if (s.id === 'link') {
        const n = u.key === 'rand4k' ? 5 : 18;
        fx.flow(wr ? ufsL : rev(ufsL), n, 90, '#7a5af0', 2.1, {follow: null, jitter: 0.3});
        fx.flow(wr ? rev(bus) : bus, n, 90, '#1f9d62', 2.1, {follow: null, jitter: 0.3, seed: 0.4});
        glow('mcp', 0.8); glow('soc', 0.7);
      } else if (s.id === 'done') { fx.train(rev(ufsL), k, 10, 4, '#e5342b', 2.6, {follow: null}); glow('soc', 0.4 + 0.5 * k); }
      if (!refresh) return;
      const tot = stg[stg.length - 1].d1;
      ui.html('seg', seg(stg.map((q) => ({name: q.name, sub: q.us >= 1000 ? `${(q.us / 1000).toFixed(1)} ms` : `${q.us.toFixed(1)} µs`, w: q.d})), i, tot));
      ui.set('stext', s.text);
      ui.set('link', `HS-G3 × 2: ${M.ufs.rawGBs.toFixed(2)} GB/s raw, ${M.ufs.effGBs.toFixed(2)} after overhead`);
      const b = ufsS.bytes;
      ui.set('bytes', b >= 1073741824 ? '1 GiB' : b >= 1048576 ? '1 MiB' : '4 KiB');
      ui.set('ttot', ufsS.totalUs >= 1000 ? `${(ufsS.totalUs / 1000).toFixed(2)} ms` : `${ufsS.totalUs.toFixed(1)} µs`);
      ui.set('gbs', `${ufsS.gbs.toFixed(3)} GB/s`);
      ui.set('snote', u.key === 'file1g' ? 'A long transfer is limited by the link: setup time barely matters.' : wr ? 'Programming flash is slow; phones hide it with a fast write cache.' : 'A small read is limited by latency: the flash read dominates and the link sits idle.');
      ui.set('play', D.play ? '❚❚ Pause' : '▶ Play'); ui.set('slow', `Speed ${D.slow}×`);
      ui.cls('u-read', 'on', !wr); ui.cls('u-write', 'on', wr);
      for (const k2 of ['rand4k', 'seq1m', 'file1g']) ui.cls(`io-${k2}`, 'on', u.key === k2);
      const lanes = [0, 1].map((l) => {
        const on = s.id === 'link';
        return `<text x="0" y="${12 + l * 15}" font-size="8.5" fill="${C.mute}" font-weight="700">LANE ${l}</text><rect x="48" y="${5 + l * 15}" width="340" height="7" fill="#e5e7ea"/><rect x="48" y="${5 + l * 15}" width="${on ? 340 * k : 0}" height="7" fill="#7a5af0"/>`;
      }).join('');
      ui.html('lanes', lanes);
    },
  };

  const act = (a, v) => {
    if (a === 'dplay') D.play = !D.play;
    else if (a === 'drestart') { D.mem.t = 0; D.ufs.t = 0; D.cpu.c = 0; D.play = true; }
    else if (a === 'dslow') D.slow = (S.mode === 'cpu' ? [0.5, 1, 2, 4] : [0.5, 1, 2])[((S.mode === 'cpu' ? [0.5, 1, 2, 4] : [0.5, 1, 2]).indexOf(D.slow) + 1) % (S.mode === 'cpu' ? 4 : 3)] ?? 1;
    else if (a === 'cstep') { D.play = false; D.cpu.c = clamp(Math.floor(D.cpu.c) + Number(v), 0, PROGRAM.cycles - 1); }
    else if (a === 'work') D.work = v;
    else if (a === 'mrw') { D.mem.kind = v; memS = M.memSteps(v, D.mem.rowOpen); D.mem.t = 0; }
    else if (a === 'mrow') { D.mem.rowOpen = v === '1'; memS = M.memSteps(D.mem.kind, D.mem.rowOpen); D.mem.t = 0; }
    else if (a === 'urw') { D.ufs.write = v === 'write'; ufsS = M.ufsOp(D.ufs.key, D.ufs.write); D.ufs.t = 0; }
    else if (a === 'usz') { D.ufs.key = v; ufsS = M.ufsOp(v, D.ufs.write); D.ufs.t = 0; }
    else if (a === 'dseek') { const i = Number(v); if (S.mode === 'ram') D.mem.t = memS.steps[i].t0 + 0.01; else if (S.mode === 'ufs') D.ufs.t = ufsDur()[i].d0 + 0.01; D.play = true; }
    else return false;
    return true;
  };
  return {
    D, PROGRAM, act,
    enter() { D.mem.t = 0; D.ufs.t = 0; D.cpu.c = 0; D.play = true; D.slow = 1; D.acc = 1; },
    tick(mode, dt) {
      if (!modes[mode]) return;
      D.acc += dt;
      const refresh = D.acc > 0.06;
      if (refresh) D.acc = 0;
      modes[mode](dt, refresh);
    },
  };
}
