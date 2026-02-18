"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";

function safeParseJsonArray(s) {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function stripLeadingBullets(html) {
  if (!html) return "";
  return String(html)
    .replace(/^\s*(?:•|&bull;|&#8226;|&#x2022;|\u2022)\s*/i, "")
    .replace(/<p>\s*(?:•|&bull;|&#8226;|&#x2022;|\u2022)\s*/gi, "<p>");
}

function stripMathAltText(html) {
  if (!html) returnt;
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
      "figcaption.image-description"
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

export default function PracticeSessionClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [session, setSession] = useState(null);

  // URL filters
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

  const [selected, setSelected] = useState("");
  const [freeResponse, setFreeResponse] = useState("");
  const [result, setResult] = useState(null);
  const [showExplanation, setShowExplanation] = useState(false);

  const [markedForReview, setMarkedForReview] = useState(false);

  // Map modal + per-question state
  const [showMap, setShowMap] = useState(false);
  const [stateById, setStateById] = useState({});

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

  // Load IDs based on URL filters
  useEffect(() => {
    if (!session) return;

    async function loadIds() {
      setStatus("Loading questions…");
      setQuestion(null);
      setResult(null);
      setShowExplanation(false);
      setSelected("");
      setFreeResponse("");
      setMarkedForReview(false);
      setStateById({});

      let q = supabase.from("questions").select("id");

      if (domain) q = q.eq("domain", domain);
      if (skill) q = q.eq("skill_desc", skill);
      if (difficulty) q = q.eq("difficulty", Number(difficulty));
      if (scoreBands.length) q = q.in("score_band", scoreBands);

      if (markedOnly) {
        const { data: ms, error: msErr } = await supabase
          .from("question_state")
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

        q = q.in("id", markedIds);
      }

      const { data, error } = await q;
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

  // Load map state for current ID set
  useEffect(() => {
    if (!session) return;
    if (!questionIds.length) return;

    let cancelled = false;

    async function loadMapState() {
      const chunks = chunkArray(questionIds, 500);
      const merged = {};

      for (const idsChunk of chunks) {
        const { data, error } = await supabase
          .from("question_state")
          .select("question_id, attempts_count, correct_count, marked_for_review")
          .eq("user_id", session.user.id)
          .in("question_id", idsChunk);

        if (cancelled) return;

        if (!error) {
          for (const r of data ?? []) {
            merged[r.question_id] = {
              attempts_count: Number(r.attempts_count || 0),
              correct_count: Number(r.correct_count || 0),
              marked_for_review: Boolean(r.marked_for_review)
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

  // Load current question
  useEffect(() => {
    if (!session) return;
    if (!questionIds.length) return;
    if (index < 0 || index >= questionIds.length) return;

    async function loadQuestion() {
      setStatus("Loading question…");
      setResult(null);
      setShowExplanation(false);
      setSelected("");
      setFreeResponse("");
      setMarkedForReview(false);

      const id = questionIds[index];

      const { data, error } = await supabase
        .from("questions")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        setStatus(error.message);
        setQuestion(null);
        return;
      }

      setQuestion(data);
      setStatus("");

      const { data: qs } = await supabase
        .from("question_state")
        .select("marked_for_review")
        .eq("user_id", session.user.id)
        .eq("question_id", data.id)
        .maybeSingle();

      setMarkedForReview(Boolean(qs?.marked_for_review));
    }

    loadQuestion();
  }, [session, questionIds, index]);

  useEffect(() => {
    typesetMath();
  }, [question, result, showExplanation]);

  const options = useMemo(() => {
    if (!question) return [];
    if (Array.isArray(question.answer_options)) return question.answer_options;
    if (typeof question.answer_options === "string") return safeParseJsonArray(question.answer_options);
    return [];
  }, [question]);

  const isFreeResponse =
    !options.length ||
    String(question?.question_type || "").toLowerCase().includes("free") ||
    String(question?.question_type || "").toLowerCase().includes("grid") ||
    String(question?.question_type || "").toLowerCase().includes("student");

  async function toggleMarkForReview() {
    if (!question || !session) return;

    const newVal = !markedForReview;
    setMarkedForReview(newVal);

    await supabase.from("question_state").upsert(
      {
        user_id: session.user.id,
        question_id: question.id,
        marked_for_review: newVal,
        last_attempt_at: new Date().toISOString()
      },
      { onConflict: "user_id,question_id" }
    );

    setStateById((prev) => ({
      ...prev,
      [question.id]: {
        attempts_count: Number(prev?.[question.id]?.attempts_count || 0),
        correct_count: Number(prev?.[question.id]?.correct_count || 0),
        marked_for_review: newVal
      }
    }));
  }

  async function checkAnswer() {
    setShowExplanation(false);
    if (!question) return;

    const answerToSend = isFreeResponse ? freeResponse.trim() : selected;
    if (!answerToSend) {
      setStatus("Select an answer first.");
      return;
    }

    setStatus("Checking…");
    setResult(null);

    const { data, error } = await supabase.rpc("submit_attempt", {
      p_question_id: question.id,
      p_selected_answer: answerToSend
    });

    if (!error && data && data.length) {
      const ok = Boolean(data[0].is_correct);
      setResult(ok);
      setStatus("");

      setStateById((prevMap) => {
        const prev = prevMap?.[question.id] || {
          attempts_count: 0,
          correct_count: 0,
          marked_for_review: markedForReview
        };
        return {
          ...prevMap,
          [question.id]: {
            ...prev,
            attempts_count: Number(prev.attempts_count || 0) + 1,
            correct_count: Number(prev.correct_count || 0) + (ok ? 1 : 0),
            marked_for_review: Boolean(prev.marked_for_review)
          }
        };
      });

      return;
    }

    // fallback
    const isCorrect = String(answerToSend) === String(question.correct_answer);
    setResult(isCorrect);
    setStatus(error ? "RPC missing — fallback mode." : "");
  }

  const renderHtml = (html) =>
    stripA11yImageDescriptions(stripMathAltText(String(html || "")));

  const renderOptionHtml = (html) =>
    stripA11yImageDescriptions(stripMathAltText(stripLeadingBullets(String(html || ""))));

  // Loading / empty states (avoid blank page)
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
              <div
                className="optionContent"
                dangerouslySetInnerHTML={{ __html: renderHtml(question.stem) }}
              />
            </div>

            <div className="bbRight">
              {/* Answer area */}
              {isFreeResponse ? (
                <div className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
                  <label><strong>Your answer</strong></label>
                  <input
                    placeholder="Type your answer"
                    value={freeResponse}
                    onChange={(e) => setFreeResponse(e.target.value)}
                  />
                </div>
              ) : (
                options.map((opt, i) => {
                  const fallbackLabel = String.fromCharCode(65 + i);
                  const label = typeof opt === "string" ? fallbackLabel : (opt.label ?? fallbackLabel);
                  const content = typeof opt === "string" ? opt : (opt.content ?? opt.text ?? "");
                  const isSelected = selected === label;

                  return (
                    <div
                      key={i}
                      className={`optionCard ${isSelected ? "selected" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelected(label)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setSelected(label);
                        if (e.key === " ") {
                          e.preventDefault();
                          setSelected(label);
                        }
                      }}
                      aria-pressed={isSelected}
                    >
                      <div className="optionLetter">{label}</div>
                      <div style={{ flex: 1 }}>
                        <div
                          className="optionContent"
                          dangerouslySetInnerHTML={{ __html: renderOptionHtml(content) }}
                        />
                      </div>
                      <input
                        type="radio"
                        checked={isSelected}
                        onChange={() => setSelected(label)}
                        aria-label={`Choose option ${label}`}
                      />
                    </div>
                  );
                })
              )}

              {/* Result card */}
              {result !== null && (
                <div className="card" style={{ marginTop: 16 }}>
                  <h3 style={{ marginTop: 0 }}>{result ? "✅ Correct" : "❌ Incorrect"}</h3>

                  {!result && !showExplanation && (
                    <button className="secondary" onClick={() => setShowExplanation(true)}>
                      Show answer & explanation
                    </button>
                  )}

                  {result && question.rationale && (
                    <div
                      className="optionContent"
                      style={{ marginTop: 8 }}
                      dangerouslySetInnerHTML={{ __html: renderHtml(question.rationale) }}
                    />
                  )}

                  {!result && showExplanation && (
                    <>
                      <p style={{ marginTop: 12 }}>
                        Correct answer: <strong>{question.correct_answer}</strong>
                      </p>

                      {question.rationale && (
                        <div
                          className="optionContent"
                          style={{ marginTop: 8 }}
                          dangerouslySetInnerHTML={{ __html: renderHtml(question.rationale) }}
                        />
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Bottom nav */}
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

        {/* Map modal */}
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
                    current ? "current" : ""
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
