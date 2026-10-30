// The button injected into Nuclear's player bar (outside the screen, so not scoped under the root)
import { BUTTON_ID } from '../../nuclear/player-button';

export default `
#${BUTTON_ID} { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:var(--radius-md,8px);
  background:transparent; border:0; color:inherit; cursor:pointer; opacity:.8; }
#${BUTTON_ID}:hover { opacity:1; background:rgba(127,127,127,.15); }
#${BUTTON_ID} svg { width:20px; height:20px; fill:currentColor; }
`;
