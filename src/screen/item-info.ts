// Display data for each queue item (title, artist, search text, thumbnail), computed once per item
import type { QueueItem, Track } from '@nuclearplayer/plugin-sdk';

import { norm } from '../lib/format';
import { coverFor, display } from '../lib/track';

type ItemInfo = { track: Track; title: string; artist: string; search: string; thumb: string };

export class ItemInfoCache {
  private cache = new Map<string, ItemInfo>();

  get(item: QueueItem): ItemInfo {
    const cached = this.cache.get(item.id);
    if (cached && cached.track === item.track) return cached;
    const d = display(item.track);
    const info = {
      track: item.track, title: d.title, artist: d.artist,
      search: norm(`${d.title} ${d.artist} ${item.track?.album?.title || ''}`), thumb: coverFor(item.track, false),
    };
    this.cache.set(item.id, info);
    return info;
  }

  // Forgets items no longer in the queue once the cache has grown well past it
  prune(items: QueueItem[]) {
    if (this.cache.size <= items.length + 200) return;
    const ids = new Set(items.map((it) => it.id));
    for (const id of this.cache.keys()) if (!ids.has(id)) this.cache.delete(id);
  }
}
