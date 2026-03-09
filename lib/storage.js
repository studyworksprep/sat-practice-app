/**
 * localStorage utility with consistent error handling, TTL support, and
 * namespaced key management for the SAT practice app.
 */

const PREFIX = 'sat_';

function prefixKey(key) {
  return key.startsWith(PREFIX) ? key : PREFIX + key;
}

/**
 * Get a value from localStorage (parsed from JSON).
 * Returns `fallback` if key doesn't exist, is expired, or on error.
 */
export function storageGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(prefixKey(key));
    if (raw === null) return fallback;

    const wrapper = JSON.parse(raw);

    // Check TTL expiry
    if (wrapper._expires && Date.now() > wrapper._expires) {
      localStorage.removeItem(prefixKey(key));
      return fallback;
    }

    return wrapper._value !== undefined ? wrapper._value : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Set a value in localStorage (serialized as JSON).
 * @param {string} key
 * @param {*} value
 * @param {Object} [options]
 * @param {number} [options.ttlMs] - Time-to-live in milliseconds
 */
export function storageSet(key, value, options = {}) {
  try {
    const wrapper = { _value: value };
    if (options.ttlMs) {
      wrapper._expires = Date.now() + options.ttlMs;
    }
    localStorage.setItem(prefixKey(key), JSON.stringify(wrapper));
  } catch {
    // Storage full or unavailable — silently fail
  }
}

/**
 * Remove a key from localStorage.
 */
export function storageRemove(key) {
  try {
    localStorage.removeItem(prefixKey(key));
  } catch {}
}

/**
 * Check if a key exists and is not expired.
 */
export function storageHas(key) {
  return storageGet(key) !== null;
}

/**
 * Clear all SAT app prefixed keys from localStorage.
 */
export function storageClearAll() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {}
}

/**
 * Clear expired SAT app keys from localStorage.
 * Call this periodically (e.g., on app start) to prevent stale data buildup.
 */
export function storagePurgeExpired() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const wrapper = JSON.parse(raw);
        if (wrapper._expires && Date.now() > wrapper._expires) {
          localStorage.removeItem(k);
        }
      } catch {
        // Malformed entry — remove it
        localStorage.removeItem(k);
      }
    }
  } catch {}
}

/**
 * Get approximate localStorage usage in bytes for SAT app keys.
 */
export function storageUsage() {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      const v = localStorage.getItem(k) || '';
      total += k.length + v.length;
    }
    // Each JS char is 2 bytes in localStorage (UTF-16)
    return total * 2;
  } catch {
    return 0;
  }
}
