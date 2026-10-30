// Text helpers: HTML escaping, durations and search normalisation

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

// 3:07
export const fmt = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// 1 h 12 min
export const fmtLong = (seconds: number) => {
  const m = Math.round(seconds / 60), h = Math.floor(m / 60);
  return h ? `${h} h ${m % 60} min` : `${m} min`;
};

// Lowercase letters and digits of any script, without accents or symbols, so "Beyoncé – Halo!"
// matches "beyonce halo" and "Сломана" matches "сломана" (Cyrillic, Japanese… are kept)
export const norm = (s: string) =>
  String(s || '').toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, '');
