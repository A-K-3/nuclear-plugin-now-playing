// Timeline, glass dock with the playback controls and the volume
import { R } from './root';

export default `
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
${R} .times .loading-note { display:none; color:var(--accent); animation:npx-blink 1.4s ease-in-out infinite; }
${R}.loading .times .loading-note { display:inline; }
${R}.loading .times .sc-status { display:none; }
@keyframes npx-blink { 50% { opacity:.35 } }

/* Glass dock holding the controls and the volume */
${R} .dock { display:flex; flex-direction:column; align-items:center; gap:1.4vh; padding:1.6vh clamp(18px,2.4vw,40px) 1.4vh;
  border-radius:28px; border:1px solid rgba(255,255,255,.12);
  background:linear-gradient(180deg, rgba(255,255,255,.11), rgba(255,255,255,.04));
  backdrop-filter:blur(20px) saturate(1.6);
  box-shadow:0 24px 60px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.2); }
${R} .controls { display:flex; align-items:center; gap:clamp(12px,2vw,36px); }
${R} .toggle { background:#fff; color:#000; border-radius:50%; padding:16px; opacity:1;
  box-shadow:0 10px 30px rgba(0,0,0,.4), 0 0 40px -6px var(--accent); }
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
`;
