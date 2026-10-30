// Small JSON values in localStorage that survive restarts; never throws (storage may be unavailable)
export const storage = {
  get<T extends object>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key);
      return v ? { ...fallback, ...JSON.parse(v) } : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};
