// Lightweight Stale-While-Revalidate Memory & Session Cache Manager
const memoryCache = new Map();

export const getCache = (key) => {
  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }
  try {
    const sessionItem = sessionStorage.getItem(`cq_cache_${key}`);
    if (sessionItem) {
      const parsed = JSON.parse(sessionItem);
      memoryCache.set(key, parsed);
      return parsed;
    }
  } catch (e) {
    console.warn(`Cache read error for key: ${key}`, e);
  }
  return null;
};

export const setCache = (key, data) => {
  if (data === undefined || data === null) return;
  memoryCache.set(key, data);
  try {
    sessionStorage.setItem(`cq_cache_${key}`, JSON.stringify(data));
  } catch (e) {
    console.warn(`Cache write error for key: ${key}`, e);
  }
};

export const clearCache = (key) => {
  if (key) {
    memoryCache.delete(key);
    try {
      sessionStorage.removeItem(`cq_cache_${key}`);
    } catch (e) {}
  } else {
    memoryCache.clear();
    try {
      Object.keys(sessionStorage).forEach(k => {
        if (k.startsWith('cq_cache_')) {
          sessionStorage.removeItem(k);
        }
      });
    } catch (e) {}
  }
};
