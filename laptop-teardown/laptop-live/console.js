// The overlay on the fixed 1600 x 900 stage: title and mode tabs on top, the component list on the left, the inspector
// on the right, a dock for the active visualisation and a control bar at the bottom, and callouts that sit on the
// 3D parts. Everything is plain DOM. Static skeletons are built once per mode; update() only changes text and a few
// styles, so a slider the visitor is dragging is never rebuilt under their finger.
import {CATALOG, GROUPS} from './data.js';
import {BOOT, DDR, LOADS, LOAD_KEYS, PROV, STAGES, ddr, pcie} from './model.js';

export const C = {ink: '#16181b', mute: '#6a7078', faint: '#c4c8cd', line: '#dfe2e6', panel: 'rgba(250,250,251,.95)', red: '#e5342b', blue: '#2f7de1', green: '#1f9d62', amber: '#d98a00', violet: '#7a5af0', teal: '#139e92', orange: '#f26a1b'};
export const MODES = [
  ['explore', 'EXPLORE'],
  ['power', 'POWER FLOW'],
  ['memory', 'CPU ↔ RAM'],
  ['storage', 'SSD → RAM'],
  ['cpu', 'CPU EXECUTES'],
  ['thermal', 'COOLING'],
  ['boot', 'BOOT'],
];
const dot = (c) => `<i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c};margin-right:7px;vertical-align:-1px"></i>`;
const leg = (items) => `<p>${items.map(([c, t]) => `${dot(c)}${t}`).join('<br>')}</p>`;
export const INTRO = {
  power: ['Follow the energy', `<p>Charger power enters at <b>20 V</b>, becomes the system rail <b>VSYS</b>, and is stepped down by regulators next to each chip. Power is voltage × current, so the same watts at about 1 V are tens of amps: look at the CPU rail.</p>${leg([['#ff9d1c', '20 V from the charger'], ['#ff7a18', 'VSYS, the battery voltage'], ['#f2c230', '5 V (fans, DIMM input)'], ['#19b8d4', '3.3 V (SSD, Wi-Fi)'], ['#ff4b6e', 'CPU and GPU core, about 1 V'], ['#3ddc84', 'DDR5 memory, 1.1 V']])}<p>Try <b>Gaming</b> with the <b>60 W</b> charger: the battery has to add the rest. Switch to <b>None</b> and the pack supplies everything.</p><p style="color:${C.mute}">Adapter + battery = system + charger loss, always. Load and efficiency figures are illustrative.</p>`],
  memory: ['One trip to memory', `<p>A load that misses every cache goes to DRAM. The memory controller sends <b>commands</b> on a small bus, waits for the DRAM array, then <b>16 data transfers</b> come back on 32 wires: exactly 64 bytes, one cache line.</p>${leg([['#2f7de1', 'command / address packet'], ['#1f9d62', 'read data coming back'], ['#f26a1b', 'write data going out']])}<p>The timing diagram uses the real DDR5-4800 numbers. The wait is mostly <b>tRP + tRCD + CL</b>: opening a row is the expensive part. Choose <b>Row open</b> to see a row hit.</p><p style="color:${C.mute}">The animation is slowed by a billion; the clock counts are real. Timings are the JEDEC DDR5-4800B grade.</p>`],
  storage: ['A file read, end to end', `<p>The CPU never copies the file. It leaves a 64-byte request in RAM, rings a doorbell, and the SSD does the rest: it looks up the flash page, reads and error-corrects it, then <b>pushes the data into RAM</b> over PCIe by DMA.</p>${leg([['#7a5af0', 'PCIe lanes to the SSD'], ['#2f7de1', 'command in RAM'], ['#1f9d62', 'file data on its way to DRAM'], ['#e5342b', 'interrupt: it is done']])}<p>Compare <b>4 KiB</b> with <b>1 GiB</b>: the small read is all latency, the big one is all bandwidth.</p><p style="color:${C.mute}">Stage times come from the model. The flash read time is illustrative.</p>`],
  cpu: ['Five stages, one clock', `<p>An instruction is <b>fetched</b>, <b>decoded</b>, <b>executed</b>, may touch <b>memory</b>, and is <b>written back</b>. While one executes, the next is already decoding: a pipeline.</p><p>The program adds four numbers from RAM. Watch for three things: a <b>load miss</b> that stalls the line for many cycles, a <b>load-use hazard</b>, and a <b>mispredicted branch</b> at the end of the loop.</p><p style="color:${C.mute}">A teaching model. Real cores run several instructions per cycle, out of order, with large branch predictors. The cache miss is shortened to 16 cycles for display.</p>`],
  thermal: ['Where the heat goes', `<p>Nearly every watt becomes heat. The <b>cold plate</b> collects it from the CPU and GPU, <b>heat pipes</b> carry it to the <b>fins</b>, and the <b>fans</b> push air through.</p>${leg([['#ff5a2a', 'steam carrying heat in the pipe'], ['#3b9bff', 'liquid returning (and cool air in)'], ['#ff9a52', 'warm exhaust air']])}<p>Parts are tinted by temperature. Choose <b>Stress</b> and speed the clock up: the fans climb, and at the limit the chips slow themselves down.</p><p style="color:${C.mute}">A lumped thermal model with illustrative parameters. Fan rotation is slowed on screen.</p>`],
  boot: ['Power button to desktop', `<p>The order is fixed by the hardware: a tiny always-on controller wakes first, the power rails come up in sequence, the CPU reads firmware from a flash chip, the firmware trains the memory, finds the devices and the boot disk, and hands over to the operating system.</p>${leg([['#ff9d1c', 'rails that are up'], ['#7a5af0', 'PCIe enumeration'], ['#1f9d62', 'kernel loaded from SSD to RAM']])}<p>Click a step in the strip to jump to it.</p><p style="color:${C.mute}">The sequence follows the x86 platform and UEFI phases; the durations are stretched for readability.</p>`],
};
export const TABS = [['does', 'FUNCTION'], ['works', 'HOW IT WORKS'], ['links', 'CONNECTIONS'], ['specs', 'SPECS']];

