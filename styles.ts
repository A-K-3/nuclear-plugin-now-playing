// Styles for the Now Playing screen (scoped under #npx-root so Nuclear is not affected)
export const ROOT_ID = 'npx-root';
export const BTN_ID = 'npx-open';

const R = `#${ROOT_ID}`;

export const CSS = `
${R} { --fg:#fff; --dim:rgba(255,255,255,.62); --faint:rgba(255,255,255,.13); --accent:#fff; --tint:40,40,48; --blur:80px;
  position:fixed; inset:0; z-index:2147483000; background:#000; color:var(--fg); overflow:hidden;
  font-family:"Segoe UI",Arial,sans-serif; -webkit-font-smoothing:antialiased; user-select:none; display:none; }
${R}.open { display:block; animation:npx-in .25s ease-out; }
@keyframes npx-in { from { opacity:0 } to { opacity:1 } }
${R} * { box-sizing:border-box; margin:0; padding:0; }
${R} button { background:none; border:0; color:var(--fg); cursor:pointer; padding:6px; opacity:.85; position:relative;
  transition:opacity .2s, transform .1s, color .2s; font:inherit; }
${R} button:hover { opacity:1; }
${R} button:active { transform:scale(.92); }
${R} button:focus { outline:none; }
${R} button:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
${R} button svg { width:32px; height:32px; display:block; fill:currentColor; }
${R} input { font:inherit; color:var(--fg); background:rgba(255,255,255,.08); border:1px solid var(--faint); border-radius:8px;
  padding:7px 10px; outline:none; width:100%; user-select:text; }
${R} input:focus { border-color:var(--accent); }

/* Background: blurred artwork (optionally animated) + tint + vignette */
${R} .bg { position:absolute; inset:-15%; background:center/cover no-repeat; filter:blur(var(--blur)) brightness(.5) saturate(1.5);
  transform:scale(1.15); transition:opacity 1s; }
${R} .blobs { position:absolute; inset:0; overflow:hidden; display:none; }
${R} .blobs i { position:absolute; width:60vmax; height:60vmax; border-radius:50%; filter:blur(60px); opacity:.35;
  background:radial-gradient(circle, rgba(var(--tint),1), transparent 65%); transition:background 1.2s; }
${R} .blobs i:nth-child(1) { left:-10%; top:-20%; animation:npx-blob1 26s ease-in-out infinite alternate; }
${R} .blobs i:nth-child(2) { right:-15%; bottom:-25%; animation:npx-blob2 32s ease-in-out infinite alternate;
  background:radial-gradient(circle, var(--accent), transparent 65%); opacity:.18; }
${R} .blobs i:nth-child(3) { left:30%; top:30%; width:40vmax; height:40vmax; animation:npx-blob3 22s ease-in-out infinite alternate; }
${R}.animated .blobs { display:block; }
${R}.animated .bg { animation:npx-drift 40s ease-in-out infinite alternate; }
@keyframes npx-drift { from { transform:scale(1.15) rotate(0deg) translate(0,0) } to { transform:scale(1.35) rotate(8deg) translate(3%,-2%) } }
@keyframes npx-blob1 { to { transform:translate(35vw, 25vh) scale(1.3) } }
@keyframes npx-blob2 { to { transform:translate(-40vw, -30vh) scale(.8) } }
@keyframes npx-blob3 { to { transform:translate(-25vw, 15vh) scale(1.4) } }
${R} .tint { position:absolute; inset:0; transition:background 1.2s;
  background:radial-gradient(ellipse at 35% 40%, rgba(var(--tint),.35), transparent 65%),
             radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,.65) 100%); }

${R} .app { position:relative; height:100%; display:grid; grid-template-columns:1fr var(--qw,340px); transition:grid-template-columns .3s ease; }
${R} .app.resizing { transition:none; cursor:col-resize; }

/* Player */
${R} .player { position:relative; min-width:0; overflow:hidden; }
${R} .viz { position:absolute; left:0; right:0; bottom:0; height:24vh; width:100%; opacity:.5; pointer-events:none; z-index:0;
  mask-image:linear-gradient(to top, #000 30%, transparent); }
${R} .stage { position:relative; z-index:1; height:100%; display:flex; align-items:center; justify-content:center; gap:4vw; padding:5vh 4vw; }
${R} .main { display:flex; flex-direction:column; align-items:center; gap:2.2vh; min-width:0; flex:0 1 auto; width:100%; max-width:min(80vh, 100%); }
${R} .cover { position:relative; width:min(52vh,46vw); aspect-ratio:1; margin-bottom:.5vh; transition:width .4s ease; }
${R} .cover img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; border-radius:16px;
  box-shadow:0 40px 100px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.06); transition:opacity .7s; }
${R} .cover .empty { position:absolute; inset:0; border-radius:16px; background:var(--faint); }
/* Own compositing layer: without it Chromium renders the title greyish next to the blurred background layers */
${R} .info { text-align:center; width:min(76vh,100%); will-change:transform; transform:translateZ(0); }
${R} .info div { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
${R} .title { font-size:clamp(24px,4.6vh,56px); font-weight:700; line-height:1.15; }
${R} .artist { font-size:clamp(16px,2.6vh,30px); margin-top:.9vh; opacity:.92; }
${R} .album { font-size:clamp(12px,1.6vh,18px); margin-top:.7vh; color:var(--dim); text-transform:uppercase; letter-spacing:.12em; }

${R} .timeline { width:min(76vh,100%); margin-top:1vh; }
${R} .slider { position:relative; height:20px; cursor:pointer; touch-action:none; }
${R} .slider::before { content:""; position:absolute; left:0; right:0; top:8px; height:4px; border-radius:4px; background:var(--faint); transition:height .15s, top .15s; }
${R} .slider .fill { position:absolute; left:0; top:8px; height:4px; border-radius:4px; background:var(--accent); transition:height .15s, top .15s; }
${R} .slider .knob { position:absolute; top:4px; width:12px; height:12px; margin-left:-6px; border-radius:50%; background:#fff;
  box-shadow:0 1px 6px rgba(0,0,0,.5); opacity:0; transition:opacity .15s; }
${R} .slider:hover::before, ${R} .slider:hover .fill { top:7px; height:6px; }
${R} .slider:hover .knob, ${R} .slider.drag .knob { opacity:1; }
${R} .sc-markers { position:absolute; left:0; right:0; bottom:13px; height:12px; pointer-events:none; }
${R} .sc-markers i { position:absolute; bottom:0; width:2px; margin-left:-1px; border-radius:1px; background:var(--accent); opacity:.45; }
${R} .times { display:flex; justify-content:space-between; font-size:13px; color:var(--dim); font-variant-numeric:tabular-nums; }
${R} .times .sc-status { opacity:.8; }

${R} .controls { display:flex; align-items:center; gap:clamp(12px,2vw,36px); }
${R} .toggle { background:#fff; color:#000; border-radius:50%; padding:16px; opacity:1; box-shadow:0 10px 30px rgba(0,0,0,.4); }
${R} .toggle svg { width:40px; height:40px; }
${R} .mode svg { width:24px; height:24px; }
${R} .mode.off { opacity:.35; }
${R} .mode.on { color:var(--accent); }
${R} .mode.on::after { content:""; position:absolute; left:50%; bottom:-5px; width:4px; height:4px; margin-left:-2px; border-radius:50%; background:currentColor; }
${R} .one { position:absolute; font-size:9px; font-weight:800; top:13px; left:0; right:0; text-align:center; }
${R} .fav svg { width:26px; height:26px; }
${R} .fav.on { color:#ff5c7a; opacity:1; }
${R} .fav.pop { animation:npx-pop .35s ease; }
@keyframes npx-pop { 50% { transform:scale(1.35) } }
${R} .volume { display:flex; align-items:center; gap:10px; width:200px; }
${R} .volume button { padding:4px; color:var(--dim); }
${R} .volume button svg { width:20px; height:20px; }
${R} .volume .slider { flex:1; }

/* Lyrics */
${R} .lyrics { display:none; flex:1 1 0; max-width:46vw; height:76vh; overflow-y:auto; scrollbar-width:none; position:relative;
  mask-image:linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent); }
${R}.show-lyrics .lyrics { display:block; }
${R}.show-lyrics .cover { width:min(40vh,26vw); }
${R}.show-lyrics .main { max-width:min(60vh, 40vw); }
${R} .lyr-pad { height:30vh; }
${R} .lyr-line { font-size:clamp(18px,3vh,34px); font-weight:700; line-height:1.3; padding:.6vh 0; color:rgba(255,255,255,.38);
  transition:color .3s, transform .3s, opacity .3s; transform-origin:left center; }
${R} .lyrics.synced .lyr-line { cursor:pointer; }
${R} .lyrics.synced .lyr-line:hover { color:rgba(255,255,255,.7); }
${R} .lyr-line.past { color:rgba(255,255,255,.22); }
${R} .lyr-line.active { color:#fff; transform:scale(1.03); }
${R} .lyr-line .w.sung { color:var(--accent); }
${R} .lyrics:not(.synced) .lyr-line { color:rgba(255,255,255,.85); cursor:default; font-weight:600; }
${R} .lyr-label { font-size:13px; letter-spacing:.12em; text-transform:uppercase; color:var(--dim); margin:2vh 0 .5vh; }
${R} .lyr-msg { height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px;
  font-size:clamp(18px,2.6vh,28px); color:var(--dim); text-align:center; }
${R} .lyr-msg small { font-size:14px; opacity:.8; }
${R} .lyr-src { font-size:12px; color:var(--dim); padding:2vh 0 4vh; }

/* Floating SoundCloud comments */
${R} .sc-layer { position:absolute; inset:0; z-index:2; pointer-events:none; overflow:hidden; }
${R} .sc-bubble { position:absolute; display:flex; gap:10px; align-items:flex-start; max-width:min(380px,40%); padding:9px 14px 9px 9px;
  border-radius:18px; background:rgba(0,0,0,.45); backdrop-filter:blur(10px); box-shadow:0 8px 30px rgba(0,0,0,.35);
  animation:npx-bubble 7s ease forwards; }
${R} .sc-bubble img { width:30px; height:30px; border-radius:50%; flex:none; object-fit:cover; }
${R} .sc-bubble b { display:block; font-size:12px; color:var(--accent); margin-bottom:2px; }
${R} .sc-bubble span { display:block; font-size:14.5px; line-height:1.3; word-break:break-word; }
@keyframes npx-bubble { 0% { opacity:0; transform:translateY(14px) scale(.96) } 8% { opacity:1; transform:none }
  80% { opacity:1 } 100% { opacity:0; transform:translateY(-40px) } }

/* Top bar: back, clock, buttons */
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
${R}.idle { cursor:none; }
${R}.idle .corner, ${R}.idle:not(.pin-back) .back { opacity:0; }

/* "Up next" card and toasts */
${R} .upnext { position:absolute; left:20px; bottom:20px; z-index:3; display:flex; gap:12px; align-items:center; padding:10px 18px 10px 10px;
  border-radius:14px; background:rgba(0,0,0,.5); backdrop-filter:blur(12px); box-shadow:0 10px 30px rgba(0,0,0,.4);
  transform:translateY(130%); opacity:0; transition:transform .5s cubic-bezier(.2,.9,.3,1.2), opacity .4s; max-width:min(420px,60%); }
${R} .upnext.show { transform:none; opacity:1; }
${R} .upnext img { width:52px; height:52px; border-radius:8px; object-fit:cover; flex:none; }
${R} .upnext small { display:block; font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--accent); }
${R} .upnext b, ${R} .upnext span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
${R} .upnext b { font-size:15px; margin-top:2px; }
${R} .upnext span { font-size:13px; color:var(--dim); }
${R} .toast { position:absolute; left:50%; bottom:28px; z-index:4; transform:translate(-50%, 20px); opacity:0; pointer-events:none;
  padding:10px 18px; border-radius:999px; background:rgba(0,0,0,.7); backdrop-filter:blur(10px); font-size:14px;
  transition:opacity .3s, transform .3s; white-space:nowrap; max-width:80%; overflow:hidden; text-overflow:ellipsis; }
${R} .toast.show { opacity:1; transform:translate(-50%, 0); }

/* Queue */
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

@media (max-width:900px) {
  ${R} { overflow:auto; }
  ${R} .app { grid-template-columns:1fr; height:auto; }
  ${R} .stage { flex-direction:column; }
  ${R} .cover { width:min(80vw,50vh); }
  ${R} .lyrics { max-width:none; width:100%; height:50vh; }
  ${R} .queue { border-left:0; border-top:1px solid var(--faint); }
  ${R} .queue .resizer { display:none; }
  ${R}.qcollapsed .queue { display:none; }
  ${R} .list { mask-image:none; }
}

#${BTN_ID} { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:var(--radius-md,8px);
  background:transparent; border:0; color:inherit; cursor:pointer; opacity:.8; }
#${BTN_ID}:hover { opacity:1; background:rgba(127,127,127,.15); }
#${BTN_ID} svg { width:20px; height:20px; fill:currentColor; }
`;
