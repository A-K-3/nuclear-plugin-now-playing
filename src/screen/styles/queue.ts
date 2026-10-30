// Queue panel
import { R } from './root';

export default `
${R} .queue { position:relative; background:rgba(0,0,0,.32); backdrop-filter:blur(14px); border-left:1px solid var(--faint);
  display:flex; flex-direction:column; min-height:0; min-width:0; }
${R}.qcollapsed .queue { border-left-color:transparent; }
${R} .queue > * { min-width:240px; }
${R} .queue .resizer { position:absolute; left:-5px; top:0; bottom:0; width:10px; min-width:0; cursor:col-resize; z-index:2; }
${R} .queue .resizer::after { content:""; position:absolute; left:4px; top:0; bottom:0; width:2px; background:var(--accent); opacity:0; transition:opacity .2s; }
${R} .queue .resizer:hover::after, ${R} .app.resizing .resizer::after { opacity:.6; }
${R}.qcollapsed .queue .resizer { display:none; }
${R} .queue header { padding:20px 10px 10px 24px; display:flex; align-items:center; gap:6px; }
${R} .queue h2 { font-size:14px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--dim); }
${R} .queue header .count { flex:1; font-size:12.5px; color:var(--dim); font-variant-numeric:tabular-nums; text-align:right; padding-right:4px;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
${R} .queue header button { padding:4px; color:var(--dim); }
${R} .queue header button svg { width:20px; height:20px; }
${R} .queue header button.on { color:var(--accent); }
${R} .qbar { display:none; gap:8px; padding:0 14px 10px 24px; align-items:center; }
${R} .qbar.show { display:flex; }
${R} .qbar button { flex:none; padding:7px 12px; border-radius:8px; background:var(--accent); color:#000; font-size:13px; font-weight:600; opacity:1; }
${R} .list { position:relative; list-style:none; overflow-y:auto; padding:0 12px 24px; flex:1; scrollbar-width:thin; scrollbar-color:var(--faint) transparent;
  mask-image:linear-gradient(to bottom, transparent 0, #000 16px, #000 calc(100% - 40px), transparent 100%); }
${R} .list li { display:grid; grid-template-columns:46px 1fr auto; gap:12px; align-items:center; padding:7px 10px; border-radius:10px;
  cursor:pointer; position:relative; }
${R} .list li:hover { background:rgba(255,255,255,.07); }
${R} .list li.current { background:rgba(var(--tint),.45); box-shadow:inset 3px 0 0 var(--accent); }
${R} .list li.played { opacity:.4; }
${R} .list li.hidden { display:none; }
${R} .list li.dragging { opacity:.3; }
${R} .list li.drop-before::before, ${R} .list li.drop-after::after { content:""; position:absolute; left:8px; right:8px; height:2px;
  background:var(--accent); border-radius:2px; }
${R} .list li.drop-before::before { top:-1px; }
${R} .list li.drop-after::after { bottom:-1px; }
${R} .list img { width:46px; height:46px; border-radius:6px; object-fit:cover; background:var(--faint); }
${R} .list .t { min-width:0; }
${R} .list .t b, ${R} .list .t span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
${R} .list .t b { font-size:14.5px; font-weight:600; }
${R} .list .t span { font-size:12.5px; color:var(--dim); margin-top:3px; }
${R} .list mark { background:none; color:var(--accent); }
${R} .list .end { font-size:12.5px; color:var(--dim); font-variant-numeric:tabular-nums; position:relative; min-width:36px; text-align:right; }
${R} .list .x { position:absolute; right:-4px; top:50%; transform:translateY(-50%); padding:4px; opacity:0; }
${R} .list .x svg { width:16px; height:16px; }
${R} .list li:hover .x { opacity:.7; }
${R} .list li:hover .dur { visibility:hidden; }
${R} .list .err .t span { color:#ff8a80; }
${R} .list .empty-search { padding:20px 10px; color:var(--dim); font-size:14px; text-align:center; cursor:default; display:block; }
${R} .eq { display:inline-flex; gap:2px; align-items:flex-end; height:11px; margin-right:6px; }
${R} .eq i { width:3px; background:var(--accent); animation:npx-eq 1s ease-in-out infinite; }
${R} .eq i:nth-child(2) { animation-delay:-.4s; } ${R} .eq i:nth-child(3) { animation-delay:-.7s; }
${R}.paused .eq i { animation-play-state:paused; }
@keyframes npx-eq { 0%,100% { height:3px } 50% { height:11px } }
${R} .goto { position:absolute; left:50%; bottom:16px; transform:translate(-50%, 10px); opacity:0; pointer-events:none;
  display:flex; align-items:center; gap:6px; padding:7px 14px 7px 10px; border-radius:999px; min-width:0;
  background:var(--accent); color:#000; font-size:13px; font-weight:600; transition:opacity .25s, transform .25s; }
${R} .goto svg { width:16px; height:16px; }
${R} .goto.show { opacity:1; transform:translate(-50%, 0); pointer-events:auto; }
`;
