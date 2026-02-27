'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Script from 'next/script';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Toast from '../../../components/Toast';
import HtmlBlock from '../../../components/HtmlBlock';

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

function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

  // Uses NEXT_PUBLIC_DESMOS_API_KEY if present; otherwise falls back to the existing hardcoded key
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

/**
 * PDF.js renderer for in-app reference sheet display (consistent across browsers).
 * Renders pages into canvases inside a scroll container.
 * Uses a UMD build that reliably exposes a global.
 */
function PdfJsSheet({ url }) {
  const containerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(true);
  const [err, setErr] = useState(null);

  // pdf.js 2.x UMD exposes window['pdfjs-dist/build/pdf']
  const getPdfLib = () => {
    if (typeof window === 'undefined') return null;
    return window['pdfjs-dist/build/pdf'] || window.pdfjsLib || null;
  };

  useEffect(() => {
    if (getPdfLib()) setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    async function run() {
      setErr(null);
      setLoadingPdf(true);

      try {
        const pdfjsLib = getPdfLib();
        if (!pdfjsLib?.getDocument) throw new Error('PDF engine unavailable');

        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

        const task = pdfjsLib.getDocument(url);
        const pdf = await task.promise;
        if (cancelled) return;

        const el = containerRef.current;
        if (!el) return;
        el.innerHTML = '';

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          if (cancelled) return;

          const baseViewport = page.getViewport({ scale: 1 });
          const targetW = Math.min(920, el.clientWidth || 920);
          const scale = targetW / baseViewport.width;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);

          const wrap = document.createElement('div');
          wrap.style.display = 'grid';
          wrap.style.justifyContent = 'center';
          wrap.style.margin = '0 0 14px';
          wrap.appendChild(canvas);
          el.appendChild(wrap);

          await page.render({ canvasContext: ctx, viewport }).promise;
        }

        if (!cancelled) setLoadingPdf(false);
      } catch (e) {
        if (!cancelled) {
          setErr(e?.message || 'Failed to load reference sheet');
          setLoadingPdf(false);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [ready, url]);

  return (
    <>
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
        onError={() => {
          setErr('Failed to load PDF engine');
          setLoadingPdf(false);
        }}
      />
      {err ? <div className="muted">Error: {err}</div> : null}
      {loadingPdf ? <div className="muted">Loading reference sheet…</div> : null}
      <div ref={containerRef} style={{ width: '100%' }} />
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

  // Math tools
  // ✅ Draggable divider + minimize (not close)
  const DEFAULT_CALC_W = 660; // wide enough that Desmos starts in its roomier layout
  const MIN_CALC_W = 360;
  const MAX_CALC_W = 760;
  const MINIMIZED_W = 56;

  const [calcMinimized, setCalcMinimized] = useState(false);
  const [calcWidth, setCalcWidth] = useState(DEFAULT_CALC_W);

  // IMPORTANT: prevent flicker by avoiding React updates during drag
  const shellRef = useRef(null);
  const liveWidthRef = useRef(DEFAULT_CALC_W);
  const dragRef = useRef({ dragging: false, startX: 0, startW: DEFAULT_CALC_W, pendingW: DEFAULT_CALC_W });

  const [showRef, setShowRef] = useState(false);

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

      setMsg({ kind: 'success', text: next ? 'Marked for review' : 'Unmarked for review' });
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

  // Reference sheet modal: ESC close + prevent background scroll
  useEffect(() => {
    if (!showRef) return;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') setShowRef(false);
    };
    window.addEventListener('keydown', onKeyDown);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [showRef]);

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

  const headerPills = [
    { label: 'Attempts', value: status?.attempts_count ?? 0 },
    { label: 'Correct', value: status?.correct_attempts_count ?? 0 },
    { label: 'Done', value: status?.is_done ? 'Yes' : 'No' },
  ];

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

  // Shared prompt renderer (so MCQ + SPR don’t duplicate stimulus/stem blocks)
  const PromptBlocks = ({ compactLabels = false, hideQuestionLabel = false, mbWhenNotCompact = 12 }) => (
    <>
      {version?.stimulus_html ? (
        <div className="card subcard" style={{ marginBottom: compactLabels ? 0 : mbWhenNotCompact }}>
          <div className={compactLabels ? 'srOnly' : 'sectionLabel'}>Stimulus</div>
          <HtmlBlock className="prose" html={version.stimulus_html} />
        </div>
      ) : null}

      {version?.stem_html ? (
        <div className="card subcard" style={{ marginBottom: compactLabels ? 0 : mbWhenNotCompact }}>
          <div className={compactLabels || hideQuestionLabel ? 'srOnly' : 'sectionLabel'}>Question</div>
          <HtmlBlock className="prose" html={version.stem_html} />
        </div>
      ) : null}
    </>
  );

  // Math top-right tool buttons (only shown on math domains)
  const MathToolRow = ({ align = 'flex-end' } = {}) =>
    isMath ? (
      <div className="mathRightHeader" style={{ justifyContent: align }}>
        <button
          type="button"
          className="btn secondary"
          onClick={() => setCalcMinimized((m) => !m)}
          aria-label={calcMinimized ? 'Expand calculator' : 'Minimize calculator'}
          title={calcMinimized ? 'Expand calculator' : 'Minimize calculator'}
        >
          {calcMinimized ? 'Expand Calculator' : 'Minimize Calculator'}
        </button>

        <button type="button" className="btn secondary" onClick={() => setShowRef(true)}>
          Reference Sheet
        </button>
      </div>
    ) : null;

  // MCQ options area (shared between layouts)
  const McqOptionsArea = ({ showAnswerHeader = true }) => (
    <>
      {showAnswerHeader ? <div className="h2">Answer choices</div> : <div className="srOnly">Answer choices</div>}

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
                    if (isSelected && isCorrect) cls += ' correct';
                    else if (isSelected && !isCorrect) cls += ' incorrect';
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

  // SPR answer area (shared between layouts)
  const SprAnswerArea = () => (
    <>
      <div className="h2">Your answer</div>

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
      let nextW = dragRef.current.startW + dx;
      nextW = Math.max(MIN_CALC_W, Math.min(MAX_CALC_W, nextW));

      dragRef.current.pendingW = nextW;

      if (shellRef.current) {
        shellRef.current.style.setProperty('--calcW', `${nextW}px`);
      }
    };

    const onUp = () => {
      if (!dragRef.current.dragging) return;
      dragRef.current.dragging = false;

      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);

      const committed = dragRef.current.pendingW;
      setCalcWidth(committed);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  const MathShell = ({ children }) => (
    <div
      ref={shellRef}
      className="mathShell"
      style={{
        // default width comes from React state for initial render + commit;
        // during drag, we override --calcW directly.
        '--calcW': `${calcMinimized ? MINIMIZED_W : calcWidth}px`,
      }}
    >
      <aside className={`mathCalc ${calcMinimized ? 'min' : ''}`} aria-label="Calculator panel">
        <div className="calcHeader">
          <div className="muted small">{calcMinimized ? 'Calc' : 'Desmos Calculator'}</div>
        </div>

        {/* Keep mounted; hide visually when minimized */}
        <div className={`calcBody ${calcMinimized ? 'hidden' : ''}`}>
          <DesmosPanel isOpen={!calcMinimized} storageKey={questionId ? `desmos:${questionId}` : null} />
        </div>
      </aside>

      {!calcMinimized ? (
        <div
          className="mathDivider"
          role="separator"
          aria-orientation="vertical"
          tabIndex={0}
          onPointerDown={onDividerPointerDown}
          title="Drag to resize calculator"
        />
      ) : (
        <div className="mathDivider min" aria-hidden="true" />
      )}

      <main className="mathRight">{children}</main>
    </div>
  );

  if (loading) {
    return (
      <main className="container">
        <div className="muted">Loading…</div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="container">
        <div className="muted">No question data found.</div>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <div className="h2">Practice</div>

          <div className="row" style={{ alignItems: 'center', gap: 10 }}>
            <Link className="btn secondary" href="/practice">
              ← Back to list
            </Link>

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
        </div>

        <div className="row" style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn secondary"
            onClick={toggleMarkForReview}
            aria-pressed={Boolean(status?.marked_for_review)}
            title={status?.marked_for_review ? 'Marked for Review' : 'Mark for Review'}
          >
            {status?.marked_for_review ? 'Marked for Review' : 'Mark for Review'}
          </button>

          {headerPills.map((p) => (
            <span key={p.label} className="pill">
              <span className="muted">{p.label}</span> <span className="kbd">{p.value}</span>
            </span>
          ))}
        </div>
      </div>

      <Toast kind={msg?.kind} message={msg?.text} />

      <hr />

      {qType === 'mcq' ? (
        // MCQ branch
        useTwoColReading ? (
          // ✅ Preserve existing Reading two-column format
          <div className="qaTwoCol">
            <div className="qaLeft">
              <PromptBlocks compactLabels={true} mbWhenNotCompact={12} />
            </div>

            <div className="qaRight">
              <McqOptionsArea showAnswerHeader={false} />
            </div>
          </div>
        ) : isMath ? (
          // ✅ Math format: calculator left (resizable), question+answers right
          <MathShell>
            <MathToolRow />
            <PromptBlocks compactLabels={false} hideQuestionLabel={true} mbWhenNotCompact={12} />
            <McqOptionsArea showAnswerHeader={false} />
          </MathShell>
        ) : (
          // ✅ Default MCQ (non-reading, non-math): keep existing single-column behavior
          <div>
            <PromptBlocks compactLabels={false} mbWhenNotCompact={12} />
            <McqOptionsArea showAnswerHeader={true} />
          </div>
        )
      ) : (
        // SPR branch
        isMath ? (
          <MathShell>
            <MathToolRow />
            <PromptBlocks compactLabels={false} hideQuestionLabel={true} mbWhenNotCompact={12} />
            <SprAnswerArea />
          </MathShell>
        ) : (
          <div>
            <PromptBlocks compactLabels={false} mbWhenNotCompact={12} />
            <SprAnswerArea />
          </div>
        )
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

      {/* Math Reference Sheet Modal (local PDF in /public) */}
      {showRef ? (
        <div
          className="modalOverlay"
          onClick={() => setShowRef(false)}
          role="dialog"
          aria-modal="true"
          aria-label="SAT Math reference sheet"
        >
          <div className="modalCard" onClick={(e) => e.stopPropagation()} style={{ width: 'min(980px, 96vw)' }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div className="h2" style={{ margin: 0 }}>
                SAT Math Reference Sheet
              </div>
              <div className="btnRow">
                <a className="btn secondary" href="/math_reference_sheet.pdf" target="_blank" rel="noreferrer noopener">
                  Open
                </a>
                <button className="btn secondary" onClick={() => setShowRef(false)}>
                  Close
                </button>
              </div>
            </div>

            <hr />

            <div
              style={{
                height: '75vh',
                overflow: 'auto',
                borderRadius: 12,
                border: '1px solid var(--border)',
                padding: 12,
              }}
            >
              <PdfJsSheet url="/math_reference_sheet.pdf" />
              <div className="muted" style={{ marginTop: 10 }}>
                If the preview doesn’t load, use “Open” above.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showMap ? (
        <div className="modalOverlay" onClick={() => setShowMap(false)} role="dialog" aria-modal="true" aria-label="Question map">
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
                <button type="button" className="btn secondary" onClick={doJumpTo} disabled={!jumpTo.trim()}>
                  Go
                </button>

                <button type="button" className="btn secondary" onClick={() => setShowMap(false)}>
                  Close
                </button>
              </div>
            </div>

            <hr />

            <div className="mapGrid">
              {mapLoading ? (
                <div className="muted">Loading…</div>
              ) : (
                mapIds.map((it) => {
                  const id = it.question_id;
                  const i = it.index1;

                  const isCurrent = String(id) === String(questionId);

                  return (
                    <button
                      key={id}
                      type="button"
                      className={`mapItem ${isCurrent ? 'current' : ''} ${it.is_done ? 'done' : ''}`}
                      onClick={() => {
                        setShowMap(false);
                        router.push(buildHref(id, total, null, null, i));
                      }}
                      title={stripHtml(it?.stem_preview || '')}
                    >
                      <div className="mapIndex">{i}</div>
                      <div className="mapMeta">
                        <div className="mapSkill">{it.skill_desc || it.skill || '—'}</div>
                        <div className="mapDomain muted">{it.domain_code || ''}</div>
                      </div>

                      <div className="mapBadges">
                        {it.is_done ? (
                          <span className="mapIconBadge done" title={it.is_correct ? 'Done (correct)' : 'Done'}>
                            ✓
                          </span>
                        ) : null}
                        {it.marked_for_review ? (
                          <span className="mapIconBadge mark" title="Marked for review">
                            ★
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 14, gap: 10 }}>
              <button
                type="button"
                className="btn secondary"
                disabled={mapOffset <= 0 || mapLoading}
                onClick={() => loadMapPage(Math.max(0, mapOffset - MAP_PAGE_SIZE))}
              >
                Prev
              </button>

              <button
                type="button"
                className="btn secondary"
                disabled={total != null ? mapOffset + MAP_PAGE_SIZE >= total : mapIds.length < MAP_PAGE_SIZE || mapLoading}
                onClick={() => loadMapPage(mapOffset + MAP_PAGE_SIZE)}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
