// Interface strings in English and Spanish. The language follows Nuclear's own setting
// (core.general.language): Spanish when it is Spanish, English otherwise.
import type { NuclearPluginAPI } from '@nuclearplayer/plugin-sdk';

const en = {
  // Screen
  back: 'Back',
  backTitle: 'Back to Nuclear (Esc)',
  queueToggleTitle: 'Show or hide the queue (Q)',
  settings: 'Settings',
  fullscreenTitle: 'Fullscreen (F)',
  maximizeTitle: 'Maximize / restore the window (F)',
  winMinimize: 'Minimize',
  winMaximize: 'Maximize / restore',
  winClose: 'Close Nuclear',
  favTitle: 'Favorite (H)',
  shuffleTitle: 'Shuffle (S)',
  prevTitle: 'Previous (←)',
  playTitle: 'Play / pause (space)',
  nextTitle: 'Next (→)',
  repeatTitle: 'Repeat (R)',
  lyricsTitle: 'Lyrics (L)',
  muteTitle: 'Mute (M)',
  upNext: 'Up next',
  resizerTitle: 'Drag to resize · double-click to reset',
  queue: 'Queue',
  searchTitle: 'Search the queue (/)',
  saveQueueTitle: 'Save the queue as a playlist',
  collapseTitle: 'Collapse the queue (Q)',
  searchPlaceholder: 'Search song or artist…',
  save: 'Save',
  goToCurrent: 'Go to current',
  removeFromQueue: 'Remove from queue',
  nothingPlaying: 'Nothing playing',
  timeLeft: '{time} left',
  loadFailed: 'Could not load',
  noMatches: 'Nothing matches your search',
  queueName: 'Queue · {date}',
  queueSaved: '✓ Queue saved as “{name}”',
  queueSaveFailed: '✗ Could not save: {error}',
  favAdded: '❤️ Added to favorites',
  favRemoved: 'Removed from favorites',
  openButton: 'Now Playing (F9)',
  // Lyrics
  searchingLyrics: 'Looking for lyrics…',
  noLyrics: 'No lyrics for this song',
  noLyricsHint: 'Nuclear needs at least one lyrics plugin (Plugins › store).',
  instrumental: '♪ Instrumental ♪',
  lyricsSource: 'Lyrics: {provider}',
  // SoundCloud
  comments: '{n} comments',
  // Auto-skip
  skipping: 'Could not load “{title}”; skipping to the next song',
  noAudio: 'No audio source found for “{title}”; skipping to the next song',
  loadingAudio: 'Loading audio…',
  tooManyFailures: 'Several songs in a row failed; auto-skip paused. Check your connection.',
  thisSong: 'this song',
  // Settings
  setOpen: 'Now Playing screen',
  setOpenDesc: 'Also opens with F9 or the button next to the volume.',
  setOpenButton: 'Open screen (F9)',
  setBlur: 'Background blur',
  setBlurSharp: 'Sharp',
  setBlurSoft: 'Very soft',
  setEffects: 'Motion effects',
  setEffectsDesc: '3D artwork that follows the cursor, beat-reactive glow and pulse. Off when Windows reduces animations.',
  setAnimatedBg: 'Animated background',
  setAnimatedBgDesc: 'Artwork colors drift slowly in the background.',
  setVisualizer: 'Visualizer',
  setVizOff: 'Off',
  setVizBars: 'Bars',
  setVizWave: 'Wave',
  setClock: 'Show clock',
  setComments: 'SoundCloud comments',
  setCommentsDesc: 'Shows comments at the second they were written.',
};

export type Key = keyof typeof en;

