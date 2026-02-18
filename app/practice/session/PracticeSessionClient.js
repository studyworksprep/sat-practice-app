"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";

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

const STORAGE_KEY = "sat_practice_session_state_v1";

function loadState() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveState(state) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export default function PracticeSessionClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState(null);

  // Filters come from URL
  const domain = searchParams.get("domain") || "";
  const skill = searchParams.get("skill") || "";
  const difficulty = searchParams.get("difficulty") || "";
  const scoreBandsParam = searchParams.get("scoreBands") || "";
  const scoreBands = scoreBandsParam
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 7);
  }, [scoreBandsParam]);

  const markedOnly = searchParams.get("markedOnly") === "1";

  // Question navigation
  const [questionIds, setQuestionIds] = useState([]);
  const [index, setIndex] = useState(0);
  const [jumpTo, setJumpTo] = useState("");

  // Current question
  const [question, setQuestion] = useState(null);

  // Answer state
  const [selected, setSelected] = useState("");
  const [freeResponse, setFreeResponse] = useState("");
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("");
  const [showExplanation, setShowExplanation] = useState(false);

  // Marked state
  const [markedForReview, setMarkedForReview] = useState(false);

  // MathJax container ref
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

  // Restore index per session (optional)
  useEffect(() => {
    const s = loadState();
    if (!s) return;
    if (Number.isInteger(s.index) && s.index >= 0) setIndex(s.index);
  }, []);

  useEffect(() => {
    saveState({ index });
  }, [index]);

  // Load IDs whenever URL filters change
  useEffect(() => {
    if (!session) return;

    async function loadIds() {
      setStatus("Loading questions...");
      setQuestion(null);
      setSelected("");
      setFreeResponse("");
      setResult(null);
      setShowExplanation(false);
      setMarkedForReview(false);

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
      setJumpTo("");
      setStatus(ids.length ? "" : "No questions match this selection.");
    }

    loadIds();
  }, [session, domain, skill, difficulty, scoreBandsParam, markedOnly]);

  // Load current question
  useEffect(() => {
    if (!session || !questionIds.length) return;
    if (index < 0 || index >= questionIds.length) return;

    async function loadQuestion() {
      setStatus("Loading question...");
      setSelected("");
      setFreeResponse("");
      setResult(null);
      setShowExplanation(false);
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

      const { data: qs, error: qsErr } = await supabase
        .from("question_state")
        .select("marked_for_review")
        .eq("user_id", session.user.id)
        .eq("question_id", data.id)
        .maybeSingle();

      if (qsErr) setMarkedForReview(false);
      else setMarkedForReview(Boolean(qs?.marked_for_review));
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

    const prev = markedForReview;
    const newVal = !markedForReview;
    setMarkedForReview(newVal);

    const { error } = await supabase.from("question_state").upsert(
      {
        user_id: session.user.id,
        question_id: question.id,
        marked_for_review: newVal,
        last_attempt_at: new Date().toISOString()
      },
      { onConflict: "user_id,question_id" }
    );

    if (error) {
      setMarkedForReview(prev);
      setStatus(`Could not update mark: ${error.message}`);
    }
  }

  async function checkAnswer() {
    setShowExplanation(false);
    if (!question) return;

    const answerToSend = isFreeResponse ? freeResponse.trim() : selected;
    if (!answerToSend) return;

    setStatus("Checking...");
    setResult(null);

    const { data, error } = await supabase.rpc("submit_attempt", {
      p_question_id: question.id,
      p_selected_answer: answerToSend
    });

    if (!error && data && data.length) {
      setResult(Boolean(data[0].is_correct));
      setStatus("");
      return;
    }

    const isCorrect = String(answerToSend) === String(question.correct_answer);
    setResult(isCorrect);
    setStatus(error ? "RPC missing — fallback mode." : "");
  }

  const renderHtml = (html) => stripA11yImageDescriptions(stripMathAltText(String(html || "")));
  const renderOptionHtml = (html) =>
    stripA11yImageDescriptions(stripMathAltText(stripLeadingBullets(String(html || ""))));

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

        {question && (
          <div ref={contentRef} style={{ marginTop: 16 }}>
            <div className="bbLayout">
              <div className="bbLeft">
                <div
                  className="optionContent"
                  dangerouslySetInnerHTML={{ __html: renderHtml(question.stem) }}
                />
              </div>

              <div className="bbRight">
                <div className="bbRightHeader">
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div className="bbRightHeaderTitle">
                      Question {index + 1} of {questionIds.length}
                    </div>

                    <div className="bbRightHeaderActions">
                      <button className="secondary" onClick={toggleMarkForReview}>
                        {markedForReview ? "★ Marked" : "☆ Mark"}
                      </button>

                      <button
                        className="secondary"
                        disabled={index === 0}
                        onClick={() => setIndex((i) => i - 1)}
                      >
                        ← Prev
                      </button>

                      <button
                        disabled={index === questionIds.length - 1}
                        onClick={() => setIndex((i) => i + 1)}
                      >
                        Next →
                      </button>
                    </div>
                  </div>

                  <div className="row" style={{ justifyContent: "space-between", marginTop: 10 }}>
                    <button onClick={checkAnswer}>Check answer</button>

                    <div className="row" style={{ gap: 6 }}>
                      <input
                        style={{ width: 90 }}
                        placeholder="Go to #"
                        value={jumpTo}
                        onChange={(e) => setJumpTo(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const n = Number(jumpTo);
                            if (!Number.isFinite(n)) return;
                            if (n < 1 || n > questionIds.length) return;
                            setIndex(n - 1);
                            setJumpTo("");
                          }
                        }}
                        aria-label="Jump to question number"
                      />
                      <button
                        className="secondary"
                        onClick={() => {
                          const n = Number(jumpTo);
                          if (!Number.isFinite(n)) return;
                          if (n < 1 || n > questionIds.length) return;
                          setIndex(n - 1);
                          setJumpTo("");
                        }}
                      >
                        Go
                      </button>
                    </div>
                  </div>
                </div>

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
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
