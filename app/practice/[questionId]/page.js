'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Script from 'next/script';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Toast from '../../../components/Toast';
import HtmlBlock from '../../../components/HtmlBlock';
import SessionTimer from '../../../components/SessionTimer';
import { useKeyboardShortcuts } from '../../../lib/useKeyboardShortcuts';
import QuestionNotes from '../../../components/QuestionNotes';
import DesmosStateButton from '../../../components/DesmosStateButton';
import ConceptTags from '../../../components/ConceptTags';
import FlashcardsModal from '../../../components/FlashcardsModal';

const htmlHasContent = (html) => {
  if (!html) return false;
  if (/<img\s/i.test(html)) return true;
  const text = html.replace(/<[^>]+>/g, '').trim();
  return text.length > 0 && text !== 'NULL';
};

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
 * - When `disableLocalStorage` is true (e.g. students), the per-question
 *   calc state is NOT read from or written to localStorage — the
 *   calculator opens fresh every time. On mount we also clear any
 *   residual key so a student who previously played with the calc
 *   stops seeing yesterday's graph.
 */
function DesmosPanel({ isOpen, storageKey, calcInstanceRef, disableLocalStorage = false }) {
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

  // Clean up any pre-existing key for this question when the student
  // lands here. One-time per mount; safe no-op on subsequent resizes.
  useEffect(() => {
    if (!disableLocalStorage) return;
    if (!storageKey) return;
    if (typeof window === 'undefined' || !window.localStorage) return;
    try { window.localStorage.removeItem(storageKey); } catch {}
  }, [disableLocalStorage, storageKey]);

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
      if (!disableLocalStorage && storageKey && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(storageKey, JSON.stringify(st));
      }
    } catch {}
  };

  const restoreState = () => {
    if (!calcRef.current) return;

    let st = savedStateRef.current;

    try {
      if (!st && !disableLocalStorage && storageKey && typeof window !== 'undefined' && window.localStorage) {
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
        forceEnableGeometryFunctions: true,
        degreeMode: true,
        clearIntoDegreeMode: true,
        images: false,
        folders: false,
        notes: false,
        links: false,
        restrictedFunctions: false,
      });

      restoreState();
      safeResize();
      if (calcInstanceRef) calcInstanceRef.current = calcRef.current;
    }

    return () => {
      // If the page unmounts, persist and destroy cleanly.
      saveState();
      if (calcInstanceRef) calcInstanceRef.current = null;
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

  const [submitting, setSubmitting] = useState(false);

  // Retry-until-correct state
  const [wrongOptionIds, setWrongOptionIds] = useState([]); // MCQ: option IDs submitted and wrong
  const [wrongTexts, setWrongTexts] = useState([]); // SPR: wrong text responses
  const [gotCorrect, setGotCorrect] = useState(false); // true once student gets it right
  const [gaveUp, setGaveUp] = useState(false); // true once student clicks Show Explanation

  // Prefetch cache: stores fetched question data keyed by question_id
  const prefetchCache = useRef({});

  // Admin correction modal
  const [userRole, setUserRole] = useState(null);
  const [showCorrectModal, setShowCorrectModal] = useState(false);
  const [correctForm, setCorrectForm] = useState({});
  const [correctSubmitting, setCorrectSubmitting] = useState(false);
  const [taxonomyOptions, setTaxonomyOptions] = useState(null);

  useEffect(() => {
    if (!showCorrectModal || taxonomyOptions) return;
    fetch('/api/filters')
      .then(r => r.json())
      .then(d => { if (d.domains) setTaxonomyOptions(d); })
      .catch(() => {});
  }, [showCorrectModal]);

  const refCardRef = useRef(null);
  const refDrag = useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  const [refPos, setRefPos] = useState({ x: 0, y: 0 }); // px offsets from initial position

  // ✅ Smooth dragging refs (avoid React re-render during drag)
  const refPosRef = useRef({ x: 0, y: 0 });
  const refDragRafRef = useRef(null);

  const [showRef, setShowRef] = useState(false);

  // Error log state
  const [showErrorLog, setShowErrorLog] = useState(false);
  const [errorLogText, setErrorLogText] = useState('');
  const [errorLogSaving, setErrorLogSaving] = useState(false);
  const [errorLogSaved, setErrorLogSaved] = useState(false);

  // Teacher mode: student's answer (when viewing via view_as)
  const [studentSelectedOptionId, setStudentSelectedOptionId] = useState(null);
  const [studentResponseText, setStudentResponseText] = useState(null);
  const [studentLastIsCorrect, setStudentLastIsCorrect] = useState(null);

  // Flashcard state
  const [showFlashcards, setShowFlashcards] = useState(false);

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
  const MIN_CALC_W = 550;
  const MAX_CALC_W = 1200;

  const [calcMinimized, setCalcMinimized] = useState(() => {
    // Default to minimized on mobile
    if (typeof window !== 'undefined' && window.innerWidth <= 920) return true;
    return false;
  });
  const calcInstanceRef = useRef(null);
  const [calcWidth, setCalcWidth] = useState(MIN_CALC_W);

  // IMPORTANT: prevent flicker by avoiding React updates during drag
  const shellRef = useRef(null);
  const liveWidthRef = useRef(MIN_CALC_W);
  const dragRef = useRef({
    dragging: false,
    startX: 0,
    startW: MIN_CALC_W,
    pendingW: MIN_CALC_W,
  });

  const [navLoading, setNavLoading] = useState(false);

  // Instant navigation metadata (from list page or neighbor navigation)
  const [total, setTotal] = useState(null); // total in filtered session
  const [index1, setIndex1] = useState(null); // 1-based index in session

  // Cache: current page ids (25) for index-based fallback navigation
  const [pageIds, setPageIds] = useState([]); // ids for current offset page
  const [pageOffset, setPageOffset] = useState(0); // 0,25,50,...

  const [showInfo, setShowInfo] = useState(false);

  // ✅ Question Map (windowed, IDs fetched on open)
  const MAP_PAGE_SIZE = 100; // must be <= API limit cap
  const [showMap, setShowMap] = useState(false);
  const [mapOffset, setMapOffset] = useState(0); // 0,100,200...
  const [mapIds, setMapIds] = useState([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [jumpTo, setJumpTo] = useState('');
  const startedAtRef = useRef(Date.now());

  // Per-question time tracking
  const [elapsedMs, setElapsedMs] = useState(0);
  const [questionTimeData, setQuestionTimeData] = useState(null); // { global_avg_ms, global_median_ms, attempts }
  const timerRef = useRef(null);

  // Keep the same session filter params for API calls + navigation
  const sessionParams = useMemo(() => {
    const keys = ['difficulties', 'score_bands', 'domains', 'topics', 'wrong_only', 'marked_only', 'hide_broken', 'q', 'session', 'replay', 'sid', 'tm', 'view_as'];
    const p = new URLSearchParams();
    for (const k of keys) {
      const v = searchParams.get(k);
      if (v !== null && v !== '') p.set(k, v);
    }
    return p;
  }, [searchParams]);

  const sessionParamsString = useMemo(() => sessionParams.toString(), [sessionParams]);
  const inSessionContext = sessionParams.get('session') === '1';
  const sidParam = searchParams.get('sid') || null;
  const isTeacherMode = searchParams.get('tm') === '1';

  // Exit Teacher Mode in-flow: strip the tm=1 URL param and also
  // clear the sat_teacher_mode localStorage flag the question-bank
  // list page reads so the toggle there reflects the change next
  // time. Kept as a replace (not push) so Back still works.
  const exitTeacherMode = useCallback(() => {
    if (!isTeacherMode) return;
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('sat_teacher_mode', '0');
      }
    } catch {}
    const next = new URLSearchParams(searchParams.toString());
    next.delete('tm');
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
  }, [isTeacherMode, router, searchParams]);

  // Overlay for questions answered/marked in the current session, keyed by question_id
  // Persisted to sessionStorage so badges survive page remounts on navigation
  const sessionResultsKey = sidParam ? `sr_${sidParam}` : sessionParamsString ? `sr_${sessionParamsString}` : null;
  const [sessionResults, setSessionResultsRaw] = useState(() => {
    if (!sessionResultsKey) return {};
    try {
      const raw = sessionStorage.getItem(sessionResultsKey);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const setSessionResults = (updater) => {
    setSessionResultsRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (sessionResultsKey) {
        try { sessionStorage.setItem(sessionResultsKey, JSON.stringify(next)); } catch {}
      }
      return next;
    });
  };

  // Read full session ID list from localStorage (used for replay/dashboard sessions)
  function getSessionIds() {
    if (!sidParam) return null;
    try {
      const raw = localStorage.getItem(`practice_session_${sidParam}`);
      if (raw) {
        const ids = raw.split(',').filter(Boolean);
        if (ids.length > 0) return ids;
      }
    } catch {}
    return null;
  }

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

  function questionApiUrl(qId) {
    const viewAs = searchParams.get('view_as');
    if (viewAs) return `/api/questions/${qId}?view_as=${encodeURIComponent(viewAs)}`;
    return `/api/questions/${qId}`;
  }

  // Prefetch a question by ID (fire-and-forget, stores result in cache)
  function prefetchQuestion(id) {
    if (!id || prefetchCache.current[String(id)]) return;
    prefetchCache.current[String(id)] = fetch(questionApiUrl(id), { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : null)
      .catch(() => null);
  }

  async function fetchQuestion() {
    setLoading(true);
    setMsg(null);
    try {
      // Check prefetch cache first
      const cached = prefetchCache.current[String(questionId)];
      delete prefetchCache.current[String(questionId)];
      let json;
      if (cached) {
        json = await cached;
      }
      if (!json) {
        const res = await fetch(questionApiUrl(questionId), { cache: 'no-store' });
        json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Failed to load question');
      }

      // In Teacher Mode, preserve student's answer for display, then strip
      // status so the question appears fresh. Teachers click "Show Answer"
      // to reveal correct answer (green) and student's wrong answer (red).
      if (isTeacherMode) {
        const sa = json.student_answer;
        setStudentSelectedOptionId(sa?.selected_option_id ?? null);
        setStudentResponseText(sa?.response_text ?? null);
        setStudentLastIsCorrect(sa?.is_correct ?? null);
        json = { ...json, status: null };
      } else {
        setStudentSelectedOptionId(null);
        setStudentResponseText(null);
        setStudentLastIsCorrect(null);
      }

      setData(json);
      if (json?.user_role) setUserRole(json.user_role);

      if (json?.question_id && !isTeacherMode) {
        setSessionResults((prev) => ({
          ...prev,
          [String(json.question_id)]: {
            is_done: json.status?.is_done ?? false,
            last_is_correct: json.status?.last_is_correct ?? null,
            marked_for_review: json.status?.marked_for_review ?? false,
          },
        }));
      }

      // Reset retry state for the new question
      setGotCorrect(false);
      setGaveUp(false);
      setWrongOptionIds([]);
      setWrongTexts([]);

      // Always start clean: no pre-selected answer
      setSelected(null);
      setResponseText('');

      startedAtRef.current = Date.now();
      setShowExplanation(false);
      setShowErrorLog(false);
      setErrorLogText(json?.status?.notes || '');
      setErrorLogSaved(false);

      // Prefetch next question in background
      try {
        const sessionIds = getSessionIds();
        if (sessionIds) {
          const curIdx = sessionIds.findIndex((id) => String(id) === String(questionId));
          if (curIdx >= 0 && curIdx + 1 < sessionIds.length) prefetchQuestion(sessionIds[curIdx + 1]);
        } else if (pageIds.length > 0) {
          const curIdx = pageIds.findIndex((id) => String(id) === String(questionId));
          if (curIdx >= 0 && curIdx + 1 < pageIds.length) prefetchQuestion(pageIds[curIdx + 1]);
        }
      } catch {}
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function fetchPageIds(offset) {
    // If we have a localStorage session, slice from it
    const sessionIds = getSessionIds();
    if (sessionIds) return sessionIds.slice(offset, offset + 25);

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
    apiParams.delete('replay');
    apiParams.delete('sid');
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
    // If we have a localStorage session with stored item metadata, use it
    if (sidParam) {
      try {
        const itemsRaw = localStorage.getItem(`practice_session_${sidParam}_items`);
        if (itemsRaw) {
          const items = JSON.parse(itemsRaw);
          if (Array.isArray(items) && items.length > 0) {
            return items.slice(offset, offset + MAP_PAGE_SIZE);
          }
        }
      } catch {}
      // Fall through to API fetch below (don't use dummy data from IDs only)
    }

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
    apiParams.delete('replay');
    apiParams.delete('sid');
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

    // Use localStorage session length if available
    const sessionIds = getSessionIds();
    if (sessionIds) {
      setTotal(sessionIds.length);
      return;
    }

    const apiParams = new URLSearchParams(sessionParams);
    apiParams.delete('session');
    apiParams.delete('replay');
    apiParams.delete('sid');
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

    setNavLoading(true);
    try {
      // If we have a localStorage session (e.g. dashboard replay), use it directly
      const sessionIds = getSessionIds();
      if (sessionIds) {
        const idx = targetIndex1 - 1;
        if (idx < 0 || idx >= sessionIds.length) return;
        const targetId = sessionIds[idx];
        setIndex1(targetIndex1);
        setTotal(sessionIds.length);
        router.push(buildHref(targetId, sessionIds.length, 0, idx, targetIndex1));
        return;
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
    } finally {
      setNavLoading(false);
    }
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
    const isRetry = wrongOptionIds.length > 0 || wrongTexts.length > 0;

    // Retries are checked client-side only (first attempt is what counts for accuracy)
    if (isRetry) {
      let retryCorrect = false;
      if (qTypeLocal === 'mcq') {
        retryCorrect = correctOptionId != null && String(selected) === String(correctOptionId);
      } else if (qTypeLocal === 'spr') {
        const accepted = formatCorrectText(correctText) || [];
        const norm = (s) => String(s ?? '').trim().replace(/\u2212/g, '-').replace(/\s+/g, ' ').toLowerCase();
        retryCorrect = accepted.some((a) => norm(a) === norm(responseText));
      }

      if (retryCorrect) {
        setGotCorrect(true);
      } else {
        if (qTypeLocal === 'mcq' && selected != null) {
          setWrongOptionIds((prev) => prev.includes(selected) ? prev : [...prev, selected]);
        } else if (qTypeLocal === 'spr' && responseText.trim()) {
          setWrongTexts((prev) => [...prev, responseText.trim()]);
        }
      }
      return;
    }

    // First attempt: submit to API (this is the attempt that counts)
    const wasDone = Boolean(status?.is_done);
    setSubmitting(true);
    const time_spent_ms = Math.max(0, Date.now() - startedAtRef.current);
    // Determine attempt source: replay sessions are 'review', everything else is 'practice'
    const isReplay = searchParams.get('replay') === '1';
    const body = {
      question_id: data.question_id,
      selected_option_id: qTypeLocal === 'mcq' ? selected : null,
      response_text: qTypeLocal === 'spr' ? responseText : null,
      time_spent_ms,
      source: isReplay ? 'review' : 'practice',
      teacher_mode: isTeacherMode || undefined,
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

      const qid = String(data.question_id);

      // Store correct answer from API response for client-side retry checking
      if (isTeacherMode) {
        // Teacher Mode: update local data with correct answer info but don't touch status
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            correct_option_id: json.correct_option_id ?? prev.correct_option_id,
            correct_text: json.correct_text ?? prev.correct_text,
          };
        });
      } else {
        setData((prev) => {
          if (!prev) return prev;
          const prevStatus = prev.status || {};
          return {
            ...prev,
            correct_option_id: json.correct_option_id ?? prev.correct_option_id,
            correct_text: json.correct_text ?? prev.correct_text,
            status: {
              ...prevStatus,
              attempts_count: json.attempts_count ?? (prevStatus.attempts_count ?? 0) + 1,
              correct_attempts_count: json.correct_attempts_count ?? prevStatus.correct_attempts_count,
              is_done: true,
              last_is_correct: json.is_correct,
            },
          };
        });
      }

      if (json.is_correct) {
        setGotCorrect(true);
        // Only update session tracking on the true first attempt (skip in Teacher Mode)
        if (!isTeacherMode && !wasDone) {
          setSessionResults((prev) => ({
            ...prev,
            [qid]: { ...(prev[qid] || {}), is_done: true, last_is_correct: true },
          }));
        }
      } else {
        // Track the wrong answer and let student retry
        if (qTypeLocal === 'mcq' && selected != null) {
          setWrongOptionIds((prev) => prev.includes(selected) ? prev : [...prev, selected]);
        } else if (qTypeLocal === 'spr' && responseText.trim()) {
          setWrongTexts((prev) => [...prev, responseText.trim()]);
        }
        // Only update session tracking on the true first attempt (skip in Teacher Mode)
        if (!isTeacherMode && !wasDone) {
          setSessionResults((prev) => ({
            ...prev,
            [qid]: { ...(prev[qid] || {}), is_done: true, last_is_correct: false },
          }));
        }
      }
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleMarkForReview() {
    if (!data?.question_id || isTeacherMode) return;
    const next = !Boolean(data?.status?.marked_for_review);
    const qid = String(data.question_id);
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
      setSessionResults((prev) => ({
        ...prev,
        [qid]: { ...(prev[qid] || {}), marked_for_review: next },
      }));

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
      setSessionResults((prev) => ({
        ...prev,
        [qid]: { ...(prev[qid] || {}), marked_for_review: !next },
      }));
      setMsg({ kind: 'danger', text: e.message });
    }
  }

  async function saveErrorLog() {
    if (!data?.question_id || !errorLogText.trim()) return;
    setErrorLogSaving(true);
    try {
      const res = await fetch('/api/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: data.question_id, patch: { notes: errorLogText.trim() } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to save note');
      setErrorLogSaved(true);
      setMsg({ kind: 'ok', text: 'Error log saved' });
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setErrorLogSaving(false);
    }
  }

  function openBrokenFlow() {
    if (!data?.question_id) return;

    if (userRole === 'admin' || userRole === 'manager') {
      // Admin/Manager: open correction modal pre-populated with current content
      const opts = {};
      if (Array.isArray(data?.options)) {
        for (const opt of data.options) {
          opts[String(opt.id)] = opt.content_html || '';
        }
      }
      setCorrectForm({
        stimulus_html: data?.version?.stimulus_html || '',
        stem_html: data?.version?.stem_html || '',
        options: opts,
        difficulty: data?.taxonomy?.difficulty ?? '',
        score_band: data?.taxonomy?.score_band ?? '',
        domain_code: data?.taxonomy?.domain_code || '',
        domain_name: data?.taxonomy?.domain_name || '',
        skill_code: data?.taxonomy?.skill_code || '',
        skill_name: data?.taxonomy?.skill_name || '',
      });
      setShowCorrectModal(true);
      return;
    }

    // Non-admin: simple toggle
    toggleBrokenSimple();
  }

  async function toggleBrokenSimple() {
    if (!data?.question_id) return;
    const next = !Boolean(data?.is_broken);
    try {
      setMsg(null);

      setData((prev) => {
        if (!prev) return prev;
        return { ...prev, is_broken: next, broken_by: next ? 'You' : null, broken_at: next ? new Date().toISOString() : null };
      });

      const res = await fetch('/api/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: data.question_id, patch: { is_broken: next } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to update status');
    } catch (e) {
      setData((prev) => {
        if (!prev) return prev;
        return { ...prev, is_broken: !next, broken_by: !next ? prev.broken_by : null, broken_at: !next ? prev.broken_at : null };
      });
      setMsg({ kind: 'danger', text: e.message });
    }
  }

  async function submitCorrection(flagBroken) {
    if (!data?.question_id) return;
    setCorrectSubmitting(true);
    try {
      setMsg(null);

      // Build patch: only include fields that differ from current
      const body = { flag_broken: flagBroken };
      if (correctForm.stimulus_html !== (data?.version?.stimulus_html || '')) {
        body.stimulus_html = correctForm.stimulus_html;
      }
      if (correctForm.stem_html !== (data?.version?.stem_html || '')) {
        body.stem_html = correctForm.stem_html;
      }

      const changedOpts = {};
      if (correctForm.options && Array.isArray(data?.options)) {
        for (const opt of data.options) {
          const newVal = correctForm.options[String(opt.id)];
          if (newVal !== undefined && newVal !== (opt.content_html || '')) {
            changedOpts[String(opt.id)] = newVal;
          }
        }
      }
      if (Object.keys(changedOpts).length > 0) body.options = changedOpts;

      // Taxonomy changes
      const taxChanges = {};
      if (String(correctForm.difficulty) !== String(data?.taxonomy?.difficulty ?? '')) taxChanges.difficulty = correctForm.difficulty;
      if (String(correctForm.score_band) !== String(data?.taxonomy?.score_band ?? '')) taxChanges.score_band = correctForm.score_band;
      if (correctForm.domain_code !== (data?.taxonomy?.domain_code || '')) {
        taxChanges.domain_code = correctForm.domain_code;
        taxChanges.domain_name = correctForm.domain_name || null;
      }
      if (correctForm.skill_code !== (data?.taxonomy?.skill_code || '')) {
        taxChanges.skill_code = correctForm.skill_code;
        taxChanges.skill_name = correctForm.skill_name || null;
      }
      if (Object.keys(taxChanges).length > 0) body.taxonomy = taxChanges;

      const res = await fetch(`/api/questions/${data.question_id}/correct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to submit correction');

      setShowCorrectModal(false);
      // Reload question to reflect changes
      await fetchQuestion();
      const label = flagBroken ? 'Correction saved and question flagged as broken.' : 'Correction saved and question marked as not broken.';
      setMsg({ kind: 'success', text: label });
    } catch (e) {
      setMsg({ kind: 'danger', text: e.message });
    } finally {
      setCorrectSubmitting(false);
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

  // Load saved minimized state on mount; width always resets per question (see below)
  useEffect(() => {
    try {
      const savedMin = localStorage.getItem('calcMinimized');
      if (savedMin === '1') setCalcMinimized(true);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset calculator width to MIN_CALC_W every time a new question loads
  useEffect(() => {
    if (!questionId) return;
    const resetW = MIN_CALC_W;
    setCalcWidth(resetW);
    liveWidthRef.current = resetW;
    dragRef.current.pendingW = resetW;
    shellRef.current?.style.setProperty('--calcW', `${resetW}px`);
  }, [questionId]);

  useEffect(() => {
    try {
      localStorage.setItem('calcMinimized', calcMinimized ? '1' : '0');
    } catch {}
  }, [calcMinimized]);

  // Per-question timer: ticks every second while question is active (not locked)
  useEffect(() => {
    if (!questionId) return;
    setElapsedMs(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [questionId]);

  // Stop timer when question is answered correctly or given up
  useEffect(() => {
    if ((gotCorrect || gaveUp) && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [gotCorrect, gaveUp]);

  // Fetch per-question time data (global avg/median) after question loads
  useEffect(() => {
    if (!data?.question_id) return;
    setQuestionTimeData(null);
    fetch(`/api/time-analytics?question_id=${encodeURIComponent(data.question_id)}`)
      .then(r => r.json())
      .then(json => { if (!json.error) setQuestionTimeData(json); })
      .catch(() => {});
  }, [data?.question_id]);

  const qType = String(data?.version?.question_type || data?.question_type || '').toLowerCase();
  const version = data?.version || {};
  const options = Array.isArray(data?.options) ? data.options : [];
  const status = data?.status || {};
  // Lock when student got it right, gave up, or in Teacher Mode (read-only)
  const locked = gotCorrect || gaveUp || isTeacherMode;
  const correctOptionId = data?.correct_option_id || null;
  const correctText = data?.correct_text || null;

  const domainCode = String(data?.taxonomy?.domain_code || '').toUpperCase().trim();

  // Reading domain codes (existing behavior)
  const useTwoColReading = qType === 'mcq' && ['EOI', 'INI', 'CAS', 'SEC'].includes(domainCode);

  // Math domain codes (new behavior)
  const isMath = ['H', 'P', 'S', 'Q'].includes(domainCode);

  // Format time display
  const formatElapsed = (ms) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`;
  };

  // Done pill: green "Yes" if correct, red "Yes" if wrong, plain "No" if unanswered
  const doneValue = status?.is_done ? 'Yes' : 'No';
  const doneColor = status?.is_done
    ? (status?.last_is_correct ? 'var(--success)' : 'var(--danger)')
    : undefined;

  // ✅ Pills row now includes Question # (index1) on the left
  const renderStatusPills = (style) => (
    <div
      className="statusPillRow"
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
        {isTeacherMode ? (
          <button
            type="button"
            className="pill"
            onClick={exitTeacherMode}
            title="Click to switch to Training Mode — attempts will be recorded"
            style={{ background: '#7c3aed', color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer' }}
          >
            Teacher Mode · exit →
          </button>
        ) : (
          <span className="pill">
            <span className="muted">Done</span>{' '}
            <span className="kbd" style={doneColor ? { color: doneColor, fontWeight: 700 } : undefined}>{doneValue}</span>
          </span>
        )}

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="infoBtn"
            onClick={() => setShowInfo((s) => !s)}
            aria-label="Question info"
            title="Question info"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
              <path fill="currentColor" d="M12 8a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm-1 4h2v6h-2z" />
            </svg>
            Info
          </button>

          {showInfo && (
            <>
              <div className="infoPopOverlay" onClick={() => setShowInfo(false)} />
              <div className="infoPop" role="dialog" aria-label="Question details">
                <div className="infoPopRow">
                  <span className="muted">Domain</span>
                  <span>{data?.taxonomy?.domain_name || '—'}</span>
                </div>
                <div className="infoPopRow">
                  <span className="muted">Topic</span>
                  <span>{data?.taxonomy?.skill_name || '—'}</span>
                </div>
                <div className="infoPopRow">
                  <span className="muted">Difficulty</span>
                  <span>{data?.taxonomy?.difficulty ?? '—'}</span>
                </div>
                <div className="infoPopRow">
                  <span className="muted">Score Band</span>
                  <span>{data?.taxonomy?.score_band ?? '—'}</span>
                </div>
                {data?.source_external_id && (
                  <div className="infoPopRow">
                    <span className="muted">External ID</span>
                    <span>{data.source_external_id}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

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
        <QuestionNotes questionId={questionId} />
      </div>
    </div>
  );

  const prevDisabled = navLoading || !index1 || index1 <= 1;
  const nextDisabled = navLoading || !index1 || !total || index1 >= total;

  const goPrev = () => {
    if (prevDisabled || index1 == null) return;
    goToIndex(index1 - 1);
  };

  const goNext = () => {
    if (nextDisabled || index1 == null) return;
    goToIndex(index1 + 1);
  };

  // Keyboard shortcuts for question navigation
  useKeyboardShortcuts({
    onPrev: goPrev,
    onNext: goNext,
    onSubmit: () => {
      if (!locked && !submitting) submitAttempt();
    },
    onMark: toggleMarkForReview,
    onExplain: () => {
      if ((locked || wrongOptionIds.length > 0 || wrongTexts.length > 0) && (version?.rationale_html || version?.explanation_html)) {
        setGaveUp(true);
        setShowExplanation((s) => !s);
      }
    },
    onMap: () => {
      if (showMap) setShowMap(false);
      else openMap();
    },
    onSelectOption: (idx) => {
      if (locked || qType !== 'mcq') return;
      const sorted = options.slice().sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
      if (idx < sorted.length && !wrongOptionIds.includes(sorted[idx].id)) {
        setSelected(sorted[idx].id);
      }
    },
  }, { enabled: !showCorrectModal && !showRef });

  // ✅ No visible "Stimulus/Question" headers (keep srOnly for a11y)
  const renderPromptBlocks = () => (
    <>
      {htmlHasContent(version?.stimulus_html) ? (
        <div style={{ marginBottom: 12 }}>
          <div className="srOnly">Stimulus</div>
          <HtmlBlock className="prose" html={version.stimulus_html} imgMaxWidth={320} />
        </div>
      ) : null}

      {version?.stem_html ? (
        <div style={{ marginBottom: 12 }}>
          <div className="srOnly">Question</div>
          <HtmlBlock className="prose" html={version.stem_html} imgMaxWidth={320} />
        </div>
      ) : null}
    </>
  );

  // Math tools moved to top nav as icon tabs (keep component for minimal diffs where it's called)
  const mathToolRow = null;

  // ✅ MCQ options area (no "Answer choices" header)
  const explanationArea = (version?.rationale_html || version?.explanation_html) && (locked || gaveUp) && showExplanation ? (
    <div className="card explanation" style={{ marginTop: 14 }}>
      <div className="sectionLabel">Explanation</div>
      <HtmlBlock className="prose" html={version.rationale_html || version.explanation_html} />
    </div>
  ) : null;

  const conceptTagsArea = (userRole === 'admin' || userRole === 'manager') ? (
    <ConceptTags questionId={questionId} userRole={userRole} />
  ) : null;

  const mcqOptionsArea = (
    <>
      <div className="srOnly">Answer choices</div>

      <div className="optionList">
        {options
          .slice()
          .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
          .map((opt) => {
            const isSelected = selected === opt.id;
            const isWrong = wrongOptionIds.includes(opt.id);
            const isCorrect = String(opt.id) === String(correctOptionId);
            // Teacher mode: highlight student's answer when revealed
            const isStudentSelected = isTeacherMode && gaveUp && studentSelectedOptionId != null && String(opt.id) === String(studentSelectedOptionId);
            const isStudentWrong = isStudentSelected && !isCorrect;

            return (
              <div
                key={opt.id}
                className={(() => {
                  let cls = 'option' + (isSelected ? ' selected' : '');

                  // Previously wrong attempts: always show red
                  if (isWrong) cls += ' incorrect';

                  // Teacher mode: show student's incorrect answer in red
                  if (isStudentWrong) cls += ' incorrect';
                  // Teacher mode: show student's correct answer in green
                  if (isStudentSelected && isCorrect) cls += ' correct';

                  if (locked) {
                    // When locked (correct or gave up): show correct answer green
                    if (isSelected && isCorrect) cls += ' correct';
                    if (!isSelected && isCorrect && (gaveUp || gotCorrect)) cls += ' revealCorrect';
                  } else if (gotCorrect && isSelected && isCorrect) {
                    cls += ' correct';
                  }

                  return cls;
                })()}
                onClick={() => {
                  if (locked) return;
                  if (isWrong) return; // can't re-select a wrong answer
                  setSelected(opt.id);
                }}
                style={{ cursor: locked || isWrong ? 'default' : 'pointer' }}
              >
                <div className="optionBadge">{opt.label || String.fromCharCode(65 + (opt.ordinal ?? 0))}</div>
                <div className="optionContent">
                  <HtmlBlock className="prose" html={opt.content_html} />
                  {isStudentSelected && (
                    <div style={{ fontSize: 11, fontWeight: 600, marginTop: 4, color: isCorrect ? '#15803d' : '#b91c1c' }}>
                      Student&apos;s answer{isCorrect ? ' (correct)' : ' (incorrect)'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      <div className="row" style={{ gap: 10, marginTop: 14 }}>
        {isTeacherMode ? (
          <button className="btn primary" onClick={() => { setGaveUp(true); setShowExplanation(true); }}>
            {gaveUp ? 'Answer Revealed' : 'Show Answer'}
          </button>
        ) : (
          <div className="btnRow">
            <button className="btn primary" onClick={submitAttempt} disabled={locked || submitting || !selected || wrongOptionIds.includes(selected)}>
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        )}

        {(!isTeacherMode || gaveUp) && (locked || wrongOptionIds.length > 0) && (version?.rationale_html || version?.explanation_html) ? (
          <button className="btn secondary" onClick={() => { setGaveUp(true); setShowExplanation((s) => !s); }}>
            {showExplanation ? 'Hide Explanation' : 'Show Explanation'}
          </button>
        ) : null}

        {locked && !isTeacherMode && (
          <button
            className={`btn secondary${errorLogText.trim() ? ' errorLogHasNote' : ''}`}
            onClick={() => setShowErrorLog((s) => !s)}
          >
            {showErrorLog ? 'Hide Error Log' : (errorLogText.trim() ? 'Edit Error Log' : 'Add to Error Log')}
          </button>
        )}

        <button className="btn secondary" onClick={() => setShowFlashcards(true)}>
          Flashcards
        </button>

        <div className="btnRow">
          <button className="btn secondary" onClick={goPrev} disabled={prevDisabled}>
            Prev
          </button>

          <button
            className="btn secondary"
            onClick={goNext}
            disabled={nextDisabled}
          >
            Next
          </button>

          {(userRole === 'admin' || userRole === 'manager' || userRole === 'teacher') ? (
            <button
              type="button"
              className={`brokenBtn${data?.is_broken ? ' isBroken' : ''}`}
              onClick={openBrokenFlow}
              title={data?.is_broken ? 'Flagged as broken' : 'Flag as broken'}
            >
              <span className="brokenBtnIcon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14">
                  <path d="M5 3v18M5 3h14l-4 6 4 6H5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              </span>
              {data?.is_broken ? 'Broken' : 'Broken?'}
            </button>
          ) : null}
        </div>
      </div>

      {showErrorLog && (
        <div className="errorLogPanel">
          <textarea
            className="input errorLogTextarea"
            value={errorLogText}
            onChange={(e) => { setErrorLogText(e.target.value); setErrorLogSaved(false); }}
            placeholder="Write notes about your error — what did you get wrong and why?"
            rows={3}
          />
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button className="btn primary" onClick={saveErrorLog} disabled={errorLogSaving || !errorLogText.trim()}>
              {errorLogSaving ? 'Saving…' : errorLogSaved ? 'Saved' : 'Save Note'}
            </button>
          </div>
        </div>
      )}
    </>
  );

  // ✅ SPR answer area (no "Your answer" header)
  const sprAnswerArea = (
    <>
      <div className="srOnly">Your answer</div>

      {gotCorrect ? (
        <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <span className="pill" style={{ borderColor: '#15803d', background: '#f0fdf4' }}>
            <span style={{ color: '#15803d' }}>Result</span>{' '}
            <span className="kbd" style={{ color: '#15803d', fontWeight: 700 }}>Correct</span>
          </span>
        </div>
      ) : wrongTexts.length > 0 ? (
        <div style={{ marginTop: 8 }}>
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="pill" style={{ borderColor: 'var(--danger, #dc2626)', background: '#fee2e2' }}>
              <span style={{ color: 'var(--danger, #dc2626)' }}>Result</span>{' '}
              <span className="kbd" style={{ color: 'var(--danger, #dc2626)', fontWeight: 700 }}>Incorrect</span>
            </span>
          </div>
          {gaveUp && correctText ? (
            <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
              <span className="pill">
                <span className="muted">Correct answer</span>{' '}
                <span className="kbd">{formatCorrectText(correctText)?.join(' or ')}</span>
              </span>
            </div>
          ) : null}
        </div>
      ) : isTeacherMode && gaveUp ? (
        <div style={{ marginTop: 8 }}>
          {studentResponseText && studentLastIsCorrect === false && (
            <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
              <span className="pill" style={{ borderColor: 'var(--danger, #dc2626)', background: '#fee2e2' }}>
                <span style={{ color: 'var(--danger, #dc2626)' }}>Student answered</span>{' '}
                <span className="kbd" style={{ color: 'var(--danger, #dc2626)', fontWeight: 700 }}>{studentResponseText}</span>
              </span>
            </div>
          )}
          {studentResponseText && studentLastIsCorrect === true && (
            <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
              <span className="pill" style={{ borderColor: '#15803d', background: '#f0fdf4' }}>
                <span style={{ color: '#15803d' }}>Student answered</span>{' '}
                <span className="kbd" style={{ color: '#15803d', fontWeight: 700 }}>{studentResponseText}</span>
              </span>
            </div>
          )}
          {correctText && (
            <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="pill">
                <span className="muted">Correct answer</span>{' '}
                <span className="kbd">{formatCorrectText(correctText)?.join(' or ')}</span>
              </span>
            </div>
          )}
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
        {isTeacherMode ? (
          <button className="btn primary" onClick={() => { setGaveUp(true); setShowExplanation(true); }}>
            {gaveUp ? 'Answer Revealed' : 'Show Answer'}
          </button>
        ) : (
          <button className="btn" onClick={submitAttempt} disabled={locked || submitting || !responseText.trim()}>
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        )}

        {(!isTeacherMode || gaveUp) && (locked || wrongTexts.length > 0) && (version?.rationale_html || version?.explanation_html) ? (
          <button className="btn secondary" onClick={() => { setGaveUp(true); setShowExplanation((s) => !s); }}>
            {showExplanation ? 'Hide Explanation' : 'Show Explanation'}
          </button>
        ) : null}

        {locked && !isTeacherMode && (
          <button
            className={`btn secondary${errorLogText.trim() ? ' errorLogHasNote' : ''}`}
            onClick={() => setShowErrorLog((s) => !s)}
          >
            {showErrorLog ? 'Hide Error Log' : (errorLogText.trim() ? 'Edit Error Log' : 'Add to Error Log')}
          </button>
        )}

        <button className="btn secondary" onClick={() => setShowFlashcards(true)}>
          Flashcards
        </button>

        <button className="btn secondary" onClick={goPrev} disabled={prevDisabled}>
          Prev
        </button>

        <button
          className="btn secondary"
          onClick={goNext}
          disabled={nextDisabled}
        >
          Next
        </button>

        {(userRole === 'admin' || userRole === 'manager' || userRole === 'teacher') ? (
          <button
            type="button"
            className={`brokenBtn${data?.is_broken ? ' isBroken' : ''}`}
            onClick={openBrokenFlow}
            title={data?.is_broken ? 'Flagged as broken' : 'Flag as broken'}
          >
            <span className="brokenBtnIcon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="14" height="14">
                <path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M5 3v18M5 3h14l-4 6 4 6H5" />
              </svg>
            </span>
            {data?.is_broken ? 'Broken' : 'Broken?'}
          </button>
        ) : null}
      </div>

      {showErrorLog && (
        <div className="errorLogPanel">
          <textarea
            className="input errorLogTextarea"
            value={errorLogText}
            onChange={(e) => { setErrorLogText(e.target.value); setErrorLogSaved(false); }}
            placeholder="Write notes about your error — what did you get wrong and why?"
            rows={3}
          />
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button className="btn primary" onClick={saveErrorLog} disabled={errorLogSaving || !errorLogText.trim()}>
              {errorLogSaving ? 'Saving…' : errorLogSaved ? 'Saved' : 'Save Note'}
            </button>
          </div>
        </div>
      )}
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

  // Math shell: inlined (not a local component) so React reuses the same DOM element
  // across re-renders instead of unmounting/remounting the Desmos subtree.
  const mathShellJsx = (rightContent) => (
    <div
      ref={shellRef}
      className={`mathShell ${calcMinimized ? 'min' : 'withCalc'}`}
      style={{ '--calcW': `${calcMinimized ? 0 : calcWidth}px` }}
    >
      <aside className={`mathLeft ${calcMinimized ? 'min' : ''}`} aria-label="Calculator panel">
        <div className="mathLeftHeader">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div className="mathToolTitle">{calcMinimized ? 'Calc' : 'Calculator'}</div>
            {!calcMinimized && (
              <DesmosStateButton
                questionId={questionId}
                getCalcState={() => { try { return calcInstanceRef.current?.getState?.(); } catch { return null; } }}
                setCalcState={(st) => { try { calcInstanceRef.current?.setState?.(st, { allowUndo: false }); } catch {} }}
              />
            )}
          </div>
          <button type="button" className="btn secondary" onClick={() => setCalcMinimized((m) => !m)}>
            {calcMinimized ? 'Expand' : 'Minimize'}
          </button>
        </div>

        {/* Keep mounted; hide visually when minimized.
            Students / practice accounts get a fresh calculator on every
            visit — no cross-session residue from localStorage. We only
            gate when we *know* the role isn't privileged; while userRole
            is still null we keep persistence on to avoid clobbering a
            teacher's work before the role fetch resolves. */}
        <div className={`calcBody ${calcMinimized ? 'hidden' : ''}`}>
          <DesmosPanel
            isOpen={!calcMinimized}
            storageKey={questionId ? `desmos:${questionId}` : 'desmos:unknown'}
            calcInstanceRef={calcInstanceRef}
            disableLocalStorage={
              userRole != null &&
              userRole !== 'teacher' &&
              userRole !== 'manager' &&
              userRole !== 'admin'
            }
          />
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

      <main className="mathRight">{rightContent}</main>
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
    <main className="container containerWide">
      <div className="questionTopBar">
        <div>
{isTeacherMode ? (
            <button className="btn secondary" onClick={() => {
              if (window.history.length > 1) { router.back(); } else { window.close(); }
            }}>
              ← Back
            </button>
          ) : (
            <Link className="btn secondary" href="/practice">
              ← Back to list
            </Link>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
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
                <>{index1} / {total}</>
              ) : total != null ? (
                <>— / {total}</>
              ) : (
                <>…</>
              )}
            </span>
            <span className="qmapTriggerChevron" aria-hidden="true">▾</span>
          </button>

          <div className="topBarTimer" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>{formatElapsed(elapsedMs)}</span>
          </div>
        </div>

        <div className="questionTopBarRight">
          {/* Per-question time shown in status pills instead of session timer */}
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

      <Toast kind={msg?.kind} message={msg?.text} />

      {qType === 'mcq' ? (
        useTwoColReading ? (
          // Reading: left passage only; right question stem + answers
          <div className="qaTwoCol">
            <div className="qaLeft">
              {htmlHasContent(version?.stimulus_html) && (
                <div className="card subcard">
                  <HtmlBlock className="prose" html={version.stimulus_html} imgMaxWidth={320} />
                </div>
              )}
            </div>

            <div className="qaDivider" aria-hidden="true" />

            <div className="qaRight">
              <div className="card subcard qaRightPanel">
                {renderStatusPills()}
                {version?.stem_html && (
                  <div style={{ marginBottom: 12 }}>
                    <HtmlBlock className="prose" html={version.stem_html} />
                  </div>
                )}
                {mcqOptionsArea}
                {explanationArea}
                {conceptTagsArea}
              </div>
            </div>
          </div>
        ) : isMath ? (
          // Math: calc left; right status+prompt+answers
          mathShellJsx(<>
            {mathToolRow}
            <div className="card subcard qaRightPanel">
              {renderStatusPills()}
              {renderPromptBlocks()}
              {mcqOptionsArea}
              {explanationArea}
              {conceptTagsArea}
            </div>
          </>)
        ) : (
          // Default MCQ
          <div className="card subcard qaRightPanel">
            {renderStatusPills()}
            {renderPromptBlocks()}
            {mcqOptionsArea}
            {explanationArea}
            {conceptTagsArea}
          </div>
        )
      ) : isMath ? (
        // Math SPR
        mathShellJsx(<>
          {mathToolRow}
          <div className="card subcard qaRightPanel">
            {renderStatusPills()}
            {renderPromptBlocks()}
            {sprAnswerArea}
            {explanationArea}
            {conceptTagsArea}
          </div>
        </>)
      ) : (
        // Default SPR
        <div className="card subcard qaRightPanel">
          {renderStatusPills()}
          {renderPromptBlocks()}
          {sprAnswerArea}
          {explanationArea}
          {conceptTagsArea}
        </div>
      )}

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

                  const sr = sessionResults[String(id)];
                  const showMark = Boolean(sr !== undefined ? sr.marked_for_review : it.marked_for_review);
                  const showDone = Boolean(sr !== undefined ? sr.is_done : it.is_done);
                  const lastCorrect = sr !== undefined ? sr.last_is_correct : it.last_is_correct;
                  const showCorrect = showDone && lastCorrect === true;
                  const showIncorrect = showDone && lastCorrect === false;

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

      {showCorrectModal ? (
        <div
          className="modalOverlay"
          onClick={() => setShowCorrectModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Correction form"
        >
          <div className="modalCard correctModal" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="h2" style={{ margin: 0 }}>Flag &amp; Correct Question</div>
              <button className="btn secondary" onClick={() => setShowCorrectModal(false)}>Close</button>
            </div>

            {data?.is_broken && data?.broken_by && (
              <div style={{ background: 'rgba(217,119,117,0.10)', border: '1px solid var(--danger, #dc2626)', borderRadius: 8, padding: '10px 14px', marginTop: 4, fontSize: 14, color: 'var(--danger, #dc2626)' }}>
                Flagged by <strong>{data.broken_by}</strong>
                {data.broken_at && (<> on {new Date(data.broken_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(data.broken_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</>)}
              </div>
            )}

            <hr />

            <div className="correctFields">
              <label className="correctLabel">
                <span className="correctLabelText">Stimulus</span>
                <textarea
                  className="input correctTextarea"
                  rows={5}
                  value={correctForm.stimulus_html || ''}
                  onChange={(e) => setCorrectForm((f) => ({ ...f, stimulus_html: e.target.value }))}
                  placeholder="Paste corrected stimulus HTML…"
                />
              </label>

              <label className="correctLabel">
                <span className="correctLabelText">Stem</span>
                <textarea
                  className="input correctTextarea"
                  rows={4}
                  value={correctForm.stem_html || ''}
                  onChange={(e) => setCorrectForm((f) => ({ ...f, stem_html: e.target.value }))}
                  placeholder="Paste corrected stem HTML…"
                />
              </label>

              {Array.isArray(data?.options) && data.options.length > 0 ? (
                data.options
                  .slice()
                  .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
                  .map((opt) => {
                    const label = opt.label || String.fromCharCode(65 + (opt.ordinal ?? 0));
                    return (
                      <label key={opt.id} className="correctLabel">
                        <span className="correctLabelText">Answer Option {label}</span>
                        <textarea
                          className="input correctTextarea"
                          rows={3}
                          value={correctForm.options?.[String(opt.id)] ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCorrectForm((f) => ({
                              ...f,
                              options: { ...(f.options || {}), [String(opt.id)]: val },
                            }));
                          }}
                          placeholder={`Paste corrected Option ${label} HTML…`}
                        />
                      </label>
                    );
                  })
              ) : null}
            </div>

            <hr />
            <div className="correctFields">
              <div className="h3" style={{ margin: '0 0 8px' }}>Taxonomy</div>
              <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                <label className="correctLabel" style={{ flex: '1 1 120px' }}>
                  <span className="correctLabelText">Difficulty</span>
                  <select
                    className="input"
                    value={correctForm.difficulty ?? ''}
                    onChange={(e) => setCorrectForm((f) => ({ ...f, difficulty: e.target.value ? Number(e.target.value) : '' }))}
                  >
                    <option value="">—</option>
                    <option value="1">1 – Easy</option>
                    <option value="2">2 – Medium</option>
                    <option value="3">3 – Hard</option>
                  </select>
                </label>
                <label className="correctLabel" style={{ flex: '1 1 120px' }}>
                  <span className="correctLabelText">Score Band</span>
                  <select
                    className="input"
                    value={correctForm.score_band ?? ''}
                    onChange={(e) => setCorrectForm((f) => ({ ...f, score_band: e.target.value ? Number(e.target.value) : '' }))}
                  >
                    <option value="">—</option>
                    {[1, 2, 3, 4, 5, 6, 7].map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </label>
              </div>
              {taxonomyOptions ? (() => {
                const MATH_CODES = ['H', 'P', 'S', 'Q'];
                const currentIsMath = MATH_CODES.includes(String(correctForm.domain_code).toUpperCase());
                const relevantDomains = (taxonomyOptions.domains || []).filter(d => {
                  const code = String(d.domain_code || '').toUpperCase();
                  return currentIsMath ? MATH_CODES.includes(code) : !MATH_CODES.includes(code);
                });
                const selectedDomainTopics = (taxonomyOptions.topics || []).filter(
                  t => t.domain_code === correctForm.domain_code || t.domain_name === correctForm.domain_name
                );
                return (
                  <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                    <label className="correctLabel" style={{ flex: '1 1 200px' }}>
                      <span className="correctLabelText">Domain</span>
                      <select
                        className="input"
                        value={correctForm.domain_code || ''}
                        onChange={(e) => {
                          const dom = relevantDomains.find(d => d.domain_code === e.target.value);
                          setCorrectForm((f) => ({
                            ...f,
                            domain_code: e.target.value,
                            domain_name: dom?.domain_name || '',
                            skill_code: '',
                            skill_name: '',
                          }));
                        }}
                      >
                        <option value="">—</option>
                        {relevantDomains.map((d) => (
                          <option key={d.domain_code} value={d.domain_code}>{d.domain_name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="correctLabel" style={{ flex: '1 1 200px' }}>
                      <span className="correctLabelText">Skill</span>
                      <select
                        className="input"
                        value={correctForm.skill_code || ''}
                        onChange={(e) => {
                          const sk = selectedDomainTopics.find(t => (t.skill_code || t.skill_name) === e.target.value);
                          setCorrectForm((f) => ({
                            ...f,
                            skill_code: e.target.value,
                            skill_name: sk?.skill_name || '',
                          }));
                        }}
                      >
                        <option value="">—</option>
                        {selectedDomainTopics.map((t) => (
                          <option key={t.skill_code || t.skill_name} value={t.skill_code || t.skill_name}>{t.skill_name}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                );
              })() : <p className="muted small">Loading taxonomy options…</p>}
            </div>

            <div className="row" style={{ gap: 10, marginTop: 16, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="btn secondary" onClick={() => setShowCorrectModal(false)} disabled={correctSubmitting}>
                Cancel
              </button>
              <button className="btn primary" style={{ background: 'var(--color-success, #22c55e)' }} onClick={() => submitCorrection(false)} disabled={correctSubmitting}>
                {correctSubmitting ? 'Saving…' : 'Mark Not Broken & Save'}
              </button>
              <button className="btn primary" onClick={() => submitCorrection(true)} disabled={correctSubmitting}>
                {correctSubmitting ? 'Saving…' : 'Flag as Broken & Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Flashcards modal */}
      <FlashcardsModal
        open={showFlashcards}
        onClose={() => setShowFlashcards(false)}
        onMessage={setMsg}
      />

    </main>
  );
}