const es: Record<Key, string> = {
  back: 'Volver',
  backTitle: 'Volver a Nuclear (Esc)',
  queueToggleTitle: 'Mostrar u ocultar la cola (Q)',
  settings: 'Ajustes',
  fullscreenTitle: 'Pantalla completa (F)',
  maximizeTitle: 'Maximizar / restaurar la ventana (F)',
  winMinimize: 'Minimizar',
  winMaximize: 'Maximizar / restaurar',
  winClose: 'Cerrar Nuclear',
  favTitle: 'Favorito (H)',
  shuffleTitle: 'Aleatorio (S)',
  prevTitle: 'Anterior (←)',
  playTitle: 'Reproducir / pausa (espacio)',
  nextTitle: 'Siguiente (→)',
  repeatTitle: 'Repetir (R)',
  lyricsTitle: 'Letra (L)',
  muteTitle: 'Silenciar (M)',
  upNext: 'A continuación',
  resizerTitle: 'Arrastra para cambiar el ancho · doble clic para restablecerlo',
  queue: 'Cola',
  searchTitle: 'Buscar en la cola (/)',
  saveQueueTitle: 'Guardar la cola como lista',
  collapseTitle: 'Plegar la cola (Q)',
  searchPlaceholder: 'Buscar canción o artista…',
  save: 'Guardar',
  goToCurrent: 'Ir a la actual',
  removeFromQueue: 'Quitar de la cola',
  nothingPlaying: 'Nada sonando',
  timeLeft: 'quedan {time}',
  loadFailed: 'No se pudo cargar',
  noMatches: 'Nada coincide con la búsqueda',
  queueName: 'Cola · {date}',
  queueSaved: '✓ Cola guardada como «{name}»',
  queueSaveFailed: '✗ No se pudo guardar: {error}',
  favAdded: '❤️ Añadida a favoritos',
  favRemoved: 'Quitada de favoritos',
  openButton: 'Pantalla de reproducción (F9)',
  searchingLyrics: 'Buscando letra…',
  noLyrics: 'No hay letra para esta canción',
  noLyricsHint: 'Nuclear necesita al menos un plugin de letras (Plugins › tienda).',
  instrumental: '♪ Instrumental ♪',
  lyricsSource: 'Letra: {provider}',
  comments: '{n} comentarios',
  skipping: 'No se pudo cargar «{title}»; paso a la siguiente',
  noAudio: 'No se encontró audio para «{title}»; paso a la siguiente',
  loadingAudio: 'Cargando audio…',
  tooManyFailures: 'Varias canciones seguidas fallan; paro de saltar. ¿Hay conexión?',
  thisSong: 'la canción',
  setOpen: 'Pantalla de reproducción',
  setOpenDesc: 'También con F9 o el botón junto al volumen.',
  setOpenButton: 'Abrir pantalla (F9)',
  setBlur: 'Desenfoque del fondo',
  setBlurSharp: 'Nítido',
  setBlurSoft: 'Muy difuso',
  setEffects: 'Efectos de movimiento',
  setEffectsDesc: 'Portada en 3D que sigue al cursor, brillo y pulso al ritmo de la música. Se desactivan si Windows reduce las animaciones.',
  setAnimatedBg: 'Fondo animado',
  setAnimatedBgDesc: 'Los colores de la portada se mueven despacio.',
  setVisualizer: 'Visualizador',
  setVizOff: 'Desactivado',
  setVizBars: 'Barras',
  setVizWave: 'Onda',
  setClock: 'Mostrar reloj',
  setComments: 'Comentarios de SoundCloud',
  setCommentsDesc: 'Muestra los comentarios en el segundo en que se escribieron.',
};

let strings: Record<Key, string> = en;
let localeTag = 'en-US';

export async function initLanguage(api: NuclearPluginAPI) {
  let language: unknown;
  try { language = await api.Settings.getGlobal('core.general.language'); } catch { /* use the browser's */ }
  const spanish = String(language || navigator.language || '').toLowerCase().startsWith('es');
  strings = spanish ? es : en;
  localeTag = spanish ? 'es-ES' : 'en-US';
}

export const t = (key: Key, params: Record<string, string | number> = {}) =>
  strings[key].replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''));

// BCP 47 tag for dates and times in the current language
export const locale = () => localeTag;