const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.ui *{box-sizing:border-box}
.pn{position:absolute;background:${C.panel};border:1px solid ${C.line};box-shadow:0 1px 3px rgba(20,22,26,.06);pointer-events:auto}
.mono{font-family:'JetBrains Mono',monospace}
.lcap{font-size:10.5px;font-weight:600;letter-spacing:1.3px;text-transform:uppercase;color:${C.mute};white-space:nowrap}
.b{font-weight:700}
.btn{pointer-events:auto;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;height:26px;padding:0 10px;border:1px solid ${C.line};background:#fff;color:${C.ink};font:600 10.5px Inter,sans-serif;letter-spacing:.9px;text-transform:uppercase;white-space:nowrap;user-select:none}
.btn:hover{background:#f2f3f5}
.btn.on{background:${C.ink};color:#fff;border-color:${C.ink}}
.btn.red{background:${C.red};color:#fff;border-color:${C.red}}
.btn.sm{height:22px;padding:0 7px;font-size:9.5px}
.btn.dis{opacity:.4;pointer-events:none}
.chip{display:inline-block;padding:1px 5px;font:700 8.5px 'JetBrains Mono',monospace;letter-spacing:.6px;color:#fff;vertical-align:middle}
.chip.STD{background:${C.green}}.chip.TYP{background:${C.amber}}.chip.ILL{background:${C.violet}}
.tabs{position:absolute;left:322px;top:14px;width:930px;display:flex;gap:4px;pointer-events:auto}
.tabs .btn{flex:1;height:32px;font-size:11px;letter-spacing:1.1px}
.ttl{position:absolute;left:20px;top:14px;pointer-events:none}
.ttl .tbar{width:36px;height:3px;background:${C.red};margin-bottom:7px}
.ttl h1{margin:0;font-size:21px;font-weight:700;letter-spacing:-.2px;line-height:1.1}
.ttl h1 span{color:${C.red}}
.ttl p{margin:5px 0 0;font-size:9.5px;font-weight:600;letter-spacing:1.2px;color:${C.mute};text-transform:uppercase;line-height:1.5}
.list{left:16px;top:92px;width:292px;height:792px;overflow:auto;padding:8px 0 10px}
.list::-webkit-scrollbar,.scr::-webkit-scrollbar{width:6px}
.list::-webkit-scrollbar-thumb,.scr::-webkit-scrollbar-thumb{background:#cfd3d8}
.list .g{padding:9px 14px 4px}
.list .it{display:flex;align-items:center;gap:8px;padding:5px 14px;cursor:pointer;font-size:12.5px;font-weight:500;border-left:3px solid transparent}
.list .it:hover{background:#f1f2f4}
.list .it.sel{background:#f4e9e8;border-left-color:${C.red};font-weight:700}
.list .it i{display:block;width:6px;height:6px;border-radius:50%;background:${C.faint};flex:none}
.list .it.sel i{background:${C.red}}
.insp{left:1268px;top:84px;width:316px;height:800px;display:flex;flex-direction:column}
.insp .head{padding:14px 16px 8px;border-bottom:1px solid ${C.line}}
.insp h2{margin:3px 0 4px;font-size:19px;line-height:1.15;font-weight:700;letter-spacing:-.2px}
.insp .sum{font-size:12.5px;line-height:1.45;color:#3a3f46}
.insp .live{padding:8px 16px;border-bottom:1px solid ${C.line};background:#f4f5f7;font-size:11.5px;line-height:1.5}
.insp .tb{display:flex;border-bottom:1px solid ${C.line}}
.insp .tb div{flex:auto;text-align:center;padding:8px 4px;font-size:8.6px;font-weight:700;letter-spacing:.4px;white-space:nowrap;color:${C.mute};cursor:pointer;border-bottom:2px solid transparent}
.insp .tb div.on{color:${C.ink};border-bottom-color:${C.red}}
.insp .body{flex:1;overflow:auto;padding:12px 16px 14px;font-size:12.5px;line-height:1.55;color:#2c3036}
.insp .body p{margin:0 0 10px}
.insp .body .lk{display:block;padding:7px 9px;margin:0 0 5px;border:1px solid ${C.line};background:#fff;cursor:pointer}
.insp .body .lk:hover{background:#f1f2f4;border-color:#c9cdd2}
.insp .body .lk b{display:block;font-size:12.5px}
.insp .body .lk span{font-size:11px;color:${C.mute}}
.insp .body table{width:100%;border-collapse:collapse;font-size:11.5px}
.insp .body td{padding:5px 0;border-bottom:1px solid ${C.line};vertical-align:top}
.insp .body td:first-child{color:${C.mute};width:34%;padding-right:8px}
.insp .act{display:flex;flex-wrap:wrap;gap:5px;padding:9px 16px 12px;border-top:1px solid ${C.line}}
.insp .inst{display:flex;gap:4px;margin-top:6px;flex-wrap:wrap}
.dock{left:322px;top:552px;width:930px;height:266px;padding:12px 16px}
.dock h3{margin:0;font-size:14px;font-weight:700;letter-spacing:.2px;display:inline}
.dock .chip{margin-left:7px}
.dock .lsub{font-size:11.5px;color:${C.mute};margin-left:10px}
.dock .lrow{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.ctl{position:absolute;left:322px;top:826px;width:930px;height:58px;padding:7px 14px;display:flex;gap:12px;align-items:center;overflow:hidden}
.ctl label{display:flex;flex-direction:column;gap:2px}
.ctl input[type=range],.dock input[type=range]{pointer-events:auto;width:150px;accent-color:${C.red};margin:0;height:16px}
.ctl .sep{width:1px;align-self:stretch;background:${C.line}}
.bar2{height:7px;background:#e5e7ea;position:relative}
.bar2 i{position:absolute;left:0;top:0;bottom:0;background:${C.red}}
.seg{display:flex;gap:2px;margin:8px 0 6px}
.seg div{flex:none;height:30px;display:flex;flex-direction:column;justify-content:center;padding:0 6px;font-size:9.5px;font-weight:700;letter-spacing:.6px;background:#eceef1;color:${C.mute};overflow:hidden;white-space:nowrap;cursor:pointer;border-top:3px solid transparent}
.seg div.on{background:${C.ink};color:#fff;border-top-color:${C.red}}
.seg div.done{background:#d9dde2;color:${C.ink}}
.seg div small{font-weight:500;font-size:8.5px;opacity:.75}
.note{font-size:11.5px;line-height:1.5;color:#2c3036}
.kv{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:11.5px}
.kv span:nth-child(odd){color:${C.mute}}
.callout{position:absolute;pointer-events:none;white-space:nowrap;font:600 11px/1.25 Inter,sans-serif;padding:3px 7px;background:#fff;border:1px solid ${C.ink};color:${C.ink};transform:translate(-50%,-100%);margin-top:-8px}
.callout small{display:block;font:500 9px 'JetBrains Mono',monospace;color:${C.mute};letter-spacing:.3px}
.tip{position:absolute;pointer-events:none;padding:4px 8px;background:${C.ink};color:#fff;font:600 11px Inter,sans-serif;white-space:nowrap;transform:translate(12px,12px)}
.tour{position:absolute;left:787px;top:54px;transform:translateX(-50%);display:flex;align-items:center;gap:7px;height:22px;padding:0 11px;border:1px solid ${C.line};background:rgba(255,255,255,.95);color:${C.ink};font:600 9.5px Inter,sans-serif;letter-spacing:1.2px;cursor:pointer;pointer-events:auto;white-space:nowrap}
.tour i{display:block;width:6px;height:6px;border-radius:50%;background:${C.red}}
.tour.on i{animation:blink 1.2s steps(2) infinite}
@keyframes blink{50%{opacity:.15}}
.flash{animation:fl .7s ease-out}
@keyframes fl{0%{box-shadow:0 0 0 0 rgba(229,52,43,.7)}100%{box-shadow:0 0 0 12px rgba(229,52,43,0)}}
.hint{position:absolute;left:322px;width:930px;text-align:center;font:600 10px Inter,sans-serif;letter-spacing:1.2px;color:#9aa0a8;text-transform:uppercase;pointer-events:none}
.rail{display:grid;grid-template-columns:104px 50px 54px 1fr 52px;gap:6px;align-items:center;font-size:11.5px;height:21px}
.rail .t{height:7px;background:#e5e7ea;position:relative}
.rail .t i{position:absolute;left:0;top:0;bottom:0}
.pipe{display:flex;gap:3px;margin:6px 0}
.pipe div{flex:1;min-width:0;height:44px;border:1px solid ${C.line};background:#fff;padding:4px 6px;font-size:10px;line-height:1.25;overflow:hidden}
.pipe div b{display:block;font-size:9px;letter-spacing:1px;color:${C.mute}}
.pipe div.st{background:#fff4d6;border-color:#e9c36a}
.pipe div.sq{background:#eceef1;color:#9aa0a8;text-decoration:line-through}
.pipe div.mi{background:#fde3e1;border-color:#e99a95}
.lprog div{padding:2px 6px;font-size:11px;white-space:nowrap;display:flex;gap:8px;border-left:3px solid transparent}
.lprog div.on{background:#f3e4e2;border-left-color:${C.red};font-weight:700}
.lprog span.tg{margin-left:auto;font-size:9.5px;color:${C.red};font-weight:700}
.regs{display:grid;grid-template-columns:repeat(4,1fr);gap:3px}
.regs div{border:1px solid ${C.line};background:#fff;padding:3px 5px;font-size:10.5px}
.regs div.ch{background:#fde3e1;border-color:#e99a95}
.regs div b{color:${C.mute};font-size:9px;display:block}
.log{background:#0e1114;color:#9fc3a6;padding:8px 10px;height:92px;overflow:hidden;font:500 10.5px/1.45 'JetBrains Mono',monospace;white-space:pre}
.chipr{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;letter-spacing:.6px;padding:2px 6px;border:1px solid ${C.line};background:#fff;color:${C.mute}}
.chipr.on{background:${C.green};border-color:${C.green};color:#fff}
@media (pointer:coarse){.btn{height:30px}.btn.sm{height:28px}}
`;

const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f1 = (x) => x.toFixed(1);
const chip = (t) => `<span class="chip ${t}" title="${PROV[t].note}">${t}</span>`;

// ------------------------------------------------------------------------------------------------ block diagram
export function diagramSvg(d) {
  if (!d) return '';
  const cols = d.cols || 4;
  const cw = 288 / cols;
  const bw = cw - 10;
  const bh = 36;
  const rows = Math.max(...d.nodes.map((n) => n[3])) + 1;
  const H = rows * 54 + 6;
  const pos = Object.fromEntries(d.nodes.map(([id, , c, r]) => [id, {x: c * cw + cw / 2, y: r * 54 + 6 + bh / 2}]));
  let s = `<svg viewBox="0 0 288 ${H}" width="288" height="${H}" style="display:block;margin:2px 0 10px"><defs><marker id="ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="${C.mute}"/></marker></defs>`;
  for (const [a, b] of d.edges) {
    const A = pos[a];
    const B = pos[b];
    if (!A || !B) continue;
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const l = Math.hypot(dx, dy) || 1;
    const ux = dx / l;
    const uy = dy / l;
    const ex = (Math.abs(ux) > 0.01 ? bw / 2 / Math.abs(ux) : 1e9);
    const ey = (Math.abs(uy) > 0.01 ? bh / 2 / Math.abs(uy) : 1e9);
    const t = Math.min(ex, ey) + 1;
    s += `<line x1="${(A.x + ux * t).toFixed(1)}" y1="${(A.y + uy * t).toFixed(1)}" x2="${(B.x - ux * (t + 3)).toFixed(1)}" y2="${(B.y - uy * (t + 3)).toFixed(1)}" stroke="${C.mute}" stroke-width="1.2" marker-end="url(#ar)"/>`;
  }
  for (const [id, label, c, r, tone] of d.nodes) {
    const p = pos[id];
    const lines = label.length > 12 ? (() => {
      const w = label.split(' ');
      let best = [label, ''];
      let bd = 99;
      for (let i = 1; i < w.length; i++) {
        const a = w.slice(0, i).join(' ');
        const b = w.slice(i).join(' ');
        const dd = Math.abs(a.length - b.length);
        if (dd < bd) {
          bd = dd;
          best = [a, b];
        }
      }
      return best;
    })() : [label, ''];
    s += `<rect x="${(p.x - bw / 2).toFixed(1)}" y="${(p.y - bh / 2).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh}" fill="${tone === 'a' ? '#fbe7e5' : '#fff'}" stroke="${tone === 'a' ? C.red : C.ink}" stroke-width="1.2"/>`;
    if (lines[1]) s += `<text x="${p.x.toFixed(1)}" y="${(p.y - 3).toFixed(1)}" font-size="9" font-weight="600" text-anchor="middle" fill="${C.ink}">${esc(lines[0])}</text><text x="${p.x.toFixed(1)}" y="${(p.y + 9).toFixed(1)}" font-size="9" font-weight="600" text-anchor="middle" fill="${C.ink}">${esc(lines[1])}</text>`;
    else s += `<text x="${p.x.toFixed(1)}" y="${(p.y + 3.2).toFixed(1)}" font-size="9" font-weight="600" text-anchor="middle" fill="${C.ink}">${esc(lines[0])}</text>`;
  }
  return s + '</svg>';
}

// ------------------------------------------------------------------------------------------------ docks
const loadChips = (act) => LOAD_KEYS.map((k) => `<div class="btn sm" data-act="${act}" data-v="${k}" data-k="load-${k}">${LOADS[k].name}</div>`).join('');
const DOCKS = {
  power: () => `
    <h3>Electrical power flow</h3>${chip("ILL")}<span class="lsub">Power = voltage × current. Watch where the amps go.</span>
    <div class="lrow" style="margin-top:9px"><span class="lcap">Load</span>${loadChips('load')}<span style="width:10px"></span><span class="lcap">Charger</span>
      <div class="btn sm" data-act="adapter" data-v="none" data-k="ad-none">None</div><div class="btn sm" data-act="adapter" data-v="w60" data-k="ad-w60">60 W</div><div class="btn sm" data-act="adapter" data-v="w100" data-k="ad-w100">100 W</div>
      <span style="width:10px"></span><span class="lcap">Battery</span><input type="range" min="5" max="100" value="60" data-in="soc" style="width:110px"><span class="mono" data-k="socv" style="font-size:11px;width:34px"></span></div>
    <div style="display:flex;gap:18px;margin-top:10px">
      <div style="width:272px"><div class="kv" style="font-size:12px">
        <span>USB-C in</span><span class="b" data-k="port"></span><span>Battery</span><span class="b" data-k="bat"></span><span>System (VSYS)</span><span class="b" data-k="sys"></span><span>Regulator loss</span><span data-k="loss"></span><span>Charger / PD loss</span><span data-k="closs"></span></div>
        <div class="note" style="margin-top:9px;color:${C.mute}" data-k="pnote"></div></div>
      <div style="flex:1"><div class="rail lcap" style="height:16px"><span>Rail</span><span>Volts</span><span>Amps</span><span>Power (output)</span><span style="text-align:right">Loss</span></div>
        ${['cpu', 'gpu', 'ram', 'ssd', 'wifi', 'disp', 'fan', 'misc'].map((k) => `<div class="rail" data-rail="${k}"><span data-k="rn-${k}"></span><span class="mono" data-k="rv-${k}"></span><span class="mono" data-k="ra-${k}"></span><span class="t"><i data-k="rb-${k}"></i></span><span class="mono" style="text-align:right;color:${C.mute}" data-k="rl-${k}"></span></div>`).join('')}</div>
    </div>`,
  memory: () => `
    <h3>CPU ↔ RAM</h3>${chip("STD")}${chip("TYP")}<span class="lsub">One cache-line access on DDR5-4800. Time is slowed; the clock counts are real.</span>
    <div class="lrow" style="margin-top:8px"><div class="btn sm" data-act="mrw" data-v="read" data-k="m-read">Read</div><div class="btn sm" data-act="mrw" data-v="write" data-k="m-write">Write</div><span style="width:8px"></span>
      <div class="btn sm" data-act="mrow" data-v="0" data-k="m-closed">Row closed</div><div class="btn sm" data-act="mrow" data-v="1" data-k="m-open">Row open</div><span style="width:8px"></span>
      <div class="btn sm red" data-act="play" data-k="play"></div><div class="btn sm" data-act="restart">⟲ Restart</div><div class="btn sm" data-act="slow" data-k="slow"></div></div>
    <div class="seg" data-k="seg"></div>
    <div style="display:flex;gap:16px"><svg data-k="mtl" width="590" height="104" style="flex:none"></svg>
      <div style="flex:1"><div class="note b" data-k="stext" style="min-height:62px"></div>
      <div class="kv" style="margin-top:4px"><span>Clock</span><span data-k="clk"></span><span>Row-miss read</span><span data-k="tmiss"></span><span>Row-hit read</span><span data-k="thit"></span><span>Peak, 1 module</span><span data-k="peak"></span></div></div></div>`,
  storage: () => `
    <h3>SSD → RAM</h3>${chip("STD")}${chip("ILL")}<span class="lsub">What happens when a program reads a file. Stage lengths shown are real model times.</span>
    <div class="lrow" style="margin-top:8px"><span class="lcap">Read</span><div class="btn sm" data-act="iosz" data-v="rand4k" data-k="io-rand4k">4 KiB random</div><div class="btn sm" data-act="iosz" data-v="seq1m" data-k="io-seq1m">1 MiB sequential</div><div class="btn sm" data-act="iosz" data-v="file1g" data-k="io-file1g">1 GiB file</div><span style="width:8px"></span>
      <div class="btn sm red" data-act="play" data-k="play"></div><div class="btn sm" data-act="restart">⟲ Restart</div><div class="btn sm" data-act="slow" data-k="slow"></div></div>
    <div class="seg" data-k="seg"></div>
    <div style="display:flex;gap:18px"><div style="flex:1"><div class="note b" data-k="stext" style="min-height:66px"></div>
      <svg data-k="lanes" width="400" height="58"></svg></div>
      <div style="width:300px"><div class="kv"><span>Link</span><span data-k="link"></span><span>Data moved</span><span data-k="bytes"></span><span>Total time</span><span class="b" data-k="ttot"></span><span>Throughput</span><span class="b" data-k="gbs"></span><span>DDR5 (2 modules)</span><span data-k="ddr"></span></div>
      <div class="note" style="margin-top:7px;color:${C.mute}" data-k="snote"></div></div></div>`,
  cpu: () => `
    <h3>CPU executes a program</h3>${chip("ILL")}<span class="lsub">A teaching pipeline, one clock cycle at a time. Real cores are wider, out of order, and far faster.</span>
    <div class="lrow" style="margin-top:8px"><div class="btn sm red" data-act="play" data-k="play"></div><div class="btn sm" data-act="cstep" data-v="-1">◀ Step</div><div class="btn sm" data-act="cstep" data-v="1">Step ▶</div><div class="btn sm" data-act="restart">⟲ Restart</div><div class="btn sm" data-act="slow" data-k="slow"></div>
      <span class="lcap" style="margin-left:10px">Cycle</span><span class="mono b" data-k="cyc"></span><span class="lcap" style="margin-left:8px">IPC so far</span><span class="mono b" data-k="ipc"></span></div>
    <div style="display:flex;gap:14px;margin-top:7px">
      <div class="lprog mono" data-k="prog" style="width:206px;flex:none"></div>
      <div style="flex:1;min-width:0"><div class="pipe" data-k="pipe"></div><div class="note b" data-k="ev" style="min-height:34px"></div>
        <div class="note" style="color:${C.mute};font-size:10.5px">Fetch → Decode → Execute → Memory → Write back. A load that misses the cache stalls everything behind it (miss shortened to ${16} cycles for display).</div></div>
      <div style="width:196px;flex:none"><div class="lcap" style="margin-bottom:4px">Registers</div><div class="regs" data-k="regs"></div><div class="lcap" style="margin:7px 0 3px">Memory 0x2000</div><div class="mono b" data-k="mem"></div></div></div>`,
  thermal: () => `
    <h3>Cooling and heat flow</h3>${chip("ILL")}<span class="lsub">Heat goes die → cold plate → heat pipes → fins → air. A lumped thermal model, parameters illustrative.</span>
    <div class="lrow" style="margin-top:8px"><span class="lcap">Load</span>${loadChips('load')}<span style="width:8px"></span><span class="lcap">Time</span>
      <div class="btn sm" data-act="warp" data-v="1" data-k="w-1">1×</div><div class="btn sm" data-act="warp" data-v="10" data-k="w-10">10×</div><div class="btn sm" data-act="warp" data-v="60" data-k="w-60">60×</div><div class="btn sm" data-act="cool">Cool down</div></div>
    <div style="display:flex;gap:16px;margin-top:8px"><div><svg data-k="chart" width="470" height="150"></svg><div class="lcap" style="margin-top:2px"><span style="color:${C.red}">■</span> CPU &nbsp;<span style="color:${C.violet}">■</span> GPU &nbsp;<span style="color:${C.orange}">■</span> Fins &nbsp;<span style="color:${C.blue}">■</span> SSD &nbsp;— 100 °C limit</div></div>
      <div style="flex:1"><div class="kv" style="font-size:12px"><span>CPU</span><span class="b" data-k="cpu"></span><span>GPU</span><span class="b" data-k="gpu"></span><span>Fans</span><span class="b" data-k="fan"></span><span>Heat to the cooler</span><span data-k="qin"></span><span>Heat out via fins</span><span data-k="qout"></span><span>Exhaust air</span><span data-k="exh"></span><span>Sim time</span><span data-k="tt"></span></div>
      <div class="note" style="margin-top:7px;color:${C.mute}" data-k="tnote"></div></div></div>`,
  boot: () => `
    <h3>Boot sequence</h3>${chip("STD")}${chip("ILL")}<span class="lsub">From the power button to the desktop. Time is stretched to be readable.</span>
    <div class="lrow" style="margin-top:8px"><div class="btn sm red" data-act="play" data-k="play"></div><div class="btn sm" data-act="bstep" data-v="-1">◀ Step</div><div class="btn sm" data-act="bstep" data-v="1">Step ▶</div><div class="btn sm" data-act="restart">⟲ Restart</div>
      <span style="width:8px"></span>${['aon', 'vsys', '5v', '3v3', 'ddr', 'core'].map((r) => `<span class="chipr" data-k="rl-${r}">${{aon: 'ALWAYS-ON', vsys: 'VSYS', '5v': '5 V', '3v3': '3.3 V', ddr: 'DDR5 1.1 V', core: 'CORE'}[r]}</span>`).join('')}</div>
    <div class="seg" data-k="seg" style="margin-top:6px"></div>
    <div style="display:flex;gap:16px"><div style="flex:1"><div class="b" style="font-size:13px" data-k="btitle"></div><div class="note" data-k="btext" style="margin-top:3px"></div></div><div class="log" data-k="log" style="width:360px;flex:none"></div></div>`,
};

// ------------------------------------------------------------------------------------------------ the console
export function createConsole(app) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const ui = el(`<div class="ui"></div>`);
  app.appendChild(ui);
  const add = (h) => {
    const n = el(h);
    ui.appendChild(n);
    return n;
  };
  add(`<div class="ttl"><div class="tbar"></div><h1>Laptop <span>·</span> Teardown</h1><p>14-inch-class reference · illustrative, not a product</p></div>`);
  const tabs = add(`<div class="tabs">${MODES.map(([k, n]) => `<div class="btn" data-act="mode" data-v="${k}" data-k="mode-${k}">${n}</div>`).join('')}</div>`);
  const tour = add(`<div class="tour" data-act="tour"></div>`);

  // component list
  const list = add(`<div class="pn list scr"></div>`);
  list.innerHTML = GROUPS.map(([g, ids]) => `<div class="g lcap">${g}</div>${ids.map((id) => `<div class="it" data-act="pick" data-v="${id}" data-k="it-${id}"><i></i>${CATALOG[id].name}</div>`).join('')}`).join('');

  // inspector
  const insp = add(`<div class="pn insp"></div>`);
  const welcome = `<div class="head"><div class="lcap">Reference laptop</div><h2>Take it apart</h2><div class="sum">Click a part in the 3D view or in the list. Drag the <b>Explode</b> slider to peel the machine apart, layer by layer.</div></div>
    <div class="body scr"><p><b>Everything here is a generic, illustrative laptop.</b> The shapes follow typical 14-inch layouts. Numbers are tagged:</p>
    <p>${chip('STD')} fixed by a published standard or by physics<br>${chip('TYP')} typical of laptops like this; real ones differ<br>${chip('ILL')} an illustrative parameter chosen so the behaviour is visible</p>
    <p>The six visualisations above run on one model: change the load, the charger or the cooling and every panel and every particle follows.</p>
    <p style="color:${C.mute}">Drag to orbit · wheel to zoom · right-drag or Shift-drag to pan · H hides the overlay.</p></div>`;
  insp.innerHTML = welcome;

  const dock = add(`<div class="pn dock" style="display:none"></div>`);
  const ctl = add(`<div class="pn ctl">
    <label><span class="lcap">Explode <span class="mono" data-k="exv" style="color:${C.ink}"></span></span><input type="range" min="0" max="100" value="0" data-in="explode" style="width:150px"></label>
    <label><span class="lcap">Lid <span class="mono" data-k="lidv" style="color:${C.ink}"></span></span><input type="range" min="0" max="120" value="105" data-in="lid" style="width:96px"></label>
    <div class="sep"></div>
    <div style="display:flex;gap:5px"><div class="btn sm" data-act="take" data-k="take">Take apart</div><div class="btn sm" data-act="xray" data-k="xray">Top case off</div><div class="btn sm" data-act="iso" data-k="isoBtn">Isolate</div></div>
    <div class="sep"></div>
    <div style="display:flex;gap:5px"><div class="btn sm" data-act="view" data-v="iso">3/4</div><div class="btn sm" data-act="view" data-v="top">Top</div><div class="btn sm" data-act="view" data-v="front">Front</div><div class="btn sm" data-act="view" data-v="back">Rear</div></div>
    <div style="flex:1"></div><div class="btn sm" data-act="qual" data-k="qual" title="Rendering quality. Starts in the middle for integrated GPUs and steps down by itself if frames are slow."></div></div>`);
  const hint = add(`<div class="hint" style="top:66px;display:none" data-k="hint"></div>`);
  const lines = add(`<svg style="position:absolute;inset:0;overflow:visible;pointer-events:none" width="1600" height="900"></svg>`);
  const calls = add(`<div style="position:absolute;inset:0;pointer-events:none"></div>`);
  const tip = add(`<div class="tip" style="display:none"></div>`);
  const flashRing = add(`<div style="position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:2px solid ${C.red};opacity:0;pointer-events:none"></div>`);

  // text cache so we only touch the DOM when something changed
  const cache = new Map();
  let nodes = null;
  const index = () => {
    nodes = new Map();
    for (const n of ui.querySelectorAll('[data-k]')) nodes.set(n.dataset.k, n);
  };
  index();
  const api = {
    root: ui, tabs, list, insp, dock, ctl, tip, calls, lines, flashRing,
    /** set text of [data-k=key] */
    set(k, v) {
      const n = nodes.get(k);
      if (!n) return;
      if (cache.get(k) === v) return;
      cache.set(k, v);
      n.textContent = v;
    },
    html(k, h) {
      const n = nodes.get(k);
      if (!n) return;
      if (cache.get(k) === h) return;
      cache.set(k, h);
      n.innerHTML = h;
    },
    attr(k, a, v) {
      const n = nodes.get(k);
      if (!n) return;
      const key = `${k}@${a}`;
      if (cache.get(key) === v) return;
      cache.set(key, v);
      if (a === 'style') n.style.cssText = v;
      else n.setAttribute(a, v);
    },
    cls(k, c, on) {
      const n = nodes.get(k);
      if (n) n.classList.toggle(c, !!on);
    },
    node: (k) => nodes.get(k),
    setMode(mode) {
      const has = !!DOCKS[mode];
      dock.style.display = has ? '' : 'none';
      dock.innerHTML = has ? DOCKS[mode]() : '';
      for (const k of [...cache.keys()]) if (!/^(exv|lidv|take|xray|isoBtn|qual|it-|mode-)/.test(k)) cache.delete(k);
      index();
      hint.style.display = mode === 'explore' ? '' : 'none';
      ui.dataset.mode = mode;
    },
    flash(x, y) {
      flashRing.style.left = `${x}px`;
      flashRing.style.top = `${y}px`;
      flashRing.style.transition = 'none';
      flashRing.style.opacity = '.9';
      flashRing.style.transform = 'scale(.4)';
      requestAnimationFrame(() => {
        flashRing.style.transition = 'opacity .6s, transform .6s';
        flashRing.style.opacity = '0';
        flashRing.style.transform = 'scale(1.5)';
      });
    },
    spot(sel) {
      const n = ui.querySelector(sel);
      if (!n) return null;
      const r = n.getBoundingClientRect();
      const a = app.getBoundingClientRect();
      const k = a.width / 1600;
      return [(r.left + r.width / 2 - a.left) / k, (r.top + r.height / 2 - a.top) / k];
    },
    /** Welcome or the inspector for one catalog entry. */
    inspect(id, tab, extra = {}) {
      if (!id) {
        const it = extra.mode && INTRO[extra.mode];
        insp.innerHTML = it ? `<div class="head"><div class="lcap">${MODES.find((m) => m[0] === extra.mode)[1]}</div><h2>${it[0]}</h2></div><div class="body scr">${it[1]}<p style="color:${C.mute};font-size:11px">Click any part to inspect it.</p></div>` : welcome;
        index();
        return;
      }
      const e = CATALOG[id];
      const tabs2 = TABS.map(([k, n]) => `<div class="${k === tab ? 'on' : ''}" data-act="tab" data-v="${k}">${n}</div>`).join('');
      let body = '';
      if (tab === 'does') body = `<p>${esc(e.does)}</p>${e.summary ? `<p class="lcap" style="white-space:normal">${esc(e.summary)}</p>` : ''}${e.layers ? `<p style="color:${C.mute}">${esc(e.layers)} Use <b>Open up</b> below.</p>` : ''}`;
      else if (tab === 'works') body = `${diagramSvg(e.inside)}${e.works.map((t) => `<p>${esc(t)}</p>`).join('')}`;
      else if (tab === 'links') body = `<p style="color:${C.mute};font-size:11.5px">Lines in the 3D view show these links. Click one to go there.</p>${e.links.map(([to, via]) => `<div class="lk" data-act="pick" data-v="${to}"><b>${esc(CATALOG[to]?.name || to)}</b><span>${esc(via)}</span></div>`).join('')}`;
      else body = `<table>${e.specs.map(([k, v, t]) => `<tr><td>${esc(k)}</td><td>${esc(v)} ${chip(t)}</td></tr>`).join('')}</table><p style="margin-top:10px;color:${C.mute};font-size:11px">${chip('STD')} standard or physics &nbsp;${chip('TYP')} typical class &nbsp;${chip('ILL')} illustrative</p>`;
      const inst = extra.parts && extra.parts.length > 1 ? `<div class="inst">${extra.parts.map((p, i) => `<div class="btn sm ${p === extra.part ? 'on' : ''}" data-act="part" data-v="${p}">${extra.partNames?.[i] || p}</div>`).join('')}</div>` : '';
      insp.innerHTML = `<div class="head"><div class="lcap">${e.group}</div><h2>${esc(e.name)}</h2><div class="sum">${esc(e.summary)}</div>${inst}</div>
        <div class="live" data-k="live" style="display:none"></div>
        <div class="tb">${tabs2}</div><div class="body scr">${body}</div>
        <div class="act"><label style="display:flex;flex-direction:column;gap:2px;flex:1;min-width:140px"><span class="lcap">Open up</span><input type="range" min="0" max="100" value="${Math.round((extra.open || 0) * 100)}" data-in="open" ${e.layers ? '' : 'disabled'} style="width:100%;pointer-events:auto"></label>
        <div class="btn sm ${extra.pulled ? 'on' : ''}" data-act="pull">${extra.pulled ? 'Put back' : 'Pull out'}</div><div class="btn sm" data-act="focus">Focus</div></div>`;
      index();
      cache.delete('live');
    },
    markList(sel, hover) {
      for (const n of list.querySelectorAll('.it')) n.classList.toggle('sel', n.dataset.v === sel);
    },
    callouts(items) {
      let h = '';
      let s = '';
      for (const c of items) {
        h += `<div class="callout" style="left:${c.x.toFixed(1)}px;top:${c.y.toFixed(1)}px;${c.tone ? `border-color:${c.tone};` : ''}">${c.text}${c.sub ? `<small>${c.sub}</small>` : ''}</div>`;
        if (c.from) s += `<line x1="${c.from[0].toFixed(1)}" y1="${c.from[1].toFixed(1)}" x2="${c.x.toFixed(1)}" y2="${c.y.toFixed(1)}" stroke="${c.tone || C.ink}" stroke-width="1.2" ${c.dash ? 'stroke-dasharray="4 3"' : ''}/><circle cx="${c.from[0].toFixed(1)}" cy="${c.from[1].toFixed(1)}" r="3" fill="${c.tone || C.ink}"/>`;
      }
      if (cache.get('callh') !== h) {
        cache.set('callh', h);
        calls.innerHTML = h;
      }
      if (cache.get('calls') !== s) {
        cache.set('calls', s);
        lines.innerHTML = s;
      }
    },
  };
  return api;
}

export {BOOT, DDR, STAGES, ddr, pcie, f1};
