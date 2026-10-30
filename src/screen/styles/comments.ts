// Floating SoundCloud comments
import { R } from './root';

export default `
${R} .sc-layer { position:absolute; inset:0; z-index:2; pointer-events:none; overflow:hidden; }
/* --life and --drift are set on .sc-layer by comments.ts. No backdrop blur: bubbles move every frame,
   so it would be recomputed constantly; a darker fill reads just as well. */
${R} .sc-bubble { position:absolute; max-width:min(380px,90%); animation:npx-bubble var(--life) linear both; }
${R}:not(.fx) .sc-bubble { --drift:0px; }
${R} .sc-sway { display:flex; gap:10px; align-items:flex-start; padding:9px 14px 9px 9px; border-radius:18px;
  background:rgba(10,10,16,.68); box-shadow:0 8px 30px rgba(0,0,0,.35); transform-origin:50% 100%; }
${R}.fx .sc-sway { animation:npx-sway 3.2s ease-in-out infinite alternate; }
${R} .sc-bubble img { width:30px; height:30px; border-radius:50%; flex:none; object-fit:cover; }
${R} .sc-bubble b { display:block; font-size:12px; color:var(--accent); margin-bottom:2px; }
${R} .sc-bubble span { display:block; font-size:14.5px; line-height:1.3; word-break:break-word; }
@keyframes npx-bubble { 0% { opacity:0; translate:0 0 } 12% { opacity:1 } 80% { opacity:1 } 100% { opacity:0; translate:0 var(--drift) } }
@keyframes npx-sway { from { transform:translateX(-4px) rotate(-1.2deg) } to { transform:translateX(4px) rotate(1.2deg) } }
`;
