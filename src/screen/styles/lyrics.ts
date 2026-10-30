// Lyrics panel
import { R } from './root';

export default `
${R} .lyrics { display:none; flex:1 1 0; max-width:46vw; height:76vh; overflow-y:auto; scrollbar-width:none; position:relative;
  mask-image:linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent); }
${R}.show-lyrics .lyrics { display:block; }
${R}.show-lyrics .cover-wrap { width:min(40vh,26vw); }
${R}.show-lyrics .main { max-width:min(60vh, 40vw); }
${R} .lyr-pad { height:30vh; }
${R} .lyr-line { font-size:clamp(18px,3vh,34px); font-weight:700; line-height:1.3; padding:.6vh 0; color:rgba(255,255,255,.38);
  transition:color .3s, transform .3s, opacity .3s; transform-origin:left center; }
${R} .lyrics.synced .lyr-line { cursor:pointer; }
${R} .lyrics.synced .lyr-line:hover { color:rgba(255,255,255,.7); }
${R} .lyr-line.past { color:rgba(255,255,255,.22); }
${R} .lyr-line.active { color:#fff; transform:scale(1.03); text-shadow:0 0 28px rgba(255,255,255,.35); }
${R} .lyr-line .w.sung { color:var(--accent); }
${R} .lyrics:not(.synced) .lyr-line { color:rgba(255,255,255,.85); cursor:default; font-weight:600; }
${R} .lyr-label { font-size:13px; letter-spacing:.12em; text-transform:uppercase; color:var(--dim); margin:2vh 0 .5vh; }
${R} .lyr-msg { height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px;
  font-size:clamp(18px,2.6vh,28px); color:var(--dim); text-align:center; }
${R} .lyr-msg small { font-size:14px; opacity:.8; }
${R} .lyr-src { font-size:12px; color:var(--dim); padding:2vh 0 4vh; }
`;
