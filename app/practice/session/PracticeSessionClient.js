"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";

function stripLeadingBullets(html) {
  if (!html) return "";
  return String(html)
    .replace(/^\s*(?:•|&bull;|&#8226;|&#x2022;|\u2022)\s*/i, "")
    .replace(/<p>\s*(?:•|&bull;|&#8226;|&#x2022;|\u2022)\s*/gi, "<p>");
}

function stripMathAltText(html) {
  if (!html) return "";
  return String(html).replace(/\salttext=(["']).*?\1/gi, "");
}

function stripA11yImageDescriptions(html) {
  if (!html) return "";
  try {
    const doc = new DOMParser().parseFromString(String(html), "text/html");

    const selectors = [
      ".accessibility",
      ".a11y",
      ".screen-reader-only",
      ".visually-hidden",
      ".image-alt",
      ".img-alt",
      ".alt-text",
      ".image-description",
      ".img-description",
      "[data-accessibility]",
      "[data-a11y]",
      "[data-alt-text]",
      "[data-image-description]",
      "figcaption.accessibility",
      "figcaption.a11y",
      "figcaption.alt-text",
      "figcaption.image-description",
    ];

    doc.querySelectorAll(selectors.join(",")).forEach((n) => n.remove());

    doc.querySelectorAll("figcaption, p, div, span").forEach((n) => {
      const t = (n.textContent || "").trim().toLowerCase();
      if (
        t.startsWith("image description:") ||
        t.startsWith("image:") ||
        t.startsWith("figure description:") ||
        t.startsWith("figure:")
      ) {
        n.remove();
      }
    });

    return doc.body.innerHTML;
  } catch {
    return String(html);
  }
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * answer_options_full is expected to be JSON (array) or already an array.
 * We handle both.
 * Expected option shape (common): { id: string, content_html?: string, content?: string, text?: string, label?: string }
 */
function normalizeOptions(answer_options_full) {
  if (!answer_options_full) return [];
  if (Array.isArray(answer_options_full)) return answer_options_full;
  if (typeof answer_options_full === "object") return [];
  try {
    const parsed = JSON.parse(answer_options_full);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getOptionHtml(opt) {
  return opt?.content_html ?? opt?.content ?? opt?.text ?? "";
}

export default function PracticeSessionClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [session, setSession] = useState(null);

  // URL filters (we keep param names domain/skill for compatibility)
  // But DB columns are primary_class_cd_desc and skill_desc
  const domain = searchParams.get("domain") || "";
  const skill = searchParams.get("skill") || "";
  const difficulty = searchParams.get("difficulty") || "";
  const scoreBandsParam = searchParams.get("scoreBands") || "";
  const markedOnly = searchParams.get("markedOnly") === "1";

  const scoreBands = useMemo(() => {
    return scoreBandsParam
      .split(",")
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 7);
  }, [scoreBandsParam]);

  // Session state
  const [questionIds, setQuestionIds] = useState([]);
  const [index, setIndex] = useState(0);
  const [question, setQuestion] = useState(null);

  // Answer state
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [freeResponse, setFreeResponse] = useState("");

  // Result / explanation gating
  const [result, setResult] = useState(null); // true/false/null
  const [showExplanation, setShowExplanation] = useState(false);

  // Mark for review
  const [markedForReview, setMarkedForReview] = useState(false);

  // Map modal + per-question rollup state
  const [showMap, setShowMap] = useState(false);
  const [stateById, setStateById] = useState({}); // { [question_id]: { attempts_count, correct_count, marked_for_review, completed } }

  const [status, setStatus] = useState("Loading…");

  const contentRef = useRef(null);

  function typesetMath() {
    if (typeof window === "undefined") return;
    if (!window.MathJax || !window.MathJax.typesetPromise) return;
    if (!contentRef.current) return;

    window.__mjxPromise = (window.__mjxPromise || Promise.resolve())
      .then(() => window.MathJax.typesetPromise([contentRef.current]))
      .catch(() => {});
  }

  const renderHtml = (html) =>
    stripA11yImageDescriptions(stripMathAltText(String(html || "")));

  const renderOptionHtml = (html) =>
    stripA11yImageDescriptions(stripMathAltText(stripLeadingBullets(String(html || ""))));

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === null) return;
    if (!session) router.push("/login");
  }, [session, router]);

  // Escape closes map
  useEffect(() => {
    if (!showMap) return;
    function onKeyDown(e) {
      if (e.key === "Escape") setShowMap(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showMap]);

  // Load IDs based on URL filters (Canonical v2: questions_v2 + question_status)
  useEffect(() => {
    if (!session) return;

    async function loadIds() {
      setStatus("Loading questions…");
      setQuestion(null);
      setResult(null);
      setShowExplanation(false);
      setSelectedOptionId("");
      setFreeResponse("");
      setMarkedForReview(false);
      setStateById({});

      let base = supabase.from("questions_v2").select("id");

      // IMPORTANT: map URL params to real DB columns
      if (domain) base = base.eq("primary_class_cd_desc", domain);
      if (skill) base = base.eq("skill_desc", skill);

      if (difficulty) base = base.eq("difficulty", Number(difficulty));
      if (scoreBands.length) base = base.in("score_band", scoreBands);

      // Marked-only filter is applied by intersecting with question_status
      if (markedOnly) {
        const { data: ms, error: msErr } = await supabase
          .from("question_status")
          .select("question_id")
          .eq("user_id", session.user.id)
          .eq("marked_for_review", true);

        if (msErr) {
          setStatus(msErr.message);
          setQuestionIds([]);
          return;
        }

        const markedIds = (ms ?? []).map((r) => r.question_id);
        if (!markedIds.length) {
          setStatus("No marked questions match this selection.");
          setQuestionIds([]);
          return;
        }

        base = base.in("id", markedIds);
      }

      // Deterministic order
      base = base.order("id", { ascending: true });

      const { data, error } = await base;
      if (error) {
        setStatus(error.message);
        setQuestionIds([]);
        return;
      }

      const ids = (data ?? []).map((r) => r.id);
      setQuestionIds(ids);
      setIndex(0);
      setStatus(ids.length ? "" : "No questions match this selection.");
    }

    loadIds();
  }, [session, domain, skill, difficulty, scoreBandsParam, markedOnly, scoreBands.length]);

  // Load map state (question_status rollup)
  useEffect(() => {
    if (!session) return;
    if (!questionIds.length) return;

    let cancelled = false;

    async function loadMapState() {
      const chunks = chunkArray(questionIds, 500);
      const merged = {};

      for (const idsChunk of chunks) {
        const { data, error } = await supabase
          .from("question_status")
          .select("question_id, attempts_count, correct_count, marked_for_review, completed")
          .eq("user_id", session.user.id)
          .in("question_id", idsChunk);

        if (cancelled) return;

        if (!error) {
          for (const r of data ?? []) {
            merged[r.question_id] = {
              attempts_count: Number(r.attempts_count || 0),
              correct_count: Number(r.correct_count || 0),
              marked_for_review: Boolean(r.marked_for_review),
              completed: Boolean(r.completed),
            };
          }
        }
      }

      if (!cancelled) setStateById(merged);
    }

    loadMapState();
    return () => {
      cancelled = true;
    };
  }, [session, questionIds]);

  // Load current question (Canonical v2: questions_v2 columns)
  useEffect(() => {
    if (!session) return;
    if (!questionIds.length) return;
    if (index < 0 || index >= questionIds.length) return;

    async function loadQuestion() {
      setStatus("Loading question…");
      setResult(null);
      setShowExplanation(false);
      setSelectedOptionId("");
      setFreeResponse("");

      const id = questionIds[index];

      const { data, error } = await supabase
        .from("questions_v2")
        .select("id, stimulus_html, stem_html, answer_options_full, correct_option_id, rationale_html")
        .eq("id", id)
        .single();

      if (error) {
        setStatus(error.message);
        setQuestion(null);
        return;
      }

      setQuestion(data);
      setStatus("");

      // Marked state: prefer map cache if present; otherwise fetch single row
      const cached = stateById?.[data.id];
      if (cached && typeof cached.marked_for_review === "boolean") {
        setMarkedForReview(Boolean(cached.marked_for_review));
      } else {
        const { data: qs } = await supabase
          .from("question_status")
          .select("marked_for_review")
          .eq("user_id", session.user.id)
          .eq("question_id", data.id)
          .maybeSingle();

        setMarkedForReview(Boolean(qs?.marked_for_review));
      }
    }

    loadQuestion();
  }, [session, questionIds, index, stateById]);

  useEffect(() => {
    typesetMath();
  }, [question, result, showExplanation]);

  const options = useMemo(() => {
    if (!question) return [];
    return normalizeOptions(question.answer_options_full);
  }, [question]);

  const isFreeResponse = useMemo(() => {
    return !options.length;
  }, [options.length]);

  const correctIndex = useMemo(() => {
    if (!question || !options.length) return -1;
    const id = String(question.correct_option_id || "");
    return options.findIndex((o) => String(o?.id ?? "") === id);
  }, [question, options]);

  const correctLetter = useMemo(() => {
    if (correctIndex < 0) return "";
    return String.fromCharCode(65 + correctIndex);
  }, [correctIndex]);

  const correctOptionHtml = useMemo(() => {
    if (correctIndex < 0) return "";
    return getOptionHtml(options[correctIndex]);
  }, [options, correctIndex]);

  async function refreshSingleStatus(questionId) {
    if (!session) return;
    const { data, error } = await supabase
      .from("question_status")
      .select("question_id, attempts_count, correct_count, marked_for_review, completed")
      .eq("user_id", session.user.id)
      .eq("question_id", questionId)
      .maybeSingle();

    if (!error && data) {
      setStateById((prev) => ({
        ...prev,
        [questionId]: {
          attempts_count: Number(data.attempts_count || 0),
          correct_count: Number(data.correct_count || 0),
          marked_for_review: Boolean(data.marked_for_review),
          completed: Boolean(data.completed),
        },
      }));
      setMarkedForReview(Boolean(data.marked_for_review));
    }
  }

  async function toggleMarkForReview() {
    if (!question || !session) return;

    const newVal = !markedForReview;
    setMarkedForReview(newVal);

    const { error } = await supabase
      .from("question_status")
      .upsert(
        {
          user_id: session.user.id,
          question_id: question.id,
          marked_for_review: newVal,
        },
        { onConflict: "user_id,question_id" }
      );

    if (error) {
      setStatus(error.message);
      setMarkedForReview((v) => !v);
      return;
    }

    setStateById((prev) => ({
      ...prev,
      [question.id]: {
        attempts_count: Number(prev?.[question.id]?.attempts_count || 0),
        correct_count: Number(prev?.[question.id]?.correct_count || 0),
        marked_for_review: newVal,
        completed: Boolean(prev?.[question.id]?.completed),
      },
    }));
  }

  async function checkAnswer() {
    setShowExplanation(false);
    if (!question) return;

    if (isFreeResponse) {
      const answerText = freeResponse.trim();
      if (!answerText) {
        setStatus("Type an answer first.");
        return;
      }

      setStatus("Saving attempt…");
      setResult(null);

      const { error } = await supabase.from("attempts").insert({
        user_id: session.user.id,
        question_id: question.id,
        selected_option_id: null,
        response_text: answerText,
        is_correct: null,
      });

      if (error) {
        setStatus(error.message);
        return;
      }

      setStatus("");
      await refreshSingleStatus(question.id);
      return;
    }

    if (!selectedOptionId) {
      setStatus("Select an answer first.");
      return;
    }

    const isCorrect = String(selectedOptionId) === String(question.correct_option_id || "");

    setStatus("Saving attempt…");
    setResult(null);

    const { error } = await supabase.from("attempts").insert({
      user_id: session.user.id,
      question_id: question.id,
      selected_option_id: selectedOptionId,
      response_text: null,
      is_correct: isCorrect,
    });

    if (error) {
      setStatus(error.message);
      return;
    }

    setResult(isCorrect);
    setStatus("");

    setStateById((prevMap) => {
      const prev = prevMap?.[question.id] || {
        attempts_count: 0,
        correct_count: 0,
        marked_for_review: markedForReview,
        completed: false,
      };
      return {
        ...prevMap,
        [question.id]: {
          ...prev,
          attempts_count: Number(prev.attempts_count || 0) + 1,
          correct_count: Number(prev.correct_count || 0) + (isCorrect ? 1 : 0),
          marked_for_review: Boolean(prev.marked_for_review),
          completed: true,
        },
      };
    });

    await refreshSingleStatus(question.id);
  }

  // Loading / empty states
  if (!session) {
    return (
      <div className="card">
        <p>Loading session…</p>
      </div>
    );
  }

  if (!questionIds.length) {
    return (
      <div className="card">
        <button className="secondary" onClick={() => router.push("/practice")}>
          ← Back to practice home
        </button>
        <p style={{ marginTop: 12 }}>{status || "No questions loaded."}</p>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="card">
        <button className="secondary" onClick={() => router.push("/practice")}>
          ← Back to practice home
        </button>
        <p style={{ marginTop: 12 }}>{status || "Loading question…"}</p>
      </div>
    );
  }

  return (
    <div className="page practiceWide">
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <button className="secondary" onClick={() => router.push("/practice")}>
            ← Back to practice home
          </button>
          <div style={{ opacity: 0.7, fontSize: 12 }}>
            {domain ? domain : "All domains"}
            {skill ? ` • ${skill}` : ""}
            {difficulty ? ` • D${difficulty}` : ""}
            {scoreBands.length ? ` • Bands ${scoreBands.join(",")}` : ""}
            {markedOnly ? " • Marked" : ""}
          </div>
        </div>

        {status ? <p>{status}</p> : null}

        <div ref={contentRef} style={{ marginTop: 16 }}>
          <div className="bbLayout">
            <div className="bbLeft">
              {question.stimulus_html ? (
                <div
                  className="optionContent"
                  dangerouslySetInnerHTML={{ __html: renderHtml(question.stimulus_html) }}
                />
              ) : null}

              {question.stem_html ? (
                <div
                  className="optionContent"
                  style={{ marginTop: question.stimulus_html ? 12 : 0 }}
                  dangerouslySetInnerHTML={{ __html: renderHtml(question.stem_html) }}
                />
              ) : null}
            </div>

            <div className="bbRight">
              {isFreeResponse ? (
                <div className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
                  <label>
                    <strong>Your answer</strong>
                  </label>
                  <input
                    placeholder="Type your answer"
                    value={freeResponse}
                    onChange={(e) => setFreeResponse(e.target.value)}
                  />
                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                    Note: Free-response questions are saved, but not auto-graded in this build.
                  </div>
                </div>
              ) : (
                options.map((opt, i) => {
                  const letter = String.fromCharCode(65 + i);
                  const optId = String(opt?.id ?? "");
                  const content = getOptionHtml(opt);
                  const isSelected = selectedOptionId === optId;

                  return (
                    <div
                      key={optId || i}
                      className={`optionCard ${isSelected ? "selected" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedOptionId(optId)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setSelectedOptionId(optId);
                        if (e.key === " ") {
                          e.preventDefault();
                          setSelectedOptionId(optId);
                        }
                      }}
                      aria-pressed={isSelected}
                    >
                      <div className="optionLetter">{letter}</div>
                      <div style={{ flex: 1 }}>
                        <div
                          className="optionContent"
                          dangerouslySetInnerHTML={{ __html: renderOptionHtml(content) }}
                        />
                      </div>
                      <input
                        type="radio"
                        checked={isSelected}
                        onChange={() => setSelectedOptionId(optId)}
                        aria-label={`Choose option ${letter}`}
                      />
                    </div>
                  );
                })
              )}

              {result !== null && (
                <div className="card" style={{ marginTop: 16 }}>
                  <h3 style={{ marginTop: 0 }}>{result ? "✅ Correct" : "❌ Incorrect"}</h3>

                  {!result && !showExplanation && (
                    <button className="secondary" onClick={() => setShowExplanation(true)}>
                      Show answer & explanation
                    </button>
                  )}

                  {result && question.rationale_html && (
                    <div
                      className="optionContent"
                      style={{ marginTop: 8 }}
                      dangerouslySetInnerHTML={{ __html: renderHtml(question.rationale_html) }}
                    />
                  )}

                  {!result && showExplanation && (
                    <>
                      <p style={{ marginTop: 12 }}>
                        Correct answer: <strong>{correctLetter ? correctLetter : "—"}</strong>
                      </p>

                      {correctOptionHtml ? (
                        <div
                          className="optionContent"
                          style={{ marginTop: 8 }}
                          dangerouslySetInnerHTML={{ __html: renderOptionHtml(correctOptionHtml) }}
                        />
                      ) : null}

                      {question.rationale_html && (
                        <div
                          className="optionContent"
                          style={{ marginTop: 8 }}
                          dangerouslySetInnerHTML={{ __html: renderHtml(question.rationale_html) }}
                        />
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="bottomNav">
                <button
                  className="secondary bottomNavMap"
                  onClick={() => setShowMap(true)}
                  aria-label="Open question map"
                >
                  <span style={{ fontWeight: 800 }}>Question {index + 1}</span>
                  <span style={{ opacity: 0.7 }}> of {questionIds.length}</span>
                </button>

                <button onClick={checkAnswer}>Check answer</button>

                <button className="secondary" onClick={toggleMarkForReview}>
                  {markedForReview ? "★ Marked" : "☆ Mark"}
                </button>

                <button
                  className="secondary"
                  disabled={index === 0}
                  onClick={() => setIndex((i) => i - 1)}
                  aria-label="Previous question"
                >
                  ← Prev
                </button>

                <button
                  disabled={index === questionIds.length - 1}
                  onClick={() => setIndex((i) => i + 1)}
                  aria-label="Next question"
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        </div>

        {showMap && (
          <div
            className="modalOverlay"
            role="dialog"
            aria-modal="true"
            aria-label="Question map"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setShowMap(false);
            }}
          >
            <div className="modalCard">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 800 }}>
                  Question Map{" "}
                  <span style={{ opacity: 0.6, fontWeight: 600 }}>({questionIds.length})</span>
                </div>
                <button className="secondary" onClick={() => setShowMap(false)}>
                  Close
                </button>
              </div>

              <div className="questionGrid" style={{ marginTop: 12 }}>
                {questionIds.map((id, i) => {
                  const st = stateById[id];
                  const attempted = Boolean(st && Number(st.attempts_count || 0) > 0);
                  const correct = Boolean(st && Number(st.correct_count || 0) > 0);
                  const marked = Boolean(st && st.marked_for_review);
                  const current = i === index;

                  const cls = [
                    "qCell",
                    attempted ? "attempted" : "",
                    correct ? "correct" : "",
                    marked ? "marked" : "",
                    current ? "current" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <button
                      key={id}
                      type="button"
                      className={cls}
                      onClick={() => {
                        setIndex(i);
                        setShowMap(false);
                      }}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
