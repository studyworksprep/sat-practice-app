// Safe localStorage write helper for practice session caches.
//
// Background: every time a user starts a question-bank session, the
// app writes three keys to localStorage:
//
//   practice_session_<sid>          → comma-joined question ids
//   practice_session_<sid>_items    → JSON-encoded items metadata
//   practice_session_<sid>_meta     → { sessionQueryString, totalCount, ... }
//
// Two things made this fragile:
//
//   1. The items array was the full API response (~13 fields per
//      question, but with all the taxonomy + status nesting). For a
//      5000-question session that's ~1-2 MB of localStorage just for
//      one cache.
//
//   2. Sessions are keyed by a hash of filter params, so every distinct
//      filter combo a user has ever tried leaves a cached session
//      behind. There was no eviction. After a few weeks of normal use
//      a heavy-using student would accumulate enough sessions to bust
//      the typical 5 MB localStorage cap, and the next setItem would
//      throw QuotaExceededError. The error message looked like:
//
//        Failed to execute 'setItem' on 'Storage': Setting the value of
//        'practice_session_pank9h_items' exceeded the quota.
//
//      ...which crashed the question-bank session launch.
//
// This helper fixes both:
//
//   - trimItem() strips items down to only the fields the consuming
//     pages actually read, cutting per-item size by ~60%
//   - savePracticeSession() pre-emptively evicts the oldest cached
//     sessions if we're over MAX_CACHED_SESSIONS, then on quota error
//     evicts more aggressively and retries
//   - on total failure it logs and returns false rather than throwing,
//     so the calling page can still launch the session (just without
//     the cached prev/next metadata)

const KEY_PREFIX = 'practice_session_';
const ITEMS_SUFFIX = '_items';
const META_SUFFIX = '_meta';

// Fields actually consumed by the practice/[questionId] map view and
// the dashboard SessionCard tiles. Anything not in this list is
// stripped from the cached items array before storage.
const ITEM_FIELDS = [
  'question_id',
  'question_key',
  'difficulty',
  'is_done',
  'marked_for_review',
  'last_is_correct',
  'domain_name',
  'skill_name',
];

function trimItem(item) {
  if (!item || typeof item !== 'object') return item;
  const out = {};
  for (const f of ITEM_FIELDS) {
    if (item[f] !== undefined) out[f] = item[f];
  }
  return out;
}

// Cross-browser detection of localStorage quota errors. The standard
// is QuotaExceededError but Firefox uses NS_ERROR_DOM_QUOTA_REACHED
// and the legacy code points are 22 / 1014.
function isQuotaError(err) {
  if (!err) return false;
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014
  );
}

// Find every practice_session_<sid> base key in localStorage and
// return them sorted oldest-first by their meta.cachedAt. Used by
// the LRU eviction path. Sessions whose meta is missing or unparseable
// sort to the front (treated as ancient) so they're evicted first.
function listSessionsByAge() {
  const sessions = [];
  if (typeof window === 'undefined') return sessions;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(KEY_PREFIX)) continue;
    if (key.endsWith(ITEMS_SUFFIX) || key.endsWith(META_SUFFIX)) continue;
    const sid = key.slice(KEY_PREFIX.length);
    let cachedAt = 0;
    try {
      const metaRaw = localStorage.getItem(KEY_PREFIX + sid + META_SUFFIX);
      if (metaRaw) {
        const meta = JSON.parse(metaRaw);
        if (meta?.cachedAt) cachedAt = new Date(meta.cachedAt).getTime() || 0;
      }
    } catch {}
    sessions.push({ sid, cachedAt });
  }
  return sessions.sort((a, b) => a.cachedAt - b.cachedAt);
}

function removeSession(sid) {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(KEY_PREFIX + sid); } catch {}
  try { localStorage.removeItem(KEY_PREFIX + sid + ITEMS_SUFFIX); } catch {}
  try { localStorage.removeItem(KEY_PREFIX + sid + META_SUFFIX); } catch {}
}

