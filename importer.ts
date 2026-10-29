// Importador de Spotify sin cuenta ni clave: lee el reproductor incrustado (listas y álbumes,
// hasta 100 canciones) y la página pública de cada canción. Crea una lista de Nuclear con
// título, artistas, duración y portada; Nuclear busca el audio con tu proveedor de streaming.
// - Como proveedor de listas: aparece en la pantalla de importar listas de Nuclear.
// - Como widget de Ajustes: admite pegar muchos enlaces a la vez (uno por línea).
import React from 'react';

import { BUTTON_STYLE, httpJson, httpText, pool, UA_SIMPLE } from './util';

const LINK = /(?:open\.spotify\.com\/(?:intl-[a-z-]+\/)?|spotify:)(track|playlist|album)[/:]([A-Za-z0-9]{22})/g;
const EMBED_LIMIT = 100;

type Ref = { type: 'track' | 'playlist' | 'album'; id: string };

const parseSpotify = (text: string): Ref[] => {
  const seen = new Set<string>();
  return Array.from(String(text).matchAll(LINK))
    .map((m) => ({ type: m[1] as Ref['type'], id: m[2] }))
    .filter((r) => !seen.has(r.type + r.id) && seen.add(r.type + r.id));
};

// "crossroad - instrumental" → "crossroad" (la versión normal es la que se quiere buscar)
const cleanTitle = (t: string) =>
  String(t || '').replace(/\s*[-–]\s*instrumental\s*$/i, '').replace(/\s*\(instrumental\)\s*$/i, '').trim();

const splitArtists = (s: string) =>
  String(s || '').split(/,\s*| /).map((a) => a.trim()).filter(Boolean);

// Todas las <meta property|name="…" content="…"> de una página, sin depender del orden de los atributos
const metaTags = (html: string) => {
  const tags = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/g) || []) {
    const key = tag.match(/(?:property|name)="([^"]+)"/)?.[1];
    const content = tag.match(/content="([^"]*)"/)?.[1];
    if (key && content !== undefined && !tags.has(key)) {
      tags.set(key, content.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"'));
    }
  }
  return tags;
};

function makeTrack(o: { id: string; title: string; artists: string[]; durationMs?: number; cover?: string; album?: { id: string; title: string } }) {
  const artwork = o.cover ? { items: [{ url: o.cover, width: 640, height: 640, purpose: 'cover' }] } : undefined;
  return {
    title: cleanTitle(o.title),
    artists: o.artists.map((name) => ({ name, roles: [] as string[] })),
    album: o.album ? { title: o.album.title, artwork, source: { provider: 'spotify', id: o.album.id, url: `https://open.spotify.com/album/${o.album.id}` } } : undefined,
    durationMs: o.durationMs || undefined,
    artwork,
    source: { provider: 'spotify', id: o.id, url: `https://open.spotify.com/track/${o.id}` },
  };
}

async function fetchEmbed(api: any, type: string, id: string) {
  const html = await httpText(api, `https://open.spotify.com/embed/${type}/${id}`);
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`Spotify no devolvió datos para ${type}/${id}`);
  return JSON.parse(m[1])?.props?.pageProps?.state?.data?.entity;
}

async function fetchTrackPage(api: any, id: string) {
  const meta = metaTags(await httpText(api, `https://open.spotify.com/track/${id}`, 12000, UA_SIMPLE));
  const title = meta.get('og:title');
  if (!title) throw new Error(`Spotify no devolvió datos de la canción ${id}`);
  const [artists, album] = (meta.get('og:description') || '').split(' · ');
  return makeTrack({
    id, title, artists: splitArtists(artists),
    durationMs: (+(meta.get('music:duration') || 0) || 0) * 1000, cover: meta.get('og:image'),
    album: album ? { id: '', title: album } : undefined,
  });
}

const coverOf = (entity: any) =>
  (entity?.coverArt?.sources || entity?.visualIdentity?.image || []).map((s: any) => s.url).filter(Boolean)[0] || '';

