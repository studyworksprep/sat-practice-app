'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Script from 'next/script';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Toast from '../../../components/Toast';
import HtmlBlock from '../../../components/HtmlBlock';

function IconCalculator({ className = '' }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="16" height="20" x="4" y="2" rx="2" />
      <line x1="8" x2="16" y1="6" y2="6" />
      <line x1="16" x2="16" y1="14" y2="18" />
      <path d="M16 10h.01" />
      <path d="M12 10h.01" />
      <path d="M8 10h.01" />
      <path d="M12 14h.01" />
      <path d="M8 14h.01" />
      <path d="M12 18h.01" />
      <path d="M8 18h.01" />
    </svg>
  );
}

function IconReference({ className = '' }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}

function formatCorrectText(ct) {
  if (!ct) return null;
  if (Array.isArray(ct)) return ct;
  if (typeof ct === 'string') {
    const t = ct.trim();
    if (t.startsWith('[') && t.endsWith(']')) {
      try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return [t];
  }
  return [String(ct)];
}

/**
 * Desmos panel:
 * - Creates a single GraphingCalculator instance (no re-init on re-render).
 * - Persists calculator state across minimize/expand and across resizes.
 * - Uses ResizeObserver + a rAF "safeResize" to stabilize post-drag layout commits.
 * - Stores state in localStorage (per-question key).
 */
function DesmosPanel({ isOpen, storageKey }) {
  const hostRef = useRef(null);
  const calcRef = useRef(null);
  const savedStateRef = useRef(null);
  const prevOpenRef = useRef(isOpen);

  const roRef = useRef(null);
  const rafRef = useRef(null);

  const [ready, setReady] = useState(false);

  // If the script was already loaded, onLoad might not fire.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.Desmos) setReady(true);
  }, []);

  const safeResize = () => {
    if (!calcRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      try {
        calcRef.current.resize();
      } catch {}
    });
  };

  const saveState = () => {
    if (!calcRef.current) return;
    try {
      const st = calcRef.current.getState();
      savedStateRef.current = st;
      if (storageKey && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(storageKey, JSON.stringify(st));
      }
    } catch {}
  };

  const restoreState = () => {
    if (!calcRef.current) return;

    let st = savedStateRef.current;

    try {
      if (!st && storageKey && typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) st = JSON.parse(raw);
      }
    } catch {}

    if (st) {
      try {
        // Avoid polluting undo history when restoring.
        calcRef.current.setState(st, { allowUndo: false });
      } catch {}
    }
  };

  // Initialize exactly once (when script ready + host exists).
  useEffect(() => {
    if (!ready) return;
    if (!hostRef.current) return;
    if (!window.Desmos) return;

    if (!calcRef.current) {
      calcRef.current = window.Desmos.GraphingCalculator(hostRef.current, {
        autosize: true,
        keypad: true,
        expressions: true,
        settingsMenu: true,
        zoomButtons: true,
      });

      restoreState();
      safeResize();
    }

    return () => {
      // If the page unmounts, persist and destroy cleanly.
      saveState();
      try {
        calcRef.current?.destroy?.();
      } catch {}
      calcRef.current = null;

      try {
        roRef.current?.disconnect?.();
      } catch {}
      roRef.current = null;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Observe container size changes -> resize().
  useEffect(() => {
    if (!ready) return;
    if (!hostRef.current) return;
    if (!calcRef.current) return;
    if (typeof ResizeObserver === 'undefined') return;

    try {
      roRef.current?.disconnect?.();
    } catch {}
    roRef.current = new ResizeObserver(() => safeResize());
    roRef.current.observe(hostRef.current);

    return () => {
      try {
        roRef.current?.disconnect?.();
      } catch {}
      roRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Save on close; restore + resize on open.
  useEffect(() => {
    const prev = prevOpenRef.current;

    if (prev && !isOpen) saveState();
    if (!prev && isOpen) {
      restoreState();
      safeResize();
    }

    prevOpenRef.current = isOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Use env var on Vercel; fallback keeps dev from breaking if env not yet set.
  const apiKey =
    (typeof process !== 'undefined' && process?.env?.NEXT_PUBLIC_DESMOS_API_KEY) ||
    'bac289385bcd4778a682276b95f5f116';

  return (
    <>
      <Script
        src={`https://www.desmos.com/api/v1.11/calculator.js?apiKey=${apiKey}`}
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
      />
      <div ref={hostRef} className="desmosHost" />
    </>
  );
}

export default function PracticeQuestionPage() {
  const { questionId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  const [selected, setSelected] = useState(null);
  const [responseText, setResponseText] = useState('');

  const [showExplanation, setShowExplanation] = useState(false);

  const refCardRef = useRef(null);
  const refDrag = useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  const [refPos, setRefPos] = useState({ x: 0, y: 0 }); // px offsets from initial position

  // ✅ Smooth dragging refs (avoid React re-render during drag)
  const refPosRef = useRef({ x: 0, y: 0 });
  const refDragRafRef = useRef(null);

  const [showRef, setShowRef] = useState(false);

  // Keep refPosRef synced with state (state is the persisted value)
  useEffect(() => {
    refPosRef.current = refPos;
  }, [refPos]);

  // When the reference window opens, apply the persisted transform once
  useEffect(() => {
    if (!showRef) return;
    const card = refCardRef.current;
    if (!card) return;
    const { x, y } = refPosRef.current;
    card.style.transform = `translate(calc(-50% + ${x}px), ${y}px)`;
  }, [showRef]);

  // Math tools
  // ✅ Draggable divider + minimize (not close)
  const DEFAULT_CALC_W = 660; // wide enough that Desmos starts in its roomier layout
  const MIN_CALC_W = 450;
  const MAX_CALC_W = 760;
  const MINIMIZED_W = 56;

  const [calcMinimized, setCalcMinimized] = useState(false);
  const [calcWidth, setCalcWidth] = useState(DEFAULT_CALC_W);

  // IMPORTANT: prevent flicker by avoiding React updates during drag
  const shellRef = useRef(null);
  const liveWidthRef = useRef(DEFAULT_CALC_W);
  const dragRef = useRef({
    dragging: false,
    startX: 0,
    startW: DEFAULT_CALC_W,
    pendingW: DEFAULT_CALC_W,
  });

  // Option A neighbor nav
  const [prevId, setPrevId] = useState(null);
  const [nextId, setNextId] = useState(null);

  // Start false; we explicitly flip to true when we begin fetching neighbors
  const [navLoading, setNavLoading] = useState(false);

  const [navMode, setNavMode] = useState('neighbors'); // 'neighbors' | 'index' fallback

  // ✅ tracks which questionId the current prevId/nextId correspond to (prevents stale-enable flash)
  const [navForId, setNavForId] = useState(null);

  // Instant navigation metadata (from list page or neighbor navigation)
  const [total, setTotal] = useState(null); // total in filtered session
  const [index1, setIndex1] = useState(null); // 1-based index in session

  // Cache: current page ids (25) for index-based fallback navigation
  const [pageIds, setPageIds] = useState([]); // ids for current offset page
  const [pageOffset, setPageOffset] = useState(0); // 0,25,50,...

  // ✅ Question Map (windowed, IDs fetched on open)
  const MAP_PAGE_SIZE = 100; // must be <= API limit cap
  const [showMap, setShowMap] = useState(false);
  const [mapOffset, setMapOffset] = useState(0); // 0,100,200...
  const [mapIds, setMapIds] = useState([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [jumpTo, setJumpTo] = useState('');

  const startedAtRef = useRef(Date.now());

  // Keep the same session filter params for API calls + navigation
  const sessionParams = useMemo(() => {
    const keys = ['difficulty', 'score_bands', 'domain', 'topic', 'marked_only', 'q', 'session'];
    const p = new URLSearchParams();
    for (const k of keys) {
      const v = searchParams.get(k);
      if (v !== null && v !== '') p.set(k, v);
    }
    return p;
  }, [searchParams]);

  const sessionParamsString = useMemo(() => sessionParams.toString(), [sessionParams]);
  const inSessionContext = sessionParams.get('session') === '1';

  // Keep liveWidthRef in sync with committed calcWidth
  useEffect(() => {
    liveWidthRef.current = calcWidth;
  }, [calcWidth]);

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function onRefHeaderPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return; // left click only
    e.preventDefault();

    const card = refCardRef.current;
    if (!card) return;

    refDrag.current.dragging = true;
    refDrag.current.startX = e.clientX;
    refDrag.current.startY = e.clientY;

    // Start from persisted ref value (NOT state)
    const cur = refPosRef.current;
    refDrag.current.origX = cur.x;
    refDrag.current.origY = cur.y;

    const applyTransform = (x, y) => {
      const el = refCardRef.current;
      if (!el) return;
      el.style.transform = `translate(calc(-50% + ${x}px), ${y}px)`;
    };

    const onMove = (ev) => {
      if (!refDrag.current.dragging) return;

      const el = refCardRef.current;
      if (!el) return;

      const dx = ev.clientX - refDrag.current.startX;
      const dy = ev.clientY - refDrag.current.startY;

      let nx = refDrag.current.origX + dx;
      let ny = refDrag.current.origY + dy;

      // Clamp to viewport using current rect
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const margin = 12;

      const minDx = margin - rect.left;
      const maxDx = vw - margin - rect.right;
      const minDy = margin - rect.top;
      const maxDy = vh - margin - rect.bottom;

      const curPos = refPosRef.current;
      nx = curPos.x + clamp(nx - curPos.x, minDx, maxDx);
      ny = curPos.y + clamp(ny - curPos.y, minDy, maxDy);

      // Store live position without re-render
      refPosRef.current = { x: nx, y: ny };

      // Throttle DOM writes to animation frames
      if (refDragRafRef.current) cancelAnimationFrame(refDragRafRef.current);
      refDragRafRef.current = requestAnimationFrame(() => applyTransform(nx, ny));
    };

    const onUp = () => {
      refDrag.current.dragging = false;

      if (refDragRafRef.current) cancelAnimationFrame(refDragRafRef.current);
      refDragRafRef.current = null;

      // Commit final position once (persist)
      setRefPos(refPosRef.current);

      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // support "i" (1-based index) for neighbor navigation
  function buildHref(targetId, t, o, p, i) {
    const qs = new URLSearchParams(sessionParams);
    if (t != null) qs.set('t', String(t));
    if (o != null) qs.set('o', String(o));
    if (p != null) qs.set('p', String(p));
    if (i != null) qs.set('i', String(i));
    return `/practice/${targetId}?${qs.toString()}`;
  }

  function getIndexFromUrl() {
    const i = Number(searchParams.get('i'));
    if (Number.isFinite(i) && i >= 1) return i;

    const o = Number(searchParams.get('o'));
    const p = Number(searchParams.get('p'));
    if (Number.isFinite(o) && o >= 0 && Number.isFinite(p) && p >= 0) return o + p + 1;

    return null;
  }

  async function fetchQuestion() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/questions/${questionId}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load question');

      setData(json);

      if (json?.status?.status_json?.last_selected_option_id) setSelected(json.status.status_json.last_selected_option_id);
      else setSelected(null);

      if (json?.status?.status_json?.last_response_text) setResponseText(json.status.status_json.last_response_text);
      else setResponseText('');

      startedAtRef.current = Date.now();
      setShowExplanation(false);
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function fetchPageIds(offset) {
    const key = `practice_${sessionParamsString}_page_${offset}`;

    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length > 0) return arr;
      } catch {}
    }

    const apiParams = new URLSearchParams(sessionParams);
    apiParams.delete('session');
    apiParams.set('limit', '25');
    apiParams.set('offset', String(offset));

    const res = await fetch('/api/questions?' + apiParams.toString(), { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || 'Failed to fetch page');

    const ids = (json.items || []).map((it) => it.question_id).filter(Boolean);

    localStorage.setItem(key, JSON.stringify(ids));
    return ids;
  }

  // ✅ Fetch IDs + metadata for map window (cached, loaded on modal open)
  async function fetchMapIds(offset) {
    const key = `practice_${sessionParamsString}_map_${offset}`;

    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length > 0) return arr;
      } catch {}
    }

    const apiParams = new URLSearchParams(sessionParams);
    apiParams.delete('session');
    apiParams.set('limit', String(MAP_PAGE_SIZE));
    apiParams.set('offset', String(offset));

    const res = await fetch('/api/questions?' + apiParams.toString(), { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || 'Failed to fetch map ids');

    const items = (json.items || []).filter((it) => it?.question_id);

    localStorage.setItem(key, JSON.stringify(items));
    return items;
  }

  async function loadMapPage(offset) {
    setMapLoading(true);
    try {
      const safe = Math.max(0, offset);
      const items = await fetchMapIds(safe);
      setMapIds(items);
      setMapOffset(safe);
    } finally {
      setMapLoading(false);
    }
  }

  // look for "i" (index) in URL
  function primeNavMetaFromUrl() {
    const t = Number(searchParams.get('t'));
    const o = Number(searchParams.get('o'));
    const p = Number(searchParams.get('p'));
    const i = Number(searchParams.get('i'));

    if (Number.isFinite(t) && t >= 0) setTotal(t);
    if (Number.isFinite(o) && o >= 0) setPageOffset(o);

    if (Number.isFinite(i) && i >= 1) setIndex1(i);
    else if (Number.isFinite(o) && o >= 0 && Number.isFinite(p) && p >= 0) setIndex1(o + p + 1);
  }

  async function ensureCurrentPageIds() {
    const o = Number(searchParams.get('o'));
    const p = Number(searchParams.get('p'));

    if (!Number.isFinite(o) || o < 0) return;
    setPageOffset(o);

    const ids = await fetchPageIds(o);
    setPageIds(ids);

    if (!Number.isFinite(p) || p < 0) {
      const idx = ids.findIndex((id) => String(id) === String(questionId));
      if (idx >= 0) setIndex1(o + idx + 1);
    }
  }

  async function ensureTotalIfMissing() {
    if (total != null) return;

    const apiParams = new URLSearchParams(sessionParams);
    apiParams.delete('session');
    apiParams.set('limit', '1');
    apiParams.set('offset', '0');

    const res = await fetch('/api/questions?' + apiParams.toString(), { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || 'Failed to get total');
    setTotal(Number(json.totalCount || 0));
  }

  async function goToIndex(targetIndex1) {
    if (total != null) {
      if (targetIndex1 < 1 || targetIndex1 > total) return;
    } else {
      if (targetIndex1 < 1) return;
    }

    const targetOffset = Math.floor((targetIndex1 - 1) / 25) * 25;
    const targetPos = (targetIndex1 - 1) % 25;

    const ids = await fetchPageIds(targetOffset);
    const targetId = ids[targetPos];
    if (!targetId) return;

    setPageOffset(targetOffset);
    setPageIds(ids);
    setIndex1(targetIndex1);

    router.push(buildHref(targetId, total, targetOffset, targetPos, targetIndex1));
  }

  async function doJumpTo() {
    let n = Number(String(jumpTo).trim());
    if (!Number.isFinite(n)) return;

    n = Math.trunc(n);
    if (total != null) n = Math.min(Math.max(1, n), total);
    else n = Math.max(1, n);

    await goToIndex(n);
    setShowMap(false);
  }

  async function submitAttempt() {
    if (!data) return;

    const qTypeLocal = String(data?.version?.question_type || data?.question_type || '').toLowerCase();
    const time_spent_ms = Math.max(0, Date.now() - startedAtRef.current);

    const body = {
      question_id: data.question_id,
      selected_option_id: qTypeLocal === 'mcq' ? selected : null,
      response_text: qTypeLocal === 'spr' ? responseText : null,
      time_spent_ms,
    };

    try {
      setMsg(null);
      const res = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to submit attempt');

      await fetchQuestion();
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    }
  }

  async function toggleMarkForReview() {
    if (!data?.question_id) return;
    const next = !Boolean(data?.status?.marked_for_review);
    try {
      setMsg(null);

      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: {
            ...(prev.status || {}),
            marked_for_review: next,
          },
        };
      });

      const res = await fetch('/api/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: data.question_id, patch: { marked_for_review: next } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to update status');
    } catch (e) {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: {
            ...(prev.status || {}),
            marked_for_review: !next,
          },
        };
      });
      setMsg({ kind: 'danger', text: e.message });
    }
  }

  // ✅ Map open/close handlers + ESC
  async function openMap() {
    if (!inSessionContext) return;

    try {
      await ensureTotalIfMissing();

      const i = getIndexFromUrl() ?? index1 ?? 1;

      const startOffset = Math.floor((Math.max(1, i) - 1) / MAP_PAGE_SIZE) * MAP_PAGE_SIZE;

      setShowMap(true);
      setJumpTo('');
      await loadMapPage(startOffset);
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
      setShowMap(true);
      setJumpTo('');
      await loadMapPage(0);
    }
  }

  useEffect(() => {
    if (!showMap) return;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') setShowMap(false);
    };
    window.addEventListener('keydown', onKeyDown);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [showMap]);

  // ✅ Fetch neighbors (Option A) — prevent stale-enable by gating with navForId
  useEffect(() => {
    if (!questionId) {
      setNavLoading(false);
      setPrevId(null);
      setNextId(null);
      setNavForId(null);
      return;
    }

    setNavMode('neighbors');
    setNavLoading(true);

    // Clear stale IDs immediately
    setPrevId(null);
    setNextId(null);
    setNavForId(null);

    (async () => {
      try {
        const res = await fetch(`/api/questions/${questionId}/neighbors?${sessionParamsString}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Failed to load neighbors');

        setPrevId(json.prev_id || null);
        setNextId(json.next_id || null);

        // ✅ Mark that these neighbors belong to this question
        setNavForId(questionId);
      } catch (e) {
        setPrevId(null);
        setNextId(null);
        setNavForId(null);
        setNavMode('index');
        setMsg({ kind: 'danger', text: `Neighbors failed (fallback enabled): ${e.message}` });
      } finally {
        setNavLoading(false);
      }
    })();
  }, [questionId, sessionParamsString]);

  // Load question content
  useEffect(() => {
    if (!questionId) return;
    fetchQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  // Prime meta immediately
  useEffect(() => {
    primeNavMetaFromUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Ensure we have total + current page ids (fallback nav)
  useEffect(() => {
    if (!questionId) return;
    (async () => {
      try {
        await ensureTotalIfMissing();
        await ensureCurrentPageIds();
      } catch (e) {
        setMsg({ kind: 'danger', text: e.message });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId, searchParams]);

  // ✅ Load saved calculator width + minimized state (if any)
  useEffect(() => {
    try {
      const savedW = Number(localStorage.getItem('calcWidth'));
      if (Number.isFinite(savedW)) setCalcWidth(Math.min(Math.max(savedW, MIN_CALC_W), MAX_CALC_W));

      const savedMin = localStorage.getItem('calcMinimized');
      if (savedMin === '1') setCalcMinimized(true);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('calcWidth', String(calcWidth));
    } catch {}
  }, [calcWidth]);

  useEffect(() => {
    try {
      localStorage.setItem('calcMinimized', calcMinimized ? '1' : '0');
    } catch {}
  }, [calcMinimized]);

  const qType = String(data?.version?.question_type || data?.question_type || '').toLowerCase();
  const version = data?.version || {};
  const options = Array.isArray(data?.options) ? data.options : [];
  const status = data?.status || {};
  const locked = Boolean(status?.is_done);
  const correctOptionId = data?.correct_option_id || null;
  const correctText = data?.correct_text || null;

  const domainCode = String(data?.taxonomy?.domain_code || '').toUpperCase().trim();

  // Reading domain codes (existing behavior)
  const useTwoColReading = qType === 'mcq' && ['EOI', 'INI', 'CAS', 'SEC'].includes(domainCode);

  // Math domain codes (new behavior)
  const isMath = ['H', 'P', 'S', 'Q'].includes(domainCode);

  // ✅ Removed Attempts pill
  const headerPills = [
    { label: 'Correct', value: status?.correct_attempts_count ?? 0 },
    { label: 'Done', value: status?.is_done ? 'Yes' : 'No' },
  ];

  // ✅ Pills row now includes Question # (index1) on the left
  const StatusPillsRow = ({ style }) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
        ...(style || {}),
      }}
    >
      <div className="qNumBadge" aria-label={`Question ${index1 ?? 'unknown'}`}>
        {index1 ?? '—'}
      </div>

      <div className="row" style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {headerPills.map((p) => (
          <span key={p.label} className="pill">
            <span className="muted">{p.label}</span> <span className="kbd">{p.value}</span>
          </span>
        ))}

        <button
          type="button"
          className={`markReviewTopBtn ${status?.marked_for_review ? 'isMarked' : ''}`}
          onClick={toggleMarkForReview}
          title={status?.marked_for_review ? 'Marked for review' : 'Mark for review'}
        >
          <span className="markReviewTopBtnIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path fill="currentColor" d="M6 3h12a1 1 0 0 1 1 1v17l-7-3-7 3V4a1 1 0 0 1 1-1z" />
            </svg>
          </span>
          {status?.marked_for_review ? 'Marked for Review' : 'Mark for Review'}
        </button>
      </div>
    </div>
  );

  const prevDisabled = navLoading || !index1 || index1 <= 1 || !prevId;
  const nextDisabled = navLoading || !index1 || !total || index1 >= total || !nextId;

  // ✅ Only enable neighbor nav when neighbors are loaded for THIS questionId
  const neighborsReady = navMode === 'neighbors' && navForId === questionId && !navLoading;

  const goPrev = () => {
    if (navMode === 'neighbors') {
      if (prevDisabled) return;

      const nextI = index1 != null ? Math.max(1, index1 - 1) : null;
      setIndex1(nextI);

      router.push(buildHref(prevId, total, null, null, nextI));
      return;
    }
    if (index1 == null) return;
    goToIndex(index1 - 1);
  };

  const goNext = () => {
    if (navMode === 'neighbors') {
      if (nextDisabled) return;

      const nextI = index1 != null ? index1 + 1 : null;
      setIndex1(nextI);

      router.push(buildHref(nextId, total, null, null, nextI));
      return;
    }
    if (index1 == null) return;
    goToIndex(index1 + 1);
  };

  // ✅ No visible "Stimulus/Question" headers (keep srOnly for a11y)
  const PromptBlocks = ({ mb = 12 }) => (
    <>
      {version?.stimulus_html ? (
        <div className="card subcard" style={{ marginBottom: mb }}>
          <div className="srOnly">Stimulus</div>
          <HtmlBlock className="prose" html={version.stimulus_html} />
        </div>
      ) : null}

      {version?.stem_html ? (
        <div className="card subcard" style={{ marginBottom: mb }}>
          <div className="srOnly">Question</div>
          <HtmlBlock className="prose" html={version.stem_html} />
        </div>
      ) : null}
    </>
  );

  // Math tools moved to top nav as icon tabs (keep component for minimal diffs where it's called)
  const MathToolRow = () => null;

  // ✅ MCQ options area (no "Answer choices" header)
  const McqOptionsArea = () => (
    <>
      <div className="srOnly">Answer choices</div>

      <div className="optionList">
        {options
          .slice()
          .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
          .map((opt) => {
            const isSelected = selected === opt.id;

            return (
              <div
                key={opt.id}
                className={(() => {
                  let cls = 'option' + (isSelected ? ' selected' : '');

                  if (locked) {
                    const isCorrect = String(opt.id) === String(correctOptionId);
                    const hasSelection = selected != null;

                    // Selected answer: green if correct, red if incorrect
                    if (isSelected && isCorrect) cls += ' correct';
                    else if (isSelected && hasSelection && !isCorrect) cls += ' incorrect';

                    // Reveal correct option if selected wrong
                    const selectedIsWrong = hasSelection && String(selected) !== String(correctOptionId);
                    if (!isSelected && isCorrect && selectedIsWrong) cls += ' revealCorrect';
                  }

                  return cls;
                })()}
                onClick={() => {
                  if (locked) return;
                  setSelected(opt.id);
                }}
                style={{ cursor: locked ? 'default' : 'pointer' }}
              >
                <div className="optionBadge">{opt.label || String.fromCharCode(65 + (opt.ordinal ?? 0))}</div>
                <div className="optionContent">
                  <HtmlBlock className="prose" html={opt.content_html} />
                </div>
              </div>
            );
          })}
      </div>

      <div className="row" style={{ gap: 10, marginTop: 14 }}>
        <div className="btnRow">
          <button className="btn primary" onClick={submitAttempt} disabled={locked || !selected}>
            Submit
          </button>
        </div>

        {locked && (version?.rationale_html || version?.explanation_html) ? (
          <button className="btn secondary" onClick={() => setShowExplanation((s) => !s)}>
            {showExplanation ? 'Hide Explanation' : 'Show Explanation'}
          </button>
        ) : null}

        <div className="btnRow">
          <button className="btn secondary" onClick={goPrev} disabled={prevDisabled}>
            Prev
          </button>

          <button
            className="btn secondary"
            onClick={goNext}
            disabled={nextDisabled || (navMode === 'neighbors' && !neighborsReady)}
          >
            Next
          </button>
        </div>
      </div>
    </>
  );

  // ✅ SPR answer area (no "Your answer" header)
  const SprAnswerArea = () => (
    <>
      <div className="srOnly">Your answer</div>

      {locked ? (
        <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <span className="pill">
            <span className="muted">Result</span>{' '}
            <span className="kbd">{status?.last_is_correct ? 'Correct' : 'Incorrect'}</span>
          </span>

          {!status?.last_is_correct && correctText ? (
            <span className="pill">
              <span className="muted">Correct answer</span>{' '}
              <span className="kbd">{formatCorrectText(correctText)?.join(' or ')}</span>
            </span>
          ) : null}
        </div>
      ) : null}

      <textarea
        className="input"
        value={responseText}
        onChange={(e) => setResponseText(e.target.value)}
        placeholder="Type your answer…"
        rows={4}
        disabled={locked}
        style={{ marginTop: 10 }}
      />

      <div className="row" style={{ gap: 10, marginTop: 14 }}>
        <button className="btn" onClick={submitAttempt} disabled={locked || !responseText.trim()}>
          Submit
        </button>

        {locked && (version?.rationale_html || version?.explanation_html) ? (
          <button className="btn secondary" onClick={() => setShowExplanation((s) => !s)}>
            {showExplanation ? 'Hide Explanation' : 'Show Explanation'}
          </button>
        ) : null}

        <button className="btn secondary" onClick={goPrev} disabled={prevDisabled}>
          Prev
        </button>

        <button
          className="btn secondary"
          onClick={goNext}
          disabled={nextDisabled || (navMode === 'neighbors' && !neighborsReady)}
        >
          Next
        </button>
      </div>
    </>
  );

  // ✅ Divider drag handlers (math shell only)
  // Live-resize via CSS var (no React re-render) => prevents flicker.
  function onDividerPointerDown(e) {
    if (calcMinimized) return;
    e.preventDefault();

    dragRef.current.dragging = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.startW = liveWidthRef.current;
    dragRef.current.pendingW = liveWidthRef.current;

    e.currentTarget.setPointerCapture?.(e.pointerId);

    const onMove = (ev) => {
      if (!dragRef.current.dragging) return;
      const dx = ev.clientX - dragRef.current.startX;
      const next = Math.min(Math.max(dragRef.current.startW + dx, MIN_CALC_W), MAX_CALC_W);

      dragRef.current.pendingW = next;
      liveWidthRef.current = next;

      // Update CSS variable directly (no React state update)
      shellRef.current?.style.setProperty('--calcW', `${next}px`);
    };

    const onUp = () => {
      dragRef.current.dragging = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);

      // Commit once
      setCalcWidth(dragRef.current.pendingW);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // Math shell wrapper (calculator left, question right; draggable divider; minimize)
  const MathShell = ({ children }) => (
    <div
      ref={shellRef}
      className={`mathShell ${calcMinimized ? 'min' : 'withCalc'}`}
      style={{ '--calcW': `${calcMinimized ? MINIMIZED_W : calcWidth}px` }}
    >
      <aside className={`mathLeft ${calcMinimized ? 'min' : ''}`} aria-label="Calculator panel">
        <div className="mathLeftHeader">
          <div className="mathToolTitle">{calcMinimized ? 'Calc' : 'Calculator'}</div>
          <button type="button" className="btn secondary" onClick={() => setCalcMinimized((m) => !m)}>
            {calcMinimized ? 'Expand' : 'Minimize'}
          </button>
        </div>

        {/* Keep mounted; hide visually when minimized */}
        <div className={`calcBody ${calcMinimized ? 'hidden' : ''}`}>
          <DesmosPanel isOpen={!calcMinimized} storageKey={questionId ? `desmos:${questionId}` : 'desmos:unknown'} />
        </div>
        {calcMinimized ? <div className="calcMinBody" /> : null}
      </aside>

      {!calcMinimized ? (
        <div
          className="mathDivider"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize calculator panel"
          onPointerDown={onDividerPointerDown}
          title="Drag to resize"
        />
      ) : (
        <div className="mathDivider min" aria-hidden="true" />
      )}

      <main className="mathRight">{children}</main>
    </div>
  );

  if (loading && !data) {
    return (
      <main className="container">
        <div className="h2">Practice</div>
        <div className="muted">Loading…</div>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: 6, flex: 1, minWidth: 0 }}>
          <div className="h2">Practice</div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              gap: 12,
            }}
          >
            {/* LEFT */}
            <div>
              <Link className="btn secondary" href="/practice">
                ← Back to list
              </Link>
            </div>

            {/* CENTER */}
            <div style={{ display: 'flex', justifyContent: 'center', flex: 1 }}>
              <button
                type="button"
                className="qmapTrigger"
                onClick={openMap}
                disabled={!inSessionContext}
                title={inSessionContext ? 'Open question map' : 'Map available when opened from the practice list'}
                aria-label="Open question map"
              >
                <span className="qmapTriggerCount">
                  {index1 != null && total != null ? (
                    <>
                      {index1} / {total}
                    </>
                  ) : total != null ? (
                    <>— / {total}</>
                  ) : (
                    <>…</>
                  )}
                </span>
                <span className="qmapTriggerChevron" aria-hidden="true">
                  ▾
                </span>
              </button>
            </div>

            {/* RIGHT */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              {isMath ? (
                <div className="toolTabs" role="tablist" aria-label="Math tools">
                  <button
                    type="button"
                    className={`toolTab ${!calcMinimized ? 'active' : ''}`}
                    onClick={() => setCalcMinimized((m) => !m)}
                    aria-pressed={!calcMinimized}
                    title={!calcMinimized ? 'Minimize calculator' : 'Expand calculator'}
                  >
                    <IconCalculator className="toolTabIcon" />
                    <span className="toolTabLabel">Calculator</span>
                  </button>

                  <button
                    type="button"
                    className={`toolTab ${showRef ? 'active' : ''}`}
                    onClick={() => setShowRef(true)}
                    aria-pressed={showRef}
                    title="Open reference sheet"
                  >
                    <IconReference className="toolTabIcon" />
                    <span className="toolTabLabel">Reference</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <Toast kind={msg?.kind} message={msg?.text} />

      <hr />

      {qType === 'mcq' ? (
        useTwoColReading ? (
          // Reading: left stimulus/stem; right status+answers
          <div className="qaTwoCol">
            <div className="qaLeft">
              <PromptBlocks mb={12} />
            </div>

            <div className="qaRight">
              <div className="card subcard" style={{ padding: 12, marginBottom: 12 }}>
                <StatusPillsRow />
              </div>
              <McqOptionsArea />
            </div>
          </div>
        ) : isMath ? (
          // Math: calc left; right status+prompt+answers
          <MathShell>
            <MathToolRow />
            <div className="card subcard" style={{ padding: 12, marginBottom: 12 }}>
              <StatusPillsRow />
            </div>
            <PromptBlocks mb={12} />
            <McqOptionsArea />
          </MathShell>
        ) : (
          // Default MCQ
          <div>
            <div className="card subcard" style={{ padding: 12, marginBottom: 12 }}>
              <StatusPillsRow />
            </div>
            <PromptBlocks mb={12} />
            <McqOptionsArea />
          </div>
        )
      ) : isMath ? (
        // Math SPR
        <MathShell>
          <MathToolRow />
          <div className="card subcard" style={{ padding: 12, marginBottom: 12 }}>
            <StatusPillsRow />
          </div>
          <PromptBlocks mb={12} />
          <SprAnswerArea />
        </MathShell>
      ) : (
        // Default SPR
        <div>
          <div className="card subcard" style={{ padding: 12, marginBottom: 12 }}>
            <StatusPillsRow />
          </div>
          <PromptBlocks mb={12} />
          <SprAnswerArea />
        </div>
      )}

      {(version?.rationale_html || version?.explanation_html) && locked && showExplanation ? (
        <>
          <hr />
          <div className="card explanation" style={{ marginTop: 10 }}>
            <div className="sectionLabel">Explanation</div>
            <HtmlBlock className="prose" html={version.rationale_html || version.explanation_html} />
          </div>
        </>
      ) : null}

      {showRef ? (
        <div
          className="modalOverlay"
          onClick={() => setShowRef(false)}
          role="dialog"
          aria-modal="true"
          aria-label="SAT Math reference sheet"
        >
          <div
            ref={refCardRef}
            className="modalCard"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(980px, 96vw)',
              maxHeight: 'calc(100vh - 120px)',
              position: 'fixed',
              left: '50%',
              top: 80,
              transform: `translate(calc(-50% + ${refPos.x}px), ${refPos.y}px)`,
              willChange: 'transform',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div className="refModalHeader" onPointerDown={onRefHeaderPointerDown}>
              <div className="h2" style={{ margin: 0 }}>
                SAT Math Reference Sheet
              </div>

              <button
                type="button"
                className="refModalClose"
                onClick={() => setShowRef(false)}
                aria-label="Close reference sheet"
              >
                ×
              </button>
            </div>

            <div className="refSheetContent" aria-label="SAT Math Reference sheet image">
              <img
                className="refSheetImg"
                src="/math_reference_sheet.png"
                alt="SAT Math Reference Sheet"
                draggable={false}
              />
            </div>
          </div>
        </div>
      ) : null}

      {showMap ? (
        <div
          className="modalOverlay"
          onClick={() => setShowMap(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Question map"
        >
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <div className="h2" style={{ margin: 0 }}>
                  Question Map
                </div>
                <div className="muted small">
                  {total != null ? (
                    <>
                      Showing <span className="kbd">{mapOffset + 1}</span>–<span className="kbd">{Math.min(mapOffset + MAP_PAGE_SIZE, total)}</span> of{' '}
                      <span className="kbd">{total}</span>
                    </>
                  ) : (
                    <>
                      Showing <span className="kbd">{mapOffset + 1}</span>–<span className="kbd">{mapOffset + MAP_PAGE_SIZE}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="btnRow" style={{ alignItems: 'center' }}>
                <input
                  className="input"
                  style={{ width: 140 }}
                  value={jumpTo}
                  onChange={(e) => setJumpTo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      doJumpTo();
                    }
                  }}
                  placeholder="Jump to #"
                  inputMode="numeric"
                />
                <button className="btn primary" disabled={mapLoading} onClick={doJumpTo}>
                  Go
                </button>

                <button className="btn secondary" onClick={() => setShowMap(false)}>
                  Close
                </button>
              </div>
            </div>

            <hr />

            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div className="btnRow">
                <button
                  className="btn secondary"
                  onClick={() => loadMapPage(mapOffset - MAP_PAGE_SIZE)}
                  disabled={mapLoading || mapOffset <= 0}
                >
                  Prev
                </button>

                <button
                  className="btn secondary"
                  onClick={() => loadMapPage(mapOffset + MAP_PAGE_SIZE)}
                  disabled={mapLoading || (total != null ? mapOffset + MAP_PAGE_SIZE >= total : false)}
                >
                  Next
                </button>
              </div>

              <div className="pill">
                <span className="muted">Current</span> <span className="kbd">{index1 ?? '—'}</span>
              </div>
            </div>

            <div className="questionGrid" style={{ marginTop: 12 }}>
              {mapLoading ? (
                <div className="muted" style={{ gridColumn: '1 / -1' }}>
                  Loading…
                </div>
              ) : mapIds.length === 0 ? (
                <div className="muted" style={{ gridColumn: '1 / -1' }}>
                  No questions in this range.
                </div>
              ) : (
                mapIds.map((it, pos) => {
                  const id = it.question_id;
                  const i = mapOffset + pos + 1;
                  const active = index1 != null && i === index1;

                  const diff = Number(it.difficulty);
                  const diffClass =
                    diff === 1 ? 'diffEasy' : diff === 2 ? 'diffMed' : diff === 3 ? 'diffHard' : 'diffUnknown';

                  const showMark = Boolean(it.marked_for_review);
                  const showDone = Boolean(it.is_done);
                  const showCorrect = showDone && it.last_is_correct === true;
                  const showIncorrect = showDone && it.last_is_correct === false;

                  return (
                    <button
                      key={String(id)}
                      type="button"
                      className={`mapItem ${diffClass}${active ? ' active' : ''}`}
                      onClick={() => {
                        setIndex1(i);
                        const o25 = Math.floor((i - 1) / 25) * 25;
                        const p25 = (i - 1) % 25;
                        setShowMap(false);
                        router.push(buildHref(id, total, o25, p25, i));
                      }}
                      title={`Go to #${i}`}
                    >
                      <span className="mapNum">{i}</span>

                      {showMark ? (
                        <span className="mapIconCorner mapIconLeft" aria-hidden="true">
                          <span className="mapIconBadge mark" title="Marked for review">
                            <svg viewBox="0 0 24 24" width="14" height="14">
                              <path fill="currentColor" d="M6 3h12a1 1 0 0 1 1 1v17l-7-3-7 3V4a1 1 0 0 1 1-1z" />
                            </svg>
                          </span>
                        </span>
                      ) : null}

                      {showCorrect || showIncorrect ? (
                        <span className="mapIconCorner mapIconRight" aria-hidden="true">
                          {showCorrect ? (
                            <span className="mapIconBadge correct" title="Correct">
                              <svg viewBox="0 0 24 24" width="14" height="14">
                                <path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                              </svg>
                            </span>
                          ) : null}

                          {showIncorrect ? (
                            <span className="mapIconBadge incorrect" title="Incorrect">
                              <svg viewBox="0 0 24 24" width="14" height="14">
                                <path
                                  fill="currentColor"
                                  d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3 10.6 10.6 16.9 4.3z"
                                />
                              </svg>
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>

            {total != null && total > MAP_PAGE_SIZE ? (
              <div className="muted small" style={{ marginTop: 10 }}>
                Showing {MAP_PAGE_SIZE} at a time. Use Prev/Next or “Jump to #” for fast navigation.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Minimal CSS for the math resizable divider + minimized state (kept local to this page) */}
      <style jsx global>{`
        .mathShell {
          display: grid;
          gap: 0;
          align-items: stretch;
          grid-template-columns: var(--calcW, 660px) 12px minmax(0, 1fr);
        }

        .mathLeft {
          position: sticky;
          top: 12px;
          align-self: start;
          border: 1px solid var(--border);
          border-radius: 18px;
          background: #f9fafb;
          max-height: calc(100vh - 24px);
          overflow: hidden;
        }

        .mathLeftHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-bottom: 1px solid var(--border);
          background: rgba(17, 24, 39, 0.03);
        }

        .mathToolTitle {
          font-weight: 700;
        }

        .calcBody.hidden {
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
        }

        .desmosHost {
          width: 100%;
          height: min(560px, calc(100vh - 220px));
          background: #fff;
        }

        .calcMinBody {
          height: calc(100vh - 92px);
        }

        .mathDivider {
          cursor: col-resize;
          position: relative;
          align-self: stretch;
          min-height: 360px;
          touch-action: none;
        }

        .mathDivider::before {
          content: '';
          position: absolute;
          inset: 0;
          margin: 0 auto;
          width: 1px;
          background: var(--border);
        }

        .mathDivider::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 999px;
        }

        .mathDivider:hover::after {
          background: rgba(37, 99, 235, 0.06);
        }

        .mathDivider.min {
          cursor: default;
        }

        .mathRight {
          min-width: 0;
          padding-left: 12px;
        }

        /* Minimized state: hide the calculator column entirely (but keep it mounted) */
        .mathShell.min {
          grid-template-columns: 0px 0px minmax(0, 1fr);
        }
        
        /* keep the DOM mounted but invisible/non-interactive */
        .mathLeft.min {
          width: 0 !important;
          border: 0 !important;
          border-radius: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
          overflow: hidden !important;
          opacity: 0;
          pointer-events: none;
        }
        
        /* no divider when minimized */
        .mathDivider.min {
          display: none;
        }
        
        /* reclaim space on the right when calc is hidden */
        .mathShell.min .mathRight {
          padding-left: 0;
        }
        
        /* don't waste height in minimized mode */
        .mathShell.min .calcMinBody {
          height: 0 !important;
        }

        @media (max-width: 920px) {
          .mathShell,
          .mathShell.min {
            grid-template-columns: 1fr;
            gap: 14px;
          }
        
          .mathDivider,
          .mathDivider.min {
            display: none;
          }
        
          .mathLeft {
            position: relative;
            top: auto;
          }
        
          /* If minimized on small screens, hide the calc panel */
          .mathShell.min .mathLeft {
            display: none;
          }
        
          .desmosHost,
          .calcMinBody {
            height: 420px;
          }
        
          .mathRight {
            padding-left: 0;
          }
        }

        .toolTabs {
          display: inline-flex;
          align-items: stretch;
          gap: 18px;
          margin-left: 6px;
        }

        .toolTab {
          appearance: none;
          border: 0;
          background: transparent;
          cursor: pointer;

          display: grid;
          place-items: center;
          gap: 6px;

          padding: 6px 10px 8px;
          border-bottom: 3px solid transparent;

          color: var(--muted);
        }

        .toolTab:hover {
          color: var(--text);
        }

        .toolTab.active {
          color: var(--text);
          border-bottom-color: rgba(17, 24, 39, 0.9);
        }

        .toolTabIcon {
          width: 28px;
          height: 28px;
          display: block;
        }

        .toolTabLabel {
          font-size: 12.5px;
          font-weight: 600;
          line-height: 1;
        }

        .refModalHeader {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          padding-bottom: 8px;
          cursor: move;
          user-select: none;
        }

        .refModalClose {
          position: absolute;
          right: 0;
          top: 0;

          border: 0;
          background: transparent;
          font-size: 24px;
          line-height: 1;
          cursor: pointer;
          padding: 4px 8px;

          color: var(--muted);
        }

        .refModalClose:hover {
          color: var(--text);
        }

        .modalCard {
          overflow: hidden;
        }

        .refSheetContent {
          padding: 12px;
          overflow: auto;
          flex: 1;
        }

        .refSheetImg {
          display: block;
          margin: 0 auto;

          width: auto;
          height: auto;

          max-width: 100%;
          max-height: none;

          user-select: none;
          -webkit-user-drag: none;
          pointer-events: none;
        }

        .qNumBadge {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        
          background: #0b0b0b;
          color: #fff;
        
          font-weight: 800;
          font-size: 18px;
          line-height: 1;
        
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
        }
      `}</style>
    </main>
  );
}
