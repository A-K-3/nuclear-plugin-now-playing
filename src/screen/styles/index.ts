// Styles for the Now Playing screen, one module per area
import base from './base';
import background from './background';
import artwork from './artwork';
import controls from './controls';
import lyrics from './lyrics';
import comments from './comments';
import chrome from './chrome';
import overlays from './overlays';
import queue from './queue';
import responsive from './responsive';
import playerButton from './player-button';

export { ROOT_ID } from './root';

export const CSS = [
  base,
  background,
  artwork,
  controls,
  lyrics,
  comments,
  chrome,
  overlays,
  queue,
  responsive,
  playerButton,
].join('');
