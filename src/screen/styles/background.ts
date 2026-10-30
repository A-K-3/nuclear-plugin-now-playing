// Background: blurred artwork (optionally animated), tint, vignette and the beat flash
import { R } from './root';

export default `
${R} .backdrop { position:absolute; inset:0; }
${R} .bg { position:absolute; inset:-15%; background:center/cover no-repeat; filter:blur(var(--blur)) brightness(.5) saturate(1.5);
  transform:scale(1.15); transition:opacity 1s; }
${R} .blobs { position:absolute; inset:0; overflow:hidden; display:none; }
${R} .blobs i { position:absolute; width:60vmax; height:60vmax; border-radius:50%; filter:blur(60px); opacity:.5;
  background:radial-gradient(circle, rgba(var(--tint),1), transparent 65%); transition:background 1.2s; }
${R} .blobs i:nth-child(1) { left:-10%; top:-20%; animation:npx-blob1 18s ease-in-out infinite alternate; }
${R} .blobs i:nth-child(2) { right:-15%; bottom:-25%; animation:npx-blob2 22s ease-in-out infinite alternate;
  background:radial-gradient(circle, var(--accent), transparent 65%); opacity:.3; }
${R} .blobs i:nth-child(3) { left:30%; top:30%; width:40vmax; height:40vmax; animation:npx-blob3 15s ease-in-out infinite alternate; }
${R}.animated .blobs { display:block; }
${R}.animated .bg { animation:npx-drift 28s ease-in-out infinite alternate; }
@keyframes npx-drift { from { transform:scale(1.15) rotate(0deg) translate(0,0) } to { transform:scale(1.35) rotate(8deg) translate(3%,-2%) } }
@keyframes npx-blob1 { to { transform:translate(35vw, 25vh) scale(1.3) } }
@keyframes npx-blob2 { to { transform:translate(-40vw, -30vh) scale(.8) } }
@keyframes npx-blob3 { to { transform:translate(-25vw, 15vh) scale(1.4) } }
${R} .tint { position:absolute; inset:0; transition:background 1.2s;
  background:radial-gradient(ellipse at 35% 40%, rgba(var(--tint),.35), transparent 65%),
             radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,.65) 100%); }
/* Light pulse on the beat (opacity only, so it stays on the compositor) */
${R} .pulse { position:absolute; inset:0; opacity:0; pointer-events:none; will-change:opacity; mix-blend-mode:screen;
  background:radial-gradient(ellipse at 40% 42%, var(--accent), transparent 58%); }
${R}.fx .backdrop { will-change:translate, scale; }
`;
