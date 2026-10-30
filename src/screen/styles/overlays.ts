// "Up next" card and toasts
import { R } from './root';

export default `
${R} .upnext { position:absolute; left:20px; bottom:20px; z-index:3; display:flex; gap:12px; align-items:center; padding:10px 18px 10px 10px;
  border-radius:14px; background:rgba(0,0,0,.5); backdrop-filter:blur(12px); box-shadow:0 10px 30px rgba(0,0,0,.4);
  transform:perspective(700px) rotateX(-75deg) translateY(40%); transform-origin:50% 100%; opacity:0;
  transition:transform .7s cubic-bezier(.2,.9,.3,1.15), opacity .4s; max-width:min(420px,60%); }
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
`;
