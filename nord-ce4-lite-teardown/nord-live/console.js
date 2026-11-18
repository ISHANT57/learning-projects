// The overlay on the fixed 1600 x 900 stage: part list on the left, inspector on the right, a control bar at the bottom,
// provenance legend on top. Plain DOM; text is escaped before it goes into HTML.
import {CATALOG, COMPARE, GROUPS, PROV} from './data.js';

export const C = {ink: '#16181b', mute: '#6a7078', line: '#dfe2e6', red: '#e5342b', blue: '#2f7de1'};
export const TABS = [['what', 'WHAT'], ['how', 'HOW'], ['links', 'LINKS'], ['learn', 'LEARN'], ['specs', 'SPECS'], ['yours', 'YOUR PHONE']];
export const ROADMAP = [
  ['1', 'Exterior and exploded view', 'built'], ['2', 'Internal components and motherboard', 'built'], ['3', 'CPU, RAM and storage demonstrations', 'planned'],
  ['4', 'Battery and charging', 'planned'], ['5', 'Camera, display and sensors', 'planned'], ['6', 'Networking and communication', 'planned'], ['7', 'Android boot and app execution', 'planned'],
];
export const DEMOS = ['Power-on and Android boot', 'Snapdragon CPU execution', 'CPU-to-RAM communication', 'UFS read and write', 'Touchscreen input', 'Camera capture and processing', 'Wi-Fi and 5G', 'GPS positioning', 'Battery charging and power management', 'Heat and thermal management', 'Rendering and displaying a frame'];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const tag = (t) => `<span class="pv" style="background:${PROV[t][2]}" title="${esc(PROV[t][1])}">${PROV[t][0]}</span>`;