async function importSpotify(api: any, text: string, onProgress: (msg: string) => void = () => {}, name?: string) {
  const refs = parseSpotify(text);
  if (!refs.length) throw new Error('No hay enlaces de Spotify (canciones, listas o álbumes).');
  const warnings: string[] = [];
  const tracks: any[] = [];
  let title = '', cover = '';

  for (const ref of refs) {
    if (ref.type === 'track') continue;
    onProgress(`Leyendo ${ref.type === 'album' ? 'álbum' : 'lista'}…`);
    const entity = await fetchEmbed(api, ref.type, ref.id);
    const list = entity?.trackList || [];
    if (list.length >= EMBED_LIMIT) warnings.push(`«${entity.name}»: Spotify solo deja leer las primeras ${EMBED_LIMIT} canciones.`);
    const entityCover = coverOf(entity);
    title ||= entity?.name || '';
    cover ||= entityCover;
    const albumCover = ref.type === 'album' ? entityCover : '';
    const items = list.map((t: any) => ({
      id: String(t.uri || '').split(':').pop()!, title: t.title, artists: splitArtists(t.subtitle), durationMs: t.duration,
      cover: albumCover, album: ref.type === 'album' ? { id: ref.id, title: entity.name } : undefined,
    }));
    // Las listas no traen la portada de cada canción: se pide a Spotify (6 a la vez)
    let done = 0;
    await pool(items, 6, async (it: any) => {
      if (!it.cover) {
        try {
          const o = await httpJson(api, `https://open.spotify.com/oembed?url=https://open.spotify.com/track/${it.id}`);
          it.cover = o.thumbnail_url || '';
        } catch { /* sin portada */ }
      }
      onProgress(`Portadas ${++done}/${items.length}…`);
    });
    tracks.push(...items.map(makeTrack));
  }

  const single = refs.filter((r) => r.type === 'track');
  let done = 0;
  const singles = await pool(single, 6, async (r) => {
    try {
      const t = await fetchTrackPage(api, r.id);
      onProgress(`Canciones ${++done}/${single.length}…`);
      return t;
    } catch {
      warnings.push(`No se pudo leer la canción ${r.id}.`);
      return null;
    }
  });
  tracks.push(...singles.filter(Boolean));
  if (!tracks.length) throw new Error('No se pudo leer ninguna canción.');

  const now = new Date().toISOString();
  const playlistName = name?.trim() || (refs.length === 1 && title) || `Spotify · ${tracks.length} canciones · ${new Date().toLocaleDateString('es-ES')}`;
  const first = refs[0];
  const playlistCover = cover || tracks[0]?.artwork?.items?.[0]?.url;
  const playlist = {
    id: crypto.randomUUID(),
    name: playlistName,
    createdAtIso: now,
    lastModifiedIso: now,
    isReadOnly: false,
    origin: { provider: 'spotify', id: first.id, url: `https://open.spotify.com/${first.type}/${first.id}` },
    artwork: playlistCover ? { items: [{ url: playlistCover, purpose: 'cover' }] } : undefined,
    items: tracks.map((track) => ({ id: crypto.randomUUID(), track, addedAtIso: now })),
  };
  return { playlist, warnings };
}

export const createSpotifyProvider = (api: any) => ({
  id: 'ak-spotify',
  kind: 'playlists',
  name: 'Spotify (Now Playing)',
  matchesUrl: (url: string) => parseSpotify(url).length > 0,
  fetchPlaylistByUrl: async (url: string) => (await importSpotify(api, url)).playlist,
});

// Widget de Ajustes: pegar enlaces (uno o muchos) y crear la lista directamente
export const createImporterWidget = (getApi: () => any) => () => {
  const [text, setText] = React.useState('');
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const count = React.useMemo(() => parseSpotify(text).length, [text]);

  const run = async () => {
    setBusy(true);
    setStatus('Empezando…');
    try {
      const api = getApi();
      const { playlist, warnings } = await importSpotify(api, text, setStatus, name);
      await api.Playlists.importPlaylist(playlist);
      setStatus(`✓ Lista «${playlist.name}» creada con ${playlist.items.length} canciones.${warnings.length ? ' ' + warnings.join(' ') : ''}`);
      setText('');
    } catch (e: any) {
      setStatus(`✗ ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const box = { width: '100%', padding: 8, borderRadius: 8, border: '1px solid rgba(127,127,127,.4)', background: 'transparent', color: 'inherit', font: 'inherit' };
  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 560 } },
    React.createElement('textarea', {
      value: text, rows: 5, disabled: busy, style: { ...box, resize: 'vertical' },
      placeholder: 'https://open.spotify.com/playlist/…\nhttps://open.spotify.com/track/…\n(uno por línea)',
      onChange: (e: any) => setText(e.target.value),
    }),
    React.createElement('input', {
      value: name, disabled: busy, style: box, placeholder: 'Nombre de la lista (opcional)',
      onChange: (e: any) => setName(e.target.value),
    }),
    React.createElement('div', { style: { display: 'flex', gap: 12, alignItems: 'center' } },
      React.createElement('button', {
        onClick: run, disabled: busy || !count,
        style: { ...BUTTON_STYLE, cursor: busy || !count ? 'default' : 'pointer', opacity: busy || !count ? 0.5 : 1 },
      }, busy ? 'Importando…' : `Importar${count ? ` (${count} enlace${count > 1 ? 's' : ''})` : ''}`),
      React.createElement('span', { style: { fontSize: 13, opacity: 0.8 } }, status)));
};
