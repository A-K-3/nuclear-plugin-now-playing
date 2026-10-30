// Top bar (back, clock, buttons), quick settings panel, window controls and idle state
import { R } from './root';

export default `
${R} .back { position:absolute; top:16px; left:16px; display:flex; align-items:center; gap:8px; padding:8px 14px 8px 10px; z-index:3;
  border-radius:999px; background:rgba(0,0,0,.35); backdrop-filter:blur(8px); font-size:14px; font-weight:600; transition:opacity .4s; }
${R} .back svg { width:20px; height:20px; }
${R} .back:hover { background:rgba(0,0,0,.55); }
${R} .clock { position:absolute; top:18px; left:50%; transform:translateX(-50%); z-index:3; font-size:15px; font-weight:600;
  color:var(--dim); font-variant-numeric:tabular-nums; display:none; }
${R}.show-clock .clock { display:block; }
${R} .corner { position:absolute; top:14px; right:14px; display:flex; gap:2px; z-index:3; transition:opacity .4s; }
${R} .corner button svg { width:22px; height:22px; }
${R} .corner .on { color:var(--accent); }
${R} .corner .off { opacity:.4; }
/* Quick settings panel (gear button) */
${R} .settings-panel { position:absolute; top:58px; right:14px; z-index:4; width:330px; max-height:calc(100% - 80px); overflow-y:auto;
  padding:16px 18px; border-radius:18px; border:1px solid rgba(255,255,255,.14);
  background:linear-gradient(180deg, rgba(30,26,44,.82), rgba(16,14,24,.86)); backdrop-filter:blur(24px) saturate(1.5);
  box-shadow:0 24px 60px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.12); display:none; scrollbar-width:thin; }
${R}.show-settings .settings-panel { display:block; animation:npx-in .18s ease-out; }
${R}.show-settings .corner { opacity:1; }
${R} .settings-panel h3 { font-size:12px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--dim); margin-bottom:6px; }
${R} .srow { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 0; font-size:14px; }
${R} .srow + .srow { border-top:1px solid rgba(255,255,255,.06); }
${R} .srow.col { flex-direction:column; align-items:stretch; gap:8px; }
${R} .srow b { font-weight:600; color:var(--dim); font-variant-numeric:tabular-nums; }
${R} .switch { flex:none; width:38px; height:22px; padding:0; border-radius:999px; background:rgba(255,255,255,.16); opacity:1; }
${R} .switch::after { content:""; position:absolute; top:3px; left:3px; width:16px; height:16px; border-radius:50%; background:#fff;
  box-shadow:0 1px 4px rgba(0,0,0,.4); transition:transform .2s ease; }
${R} .switch.on { background:var(--accent); }
${R} .switch.on::after { transform:translateX(16px); background:#111; }
${R} .seg { display:flex; padding:3px; border-radius:10px; background:rgba(255,255,255,.08); }
${R} .seg button { padding:5px 10px; border-radius:8px; font-size:12.5px; opacity:.7; }
${R} .seg button.on { background:rgba(255,255,255,.16); opacity:1; color:var(--fg); }
${R} .blur-range { width:100%; accent-color:var(--accent); cursor:pointer; user-select:none; }

/* Window: the top strip drags Nuclear's window; buttons only when its custom title bar is hidden */
${R} .dragbar { position:absolute; top:0; left:0; right:0; height:48px; z-index:2; }
${R} .winctl { display:none; gap:2px; margin-left:6px; padding-left:6px; border-left:1px solid var(--faint); }
${R}.custom-titlebar .winctl { display:flex; }
${R}.custom-titlebar .corner [data-act="full"] { display:none; } /* the window buttons already maximize */
${R} .winctl .winclose:hover { color:#ff6b6b; }
${R}.idle { cursor:none; }
${R}.idle .corner, ${R}.idle .back { opacity:0; }
`;