const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased}
.ui{position:absolute;inset:0;pointer-events:none}.ui *{box-sizing:border-box}
.pn{position:absolute;background:rgba(250,250,251,.95);border:1px solid ${C.line};box-shadow:0 1px 3px rgba(20,22,26,.06);pointer-events:auto}
.lcap{font-size:10.5px;font-weight:600;letter-spacing:1.3px;text-transform:uppercase;color:${C.mute};white-space:nowrap}
.btn{pointer-events:auto;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;height:24px;padding:0 9px;border:1px solid ${C.line};background:#fff;color:${C.ink};font:600 9.8px Inter,sans-serif;letter-spacing:.8px;text-transform:uppercase;white-space:nowrap;user-select:none}
.btn:hover{background:#f2f3f5}.btn.on{background:${C.ink};color:#fff;border-color:${C.ink}}
.pv{display:inline-block;padding:1px 5px;font:700 8.5px 'JetBrains Mono',monospace;letter-spacing:.5px;color:#fff;vertical-align:middle;margin-left:6px}
.ttl{position:absolute;left:20px;top:14px;pointer-events:none}.ttl .tbar{width:36px;height:3px;background:${C.red};margin-bottom:7px}
.ttl h1{margin:0;font-size:20px;font-weight:700;line-height:1.1}.ttl h1 span{color:${C.red}}
.ttl p{margin:5px 0 0;font-size:9.5px;font-weight:600;letter-spacing:1.1px;color:${C.mute};text-transform:uppercase}
.top{position:absolute;left:322px;top:14px;width:930px;display:flex;gap:4px;pointer-events:auto}.top .btn{flex:1;height:30px;font-size:10.5px}
.legend{position:absolute;left:322px;top:52px;width:930px;text-align:center;pointer-events:auto;font-size:10px;color:${C.mute}}
.list{left:16px;top:92px;width:292px;height:792px;overflow:auto;padding:8px 0 10px}
.list .g{padding:9px 14px 4px}.list .it{display:flex;align-items:center;gap:8px;padding:5px 14px;cursor:pointer;font-size:12.5px;font-weight:500;border-left:3px solid transparent}
.list .it:hover{background:#f1f2f4}.list .it.sel{background:#f4e9e8;border-left-color:${C.red};font-weight:700}
.list .it i{display:block;width:6px;height:6px;border-radius:50%;background:#c4c8cd;flex:none}.list .it.sel i{background:${C.red}}
.insp{left:1268px;top:84px;width:316px;height:800px;display:flex;flex-direction:column}
.insp .head{padding:14px 16px 8px;border-bottom:1px solid ${C.line}}.insp h2{margin:3px 0 4px;font-size:18px;line-height:1.15;font-weight:700}
.insp .sum{font-size:12.5px;line-height:1.45;color:#3a3f46}
.insp .tb{display:flex;border-bottom:1px solid ${C.line}}.insp .tb div{flex:auto;text-align:center;padding:8px 3px;font-size:8.3px;font-weight:700;letter-spacing:.3px;white-space:nowrap;color:${C.mute};cursor:pointer;border-bottom:2px solid transparent}
.insp .tb div.on{color:${C.ink};border-bottom-color:${C.red}}
.insp .body{flex:1;overflow:auto;padding:12px 16px 14px;font-size:12.5px;line-height:1.55;color:#2c3036}
.insp .body p{margin:0 0 10px}.insp .body h4{margin:12px 0 4px;font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:${C.mute}}
.insp .body .lk{display:block;padding:7px 9px;margin:0 0 5px;border:1px solid ${C.line};background:#fff;cursor:pointer}.insp .body .lk:hover{background:#f1f2f4}
.insp .body .lk b{display:block}.insp .body .lk span{font-size:11px;color:${C.mute}}
.insp .body table{width:100%;border-collapse:collapse;font-size:11.5px}.insp .body td{padding:5px 0;border-bottom:1px solid ${C.line};vertical-align:top}.insp .body td:first-child{color:${C.mute};width:30%;padding-right:8px}
.insp .act{display:flex;gap:5px;padding:9px 16px 12px;border-top:1px solid ${C.line}}
.qa{border:1px solid ${C.line};background:#fff;margin:0 0 6px;padding:7px 9px;cursor:pointer}.qa b{font-size:12px}.qa div{display:none;margin-top:5px;font-size:11.8px;color:#3a3f46}.qa.open div{display:block}
.ctl{left:322px;top:826px;width:930px;height:58px;padding:7px 12px;display:flex;gap:8px;align-items:center;overflow:hidden}
.ctl label{display:flex;flex-direction:column;gap:2px}.ctl input[type=range]{pointer-events:auto;width:170px;accent-color:${C.red};margin:0;height:16px}
.ctl .sep{width:1px;align-self:stretch;background:${C.line}}.row{display:flex;gap:5px}
.callout{position:absolute;pointer-events:none;white-space:nowrap;font:600 11px/1.25 Inter,sans-serif;padding:3px 7px;background:#fff;border:1px solid ${C.blue};color:${C.ink};transform:translate(-50%,-100%);margin-top:-8px}
.tip{position:absolute;pointer-events:none;padding:4px 8px;background:${C.ink};color:#fff;font:600 11px Inter,sans-serif;white-space:nowrap;transform:translate(12px,12px)}
.hint{position:absolute;left:322px;width:930px;top:800px;text-align:center;font:600 10px Inter,sans-serif;letter-spacing:1.2px;color:#9aa0a8;text-transform:uppercase;pointer-events:none}
.cmp td:nth-child(2),.cmp td:nth-child(3){width:38%}
`;

const el = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstElementChild; };

export function createConsole(app) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const ui = el('<div class="ui"></div>');
  app.appendChild(ui);
  const add = (h) => { const n = el(h); ui.appendChild(n); return n; };
  add(`<div class="ttl"><div class="tbar"></div><h1>Phone <span>·</span> Teardown</h1><p>Reference: Nord (2020) · yours: Nord CE4 Lite 5G</p></div>`);
  add(`<div class="top"><div class="btn on" data-act="info" data-v="home">Explore</div><div class="btn" data-act="info" data-v="compare">Reference vs your phone</div><div class="btn" data-act="info" data-v="roadmap">Roadmap and demos</div></div>`);
  add(`<div class="legend">${['DOC', 'TD', 'APX', '3RD', 'STD', 'CALC', 'ILL', 'UNK'].map((t) => tag(t)).join('')} &nbsp; hover a tag · <b style="color:#7a5af0">violet parts</b> are illustrative placements</div>`);
  const list = add('<div class="pn list"></div>');
  list.innerHTML = GROUPS.map(([g, ids]) => `<div class="g lcap">${g}</div>${ids.map((id) => `<div class="it" data-act="pick" data-v="${id}" data-id="${id}"><i></i>${esc(CATALOG[id].name)}</div>`).join('')}`).join('');
  const insp = add('<div class="pn insp"></div>');
  const ctl = add(`<div class="pn ctl">
    <label><span class="lcap">Explode <b data-k="exv" style="color:${C.ink}"></b></span><input type="range" min="0" max="100" value="0" data-in="explode" style="width:80px"></label>
    <div class="sep"></div>
    <div class="row"><div class="btn" data-act="back" data-k="back">Back off</div><div class="btn" data-act="disp" data-k="disp">Screen off</div><div class="btn" data-act="xray" data-k="xray">X-ray</div><div class="btn" data-act="iso" data-k="iso">Isolate</div><div class="btn on" data-act="ill" data-k="ill">Illustrative</div></div>
    <div class="sep"></div>
    <div class="row"><div class="btn" data-act="view" data-v="front">Front</div><div class="btn" data-act="view" data-v="back">Back</div><div class="btn" data-act="view" data-v="iso">3/4</div><div class="btn" data-act="view" data-v="side">Side</div><div class="btn" data-act="spin" data-k="spin">Spin</div></div>
    <div style="flex:1"></div><div class="btn" data-act="qual" data-k="qual"></div></div>`);
  const hint = add('<div class="hint"></div>');
  const lines = add('<svg style="position:absolute;inset:0;overflow:visible;pointer-events:none" width="1600" height="900"></svg>');
  const calls = add('<div style="position:absolute;inset:0;pointer-events:none"></div>');
  const tip = add('<div class="tip" style="display:none"></div>');
  const keys = {};
  for (const n of ui.querySelectorAll('[data-k]')) keys[n.dataset.k] = n;
  const cache = {};
  const set = (k, v) => { if (cache[k] !== v && keys[k]) { cache[k] = v; keys[k].textContent = v; } };
  const cls = (k, c, on) => keys[k] && keys[k].classList.toggle(c, !!on);

  const welcome = `<div class="head"><div class="lcap">Phone teardown</div><h2>Take the phone apart</h2><div class="sum">Click a part in the 3D view or the list. Drag <b>Explode</b> to peel the phone apart, or take the back cover or display off on their own.</div></div>
    <div class="body"><p><b>The internals come from a real teardown of a different phone.</b> There is no public teardown of the Nord CE4 Lite 5G. The 3D board, chips and layout are traced from iFixit's OnePlus Nord (2020) photos. The <b>Your phone</b> tab on each part says what is documented for your Nord CE4 Lite 5G.</p>
    <p>Every fact is tagged: documented, from the teardown, approximate, third-party, standard, calculated, illustrative or unknown.</p>
    <p style="color:${C.mute}">Drag to orbit · wheel to zoom · right-drag to pan · H hides the overlay.</p></div>`;
  const headOf = (e) => `<div class="lcap">${esc(e.group)}</div><h2>${esc(e.name)}</h2><div class="sum">${esc(e.summary)}</div>`;

  const api = {
    root: ui, tip, set, cls, keys,
    info(kind) {
      for (const b of ui.querySelectorAll('.top .btn')) b.classList.toggle('on', b.dataset.v === kind);
      if (kind === 'compare') {
        insp.innerHTML = `<div class="head"><div class="lcap">Why two phones</div><h2>Reference vs your phone</h2><div class="sum">The model uses the Nord (2020) teardown. Your phone's documented specs are on the right.</div></div><div class="body"><table class="cmp">${COMPARE.map(([k, a, ta, b, tb]) => `<tr><td>${esc(k)}</td><td>${esc(a)}${tag(ta)}</td><td>${esc(b)}${tag(tb)}</td></tr>`).join('')}</table></div>`;
      } else if (kind === 'roadmap') {
        insp.innerHTML = `<div class="head"><div class="lcap">Plan</div><h2>Roadmap and demos</h2></div><div class="body"><h4>Phases</h4>${ROADMAP.map(([n, t, s]) => `<p><b>${n}.</b> ${esc(t)} ${s === 'built' ? '<span class="pv" style="background:#1f7a4d">BUILT</span>' : '<span class="pv" style="background:#8a8f97">PLANNED</span>'}</p>`).join('')}<h4>The eleven demonstrations (planned)</h4>${DEMOS.map((d, i) => `<p style="margin:0 0 4px">${i + 1}. ${esc(d)}</p>`).join('')}<p style="margin-top:10px;color:${C.mute}">All demos will be conceptual models built on documented numbers and tagged illustrative. None measures your phone.</p><p style="color:${C.mute}">These demonstrations are for the <b>phone</b>. The laptop (separate project, <b>laptop-teardown</b>) already has its six: power flow, CPU and RAM, SSD to RAM, CPU execution, cooling and boot.</p></div>`;
      } else insp.innerHTML = welcome;
    },
    inspect(id, tab, extra = {}) {
      const e = CATALOG[id];
      const t = TABS.map(([k, n]) => `<div class="${k === tab ? 'on' : ''}" data-act="tab" data-v="${k}">${n}</div>`).join('');
      let body = '';
      if (tab === 'what') body = `<p>${esc(e.what)}</p><h4>Why it exists</h4><p>${esc(e.why)}</p><h4>When it fails</h4><p>${esc(e.fails)}</p><h4>Practical example</h4><p>${esc(e.example)}</p>`;
      else if (tab === 'how') body = e.how.map((p) => `<p>${esc(p)}</p>`).join('');
      else if (tab === 'links') body = `<p style="color:${C.mute};font-size:11.5px">Lines and moving dots in 3D show these links (dots are illustrative). Click one to go there.</p>${e.links.map(([to, via]) => `<div class="lk" data-act="pick" data-v="${to}"><b>${esc(CATALOG[to]?.name || to)}</b><span>${esc(via)}</span></div>`).join('')}`;
      else if (tab === 'learn') body = `<h4>Concepts this touches</h4>${e.concepts.map(([d, t2]) => `<p style="margin:0 0 6px"><b>${esc(d)}:</b> ${esc(t2)}</p>`).join('')}<h4>Interview questions (click to reveal)</h4>${e.qa.map(([q, a]) => `<div class="qa" data-act="qa"><b>${esc(q)}</b><div>${esc(a)}</div></div>`).join('')}`;
      else if (tab === 'specs') body = `<table>${e.specs.map(([k, v, tg]) => `<tr><td>${esc(k)}</td><td>${esc(v)}${tag(tg)}</td></tr>`).join('')}</table>`;
      else body = `<p><b>On your Nord CE4 Lite 5G</b>${tag(e.yours[1])}</p><p>${esc(e.yours[0])}</p><p style="color:${C.mute};font-size:11.5px">This part is drawn from the reference phone. This note says what is known about yours.</p>`;
      const inst = extra.parts && extra.parts.length > 1 ? `<div class="row" style="margin-top:6px;flex-wrap:wrap">${extra.parts.map((p) => `<div class="btn ${p === extra.part ? 'on' : ''}" data-act="part" data-v="${p}">${esc(extra.names[p] || p)}</div>`).join('')}</div>` : '';
      insp.innerHTML = `<div class="head">${headOf(e)}${inst}</div><div class="tb">${t}</div><div class="body">${body}</div><div class="act"><div class="btn ${extra.pulled ? 'on' : ''}" data-act="pull">${extra.pulled ? 'Put back' : 'Pull out'}</div><div class="btn" data-act="focus">Focus</div><div class="btn" data-act="clear">Deselect</div></div>`;
    },
    mark(entry) { for (const n of list.querySelectorAll('.it')) n.classList.toggle('sel', n.dataset.id === entry); },
    callouts(items) {
      const h = items.map((c) => `<div class="callout" style="left:${c.x.toFixed(1)}px;top:${c.y.toFixed(1)}px">${esc(c.text)}</div>`).join('');
      const s = items.map((c) => `<line x1="${c.from[0].toFixed(1)}" y1="${c.from[1].toFixed(1)}" x2="${c.x.toFixed(1)}" y2="${c.y.toFixed(1)}" stroke="${C.blue}" stroke-width="1.2" stroke-dasharray="4 3"/><circle cx="${c.from[0].toFixed(1)}" cy="${c.from[1].toFixed(1)}" r="3" fill="${C.blue}"/>`).join('');
      if (cache.callh !== h) { cache.callh = h; calls.innerHTML = h; }
      if (cache.calls !== s) { cache.calls = s; lines.innerHTML = s; }
    },
    hint(t) { set('hint', t); hint.textContent = t; },
  };
  insp.innerHTML = welcome;
  return api;
}
