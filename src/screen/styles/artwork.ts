// Player column: visualizer canvas, artwork with its glow and shine, title block
import { R } from './root';

export default `
/* Player */
${R} .player { position:relative; min-width:0; overflow:hidden; }
${R} .viz { position:absolute; left:0; right:0; bottom:0; height:24vh; width:100%; opacity:.5; pointer-events:none; z-index:0;
  mask-image:linear-gradient(to top, #000 30%, transparent); }
${R} .stage { position:relative; z-index:1; height:100%; display:flex; align-items:center; justify-content:center; gap:4vw; padding:5vh 4vw; }
${R} .main { display:flex; flex-direction:column; align-items:center; gap:2.2vh; min-width:0; flex:0 1 auto; width:100%; max-width:min(80vh, 100%); }
/* Artwork: 3D wrapper (cursor tilt + beat scale), glow behind it, glass shine on top */
${R} .cover-wrap { position:relative; width:min(52vh,46vw); aspect-ratio:1; margin-bottom:.5vh; transition:width .4s ease;
  perspective:1200px; transform-style:preserve-3d; }
/* A soft radial gradient instead of filter:blur, so scaling it every frame needs no filter pass */
${R} .cover-glow { position:absolute; inset:-22%; opacity:.3; pointer-events:none; transition:background 1.2s;
  background:radial-gradient(circle, var(--accent) 0%, color-mix(in srgb, var(--accent) 45%, transparent) 28%, transparent 62%); }
/* Compositor layers only while the effects run */
${R}.fx .cover-wrap { will-change:transform; }
${R}.fx .cover-glow { will-change:opacity, transform; }
${R} .cover { position:relative; width:100%; height:100%; }
${R} .cover img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; border-radius:var(--cover-r);
  box-shadow:0 40px 100px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.06); transition:opacity .7s; }
${R} .cover .empty { position:absolute; inset:0; border-radius:var(--cover-r); background:var(--faint); }
${R} .shine { position:absolute; inset:0; border-radius:var(--cover-r); overflow:hidden; pointer-events:none;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.14), inset 0 1px 0 rgba(255,255,255,.28); }
${R} .shine i { position:absolute; inset:-60%; mix-blend-mode:overlay; opacity:0; transition:opacity .6s;
  background:linear-gradient(115deg, transparent 38%, rgba(255,255,255,.55) 48%, rgba(255,255,255,.1) 54%, transparent 64%); }
${R}.fx .shine i { opacity:1; will-change:transform; }
${R}.fx .cover.flip { animation:npx-flip .9s cubic-bezier(.2,.85,.25,1); }
@keyframes npx-flip { 0% { transform:rotateY(-80deg) translateZ(-120px) scale(.9); opacity:.2 } 55% { opacity:1 } 100% { transform:none } }
/* Own compositing layer: without it Chromium renders the title greyish next to the blurred background layers */
${R} .info { text-align:center; width:min(76vh,100%); will-change:transform; transform:translateZ(0); }
${R} .info div { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
${R} .title { font-size:clamp(24px,4.6vh,56px); font-weight:700; line-height:1.15; }
${R} .artist { font-size:clamp(16px,2.6vh,30px); margin-top:.9vh; opacity:.92; }
${R} .album { font-size:clamp(12px,1.6vh,18px); margin-top:.7vh; color:var(--dim); text-transform:uppercase; letter-spacing:.12em; }
`;