// How many cached practice sessions to retain. A 5000-item session
// after trimming is ~600-800 KB; capping at 4 keeps the cumulative
// footprint under ~3 MB even at the worst case, comfortably below the
// typical browser localStorage cap of 5 MB.
const MAX_CACHED_SESSIONS = 4;

/**
 * One-time cleanup pass that prunes old practice_session_* entries
 * down to the LRU cap. Used by the StorageHygiene client shim that
 * mounts in the root layout, so that students with bloated storage
 * from before this fix landed get self-healed on their next visit
 * instead of needing to clear localStorage manually.
 *
 * Safe to call multiple times; idempotent. Never throws.
 */
export function pruneOldPracticeSessions() {
  if (typeof window === 'undefined') return;
  try {
    const sessions = listSessionsByAge();
    while (sessions.length > MAX_CACHED_SESSIONS) {
      const oldest = sessions.shift();
      if (oldest) removeSession(oldest.sid);
    }
  } catch {
    // Storage may be disabled (private browsing) or corrupt — nothing
    // useful we can do, and we definitely don't want to throw out of
    // a passive cleanup.
  }
}

/**
 * Save a practice session's three localStorage keys with quota recovery.
 *
 * @param {string} sid       hashed session id
 * @param {Array}  ids       ordered question ids (will be joined with commas)
 * @param {Array<object>} items  per-question metadata (will be trimmed)
 * @param {object} meta      { sessionQueryString, totalCount?, cachedCount?, cachedAt? }
 * @returns {boolean}        true on success, false if we couldn't fit it
 *
 * Never throws. Calling code can check the return value if it cares,
 * but most call sites just want fire-and-forget caching that doesn't
 * crash the page if storage is full.
 */
export function savePracticeSession(sid, ids, items, meta) {
  if (typeof window === 'undefined' || !sid) return false;

  // Pre-emptive LRU eviction: if we're already over the cache cap,
  // drop the oldest sessions before we even try to write.
  try {
    const existing = listSessionsByAge().filter((s) => s.sid !== sid);
    while (existing.length >= MAX_CACHED_SESSIONS) {
      const oldest = existing.shift();
      if (oldest) removeSession(oldest.sid);
    }
  } catch {}

  const baseKey = KEY_PREFIX + sid;
  const itemsKey = baseKey + ITEMS_SUFFIX;
  const metaKey = baseKey + META_SUFFIX;

  const idsCsv = (ids || []).join(',');
  const trimmedItems = JSON.stringify((items || []).map(trimItem));
  const metaJson = JSON.stringify({
    sessionQueryString: meta?.sessionQueryString || '',
    totalCount: meta?.totalCount ?? (ids?.length ?? 0),
    cachedCount: meta?.cachedCount ?? (ids?.length ?? 0),
    cachedAt: meta?.cachedAt || new Date().toISOString(),
  });

  // Try to write all three keys. On quota error, evict the oldest
  // surviving session (other than ourselves) and retry. Cap the
  // retries so we can't loop forever on a pathological case.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      localStorage.setItem(baseKey, idsCsv);
      localStorage.setItem(itemsKey, trimmedItems);
      localStorage.setItem(metaKey, metaJson);
      return true;
    } catch (err) {
      if (!isQuotaError(err)) {
        // Non-quota failure (e.g. private browsing where Storage is
        // disabled). Roll back the partial write and bail.
        removeSession(sid);
        return false;
      }
      // Quota: drop the oldest other session and retry. If we're the
      // only one left and still don't fit, the items array is bigger
      // than the entire localStorage budget — give up cleanly.
      const remaining = listSessionsByAge().filter((s) => s.sid !== sid);
      if (remaining.length === 0) {
        removeSession(sid);
        return false;
      }
      const oldest = remaining[0];
      removeSession(oldest.sid);
    }
  }

  removeSession(sid);
  return false;
}
