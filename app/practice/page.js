"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

function safeParseJsonArray(s) {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// Removes literal leading bullets (•, &bull;, etc.) that sometimes appear in option HTML
function stripLeadingBullets(html) {
  if (!html) return "";
  return String(html)
    .replace(/^\s*(?:•|&bull;|&#8226;|&#x2022;|\u2022)\s*/i, "")
    .replace(/<p>\s*(?:•|&bull;|&#8226;|&#x2022;|\u2022)\s*/gi, "<p>");
}

// Removes MathML alttext="..." attributes that can show up as visible text in some exports
function stripMathAltText(html) {
  if (!html) return "";
  return String(html).replace(/\salttext=(["']).*?\1/gi, "");
}

// Removes “long description” / accessibility caption blocks that are meant to be hidden
// (Your CSS now defines .sr-only, but this also handles cases where it isn’t applied.)
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

    // Remove common “Image description:” text blocks
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

const STORAGE_KEY = "sat_practice_state_v1";

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

export default function PracticePage() {
  const router = useRouter();
  const [session, setSession] = useState(null);

  // Filters
  const [domain, setDomain] = useState("");
  const [skill, setSkill] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [scoreBand, setScoreBand] = useState("");
  const [markedOnly, setMarkedOnly] = useState(false);

  // Dropdown options
  const [domainOptions, setDomainOptions] = useState([]);
  const [skillOptions, setSkillOptions] = useState([]);

  // Question navigation
  const [questionIds, setQuestionIds] = useState([]);
  const [index, setIndex] = useState(0);
  const [jumpTo, setJumpTo] = useState("");

  // Current question
  const [question, setQuestion] = useState(null);

  // Answer state
  const [selected, setSelected] = useState(""); // MC: A/B/C/D
  const [freeResponse, setFreeResponse] = useState(""); // FR: typed string
  const [result, setResult] = useState(null); // true/false/null
  const [status, setStatus] = useState("");
  const [showExplanation, setShowExplanation] = useState(false);

  // Marked state (per question)
  const [markedForReview, setMarkedForReview] = useState(false);

  // MathJax typeset container ref
  const contentRef = useRef(null);

  function typesetMath() {
    if (typeof window === "undefined") return;
    if (!window.MathJax || !window.MathJax.typesetPromise) return;
    if (!contentRef.current) return;

    // Chain to avoid overlapping typeset calls
    window.__mjxPromise = (window.__mjxPromise || Promise.resolve())
      .then(() => window.MathJax.typesetPromise([contentRef.current]))
      .catch(() => {});
  }

  // Auth session
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Redirect if not logged in
  useEffect(() => {
    if (session === null) return;
    if (!session) router.push("/login");
  }, [session, router]);

  // Restore state (filters/index) once on mount
  useEffect(() => {
    const s = loadState();
    if (!s) return;

    if (typeof s.domain === "string") setDomain(s.domain);
    if (typeof s.skill === "string") setSkill(s.skill);
    if (typeof s.difficulty === "string") setDifficulty(s.difficulty);
    if (typeof s.scoreBand === "string") setScoreBand(s.scoreBand);
    if (typeof s.markedOnly === "boolean") setMarkedOnly(s.markedOnly);
    if (Number.isInteger(s.index) && s.index >= 0) setIndex(s.index);
  }, []);

  // Persist state
  useEffect(() => {
    saveState({ domain, skill, difficulty, scoreBand, markedOnly, index });
  }, [domain, skill, difficulty, scoreBand, markedOnly, index]);

  // Load Domains for dropdown
  useEffect(() => {
    if (!session) return;

    async function loadDomains() {
      const { data, error } = await supabase
        .from("questions")
        .select("domain")
        .not("domain", "is", null);

      if (error) return;

      const uniq = Array.from(new Set((data ?? []).map((r) => r.domain))).sort();
      setDomainOptions(uniq);
    }

    loadDomains();
  }, [session]);

  // Reset skill when domain changes
  useEffect(() => {
    setSkill("");
  }, [domain]);

  // Load Skills (dependent on domain) using skill_desc
  useEffect(() => {
    if (!session) return;

    async function loadSkills() {
      let q = supabase
        .from("questions")
        .select("skill_desc")
        .not("skill_desc", "is", null);

      if (domain) q = q.eq("domain", domain);

      const { data, error } = await q;
      if (error) return;

      const uniq = Array.from(new Set((data ?? []).map((r) => r.skill_desc))).sort();
      setSkillOptions(uniq);
    }

    loadSkills();
  }, [session, domain]);

  // Load question IDs when filters change
  useEffect(() => {
    if (!session) return;

    async function loadIds() {
      let markedIds = null;

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

        markedIds = (ms ?? []).map((r) => r.question_id);

        if (!markedIds.length) {
          setStatus("No marked questions yet.");
          setQuestionIds([]);
          return;
        }
      }

      setStatus("Loading questions...");
      setQuestion(null);
      setSelected("");
      setFreeResponse("");
      setResult(null);
      setShowExplanation(false);
      setMarkedForReview(false);

      let q = supabase.from("questions").select("id");

      if (markedIds) q = q.in("id", markedIds);

      if (domain) q = q.eq("domain", domain);
      if (skill) q = q.eq("skill_desc", skill);
      if (difficulty) q = q.eq("difficulty", Number(difficulty));
      if (scoreBand) q = q.eq("score_band", Number(scoreBand));

      const { data, error } = await q;
      if (error) {
        setStatus(error.message);
        setQuestionIds([]);
        return;
      }

      const ids = (data ?? []).map((r) => r.id);
      setQuestionIds(ids);

      // Try to keep the saved index if still valid
      const saved = loadState()?.index;
      if (Number.isInteger(saved) && saved >= 0 && saved < ids.length) {
        setIndex(saved);
      } else {
        setIndex(0);
      }

      setJumpTo("");
      setStatus(ids.length ? `Loaded ${ids.length} question(s).` : "No questions match filters.");
    }

    loadIds();
  }, [session, domain, skill, difficulty, scoreBand, markedOnly]);

  // Load current question by ID
  useEffect(() => {
    if (!session || !questionIds.length) return;

    async function loadQuestion() {
      setStatus("Loading question...");
      setSelected("");
      setFreeResponse("");
      setResult(null);
      setShowExplanation(false);
      setMarkedForReview(false);

      const id = questionIds[index];

      const { data, error } = await supabase.from("questions").select("*").eq("id", id).single();
      if (error) {
        setStatus(error.message);
        setQuestion(null);
        return;
      }

      setQuestion(data);
      setStatus("");

      // Load marked_for_review from question_state (if it exists)
      const { data: qs } = await supabase
        .from("question_state")
        .select("marked_for_review")
        .eq("question_id", data.id)
        .single();

      setMarkedForReview(Boolean(qs?.marked_for_review));
    }

    loadQuestion();
  }, [session, questionIds, index]);

  // Typeset math after content changes
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
  }

  async function checkAnswer() {
    setShowExplanation(false); // always hide on check
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

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const renderHtml = (html) =>
    stripA11yImageDescriptions(stripMathAltText(String(html || "")));

  const renderOptionHtml = (html) =>
    stripA11yImageDescriptions(stripMathAltText(stripLeadingBullets(String(html || ""))));

  return (
    <div className="container practiceWide">
      <div className="card">

      
      <div
        className="row"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--card-bg, white)",
          padding: "10px 0",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12
        }}
      >
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <div style={{ fontWeight: 700 }}>
            {index + 1} / {questionIds.length}
          </div>
      
          <button className="secondary" onClick={toggleMarkForReview}>
            {markedForReview ? "★ Marked" : "☆ Mark"}
          </button>
      
          {status ? (
            <span style={{ fontSize: 12, opacity: 0.8 }}>{status}</span>
          ) : null}
        </div>
      
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
      
          <div className="row" style={{ gap: 6, alignItems: "center" }}>
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

      {status && <p>{status}</p>}

      {question && (
        <div ref={contentRef} className="card" style={{ marginTop: 16 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>Question {index + 1} of {questionIds.length}</div>
            <button className="secondary" onClick={toggleMarkForReview}>
              {markedForReview ? "★ Marked for review" : "☆ Mark for review"}
            </button>
          </div>

          <div
            className="optionContent"
            style={{ margin: "12px 0" }}
            dangerouslySetInnerHTML={{ __html: renderHtml(question.stem) }}
          />

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
              const fallbackLabel = String.fromCharCode(65 + i); // A, B, C, D...
              const label =
                typeof opt === "string"
                  ? fallbackLabel
                  : (opt.label ?? fallbackLabel);

              const content =
                typeof opt === "string"
                  ? opt
                  : (opt.content ?? opt.text ?? "");

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
                    style={{ marginTop: 4 }}
                  />
                </div>
              );
            })
          )}

          

          {result !== null && (
            <div className="card" style={{ marginTop: 16 }}>
              <h3 style={{ marginTop: 0 }}>{result ? "✅ Correct" : "❌ Incorrect"}</h3>

              {/* If incorrect, do NOT reveal automatically */}
              {!result && !showExplanation && (
                <button className="secondary" onClick={() => setShowExplanation(true)}>
                  Show answer & explanation
                </button>
              )}

              {/* If correct, show explanation immediately */}
              {result && question.rationale && (
                <div
                  className="optionContent"
                  style={{ marginTop: 8 }}
                  dangerouslySetInnerHTML={{ __html: renderHtml(question.rationale) }}
                />
              )}

              {/* If incorrect, reveal only after button click */}
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
      )}
    </div>
  </div>
  );
  
}
