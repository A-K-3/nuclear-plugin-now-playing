// Root, reset, buttons, inputs and the two-column layout
import { R } from './root';

export default `
${R} { --fg:#fff; --dim:rgba(255,255,255,.62); --faint:rgba(255,255,255,.13); --accent:#fff; --tint:40,40,48; --blur:80px; --cover-r:16px;
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

${R} .app { position:relative; height:100%; display:grid; grid-template-columns:1fr var(--qw,340px); transition:grid-template-columns .3s ease; }
${R} .app.resizing { transition:none; cursor:col-resize; }
`;
