// Narrow windows: one column
import { R } from './root';

export default `
@media (max-width:900px) {
  ${R} { overflow:auto; }
  ${R} .app { grid-template-columns:1fr; height:auto; }
  ${R} .stage { flex-direction:column; }
  ${R} .cover-wrap { width:min(80vw,50vh); }
  ${R} .lyrics { max-width:none; width:100%; height:50vh; }
  ${R} .queue { border-left:0; border-top:1px solid var(--faint); }
  ${R} .queue .resizer { display:none; }
  ${R}.qcollapsed .queue { display:none; }
  ${R} .list { mask-image:none; }
}
`;
