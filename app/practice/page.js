"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function PracticePage() {
  const router = useRouter();
  const [session, setSession] = useState(null);

  const [domain, setDomain] = useState("");
  const [skill, setSkill] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [scoreBand, setScoreBand] = useState("");
  const [domainOptions, setDomainOptions] = useState([]);
  const [skillOptions, setSkillOptions] = useState([]);
  const [markedOnly, setMarkedOnly] = useState(false);


  const [questionIds, setQuestionIds] = useState([]);
  const [index, setIndex] = useState(0);
  const [question, setQuestion] = useState(null);
  const [jumpTo, setJumpTo] = useState("");


  const [selected, setSelected] = useState(""); // for multiple choice (A/B/C/D)
  const [freeResponse, setFreeResponse] = useState(""); // for free response

  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("");

  const [markedForReview, setMarkedForReview] = useState(false);




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

  useEffect(() => {
    if (!session) return;

    async function loadDomains() {
      const { data, error } = await supabase
        .from("questions")
        .select("domain")
        .not("domain", "is", null);

      if (error) return;

      const uniq = Array.from(new Set((data ?? []).map(r => r.domain))).sort();
      setDomainOptions(uniq);
  }

  loadDomains();
  }, [session]);

  useEffect(() => {
    setSkill("");
  }, [domain]);

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

    const uniq = Array.from(new Set((data ?? []).map(r => r.skill_desc))).sort();
    setSkillOptions(uniq);
  }

  loadSkills();
  }, [session, domain]);


  useEffect(() => {
    if (!session) return;

    async function loadIds() {
      
      let markedIds = null;

      if (markedOnly) {
        const { data: ms, error: msErr } = await supabase
          .from("question_state")
          .select("question_id")
          .eq("marked_for_review", true);
      
        if (msErr) {
          setStatus(msErr.message);
          setQuestionIds([]);
          return;
        }
      
        markedIds = (ms ?? []).map(r => r.question_id);
      
        if (!markedIds.length) {
          setStatus("No marked questions yet.");
          setQuestionIds([]);
          return;
        }
      }

      setStatus("Loading questions...");
      setQuestion(null);
      setSelected("");
      setResult(null);

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
      setIndex(0);
      setJumpTo("");
      setStatus(ids.length ? `Loaded ${ids.length} question(s).` : "No questions match filters.");
    }

    loadIds();
  }, [session, domain, skill, difficulty, scoreBand, markedOnly]);


  useEffect(() => {
    if (!session || !questionIds.length) return;

    async function loadQuestion() {
      setStatus("Loading question...");
      setSelected("");
      setResult(null);
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
    if (!question) return;
    const newVal = !markedForReview;
    setMarkedForReview(newVal);
  
    // Upsert into question_state for this user+question
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
    if (!question) return;

    const answerToSend = isFreeResponse ? freeResponse.trim() : answerToSend;
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

  return (
    <div className="card">

      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Practice</h1>
        <div className="row">
          <button className="secondary" onClick={() => router.push("/")}>Home</button>
          <button className="secondary" onClick={logout}>Log out</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Filters</h3>
        <div className="row">
  
          <select value={domain} onChange={(e) => setDomain(e.target.value)}>
            <option value="">Domain (any)</option>
            {domainOptions.map((d) => (
            <option key={d} value={d}>{d}</option>
            ))}
          </select>
          
          <select
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            disabled={!domain}
          >

            <option value="">Skill (any)</option>
            {skillOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select value={difficulty} onChange={e => setDifficulty(e.target.value)}>
            <option value="">Difficulty</option>
            <option value="1">Easy</option>
            <option value="2">Medium</option>
            <option value="3">Hard</option>
          </select>
            
          <select value={scoreBand} onChange={e => setScoreBand(e.target.value)}>
            <option value="">Score band</option>
            {[1,2,3,4,5,6,7].map(n => <option key={n}>{n}</option>)}
          </select>
                                 
          <label className="row" style={{ gap: 6 }}>
            <input
              type="checkbox"
              checked={markedOnly}
              onChange={(e) => setMarkedOnly(e.target.checked)}
            />
            Marked only
          </label>
                                 
        </div>
      </div>

      {status && <p>{status}</p>}

      {question && (
        <div className="card" style={{ marginTop: 16 }}>
          <div>Question {index + 1} of {questionIds.length}</div>

         <div
          style={{ margin: "12px 0" }}
          dangerouslySetInnerHTML={{ __html: question.stem || "" }}
        />


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
            <p style={{ margin: "8px 0 0", opacity: 0.7 }}>
              (Free response: enter exactly what you want graded. We can improve grading rules later.)
            </p>
          </div>
  ) : (
    options.map((opt, i) => {
      const label = typeof opt === "string" ? String.fromCharCode(65 + i) : opt.label;
      const content = typeof opt === "string" ? opt : opt.content;

      return (
        <label key={i} className="row" style={{ alignItems: "flex-start" }}>
          <input
            type="radio"
            checked={selected === label}
            onChange={() => setSelected(label)}
            style={{ marginTop: 4 }}
          />
          <div>
            <strong>{label}.</strong>{" "}
            <span
              className="optionContent"
              dangerouslySetInnerHTML={{ __html: content || "" }}
            />
          </div>
        </label>
      );
  })
)}


          <div className="row" style={{ marginTop: 16 }}>
            <button onClick={checkAnswer}>Check answer</button>
            <button className="secondary" onClick={toggleMarkForReview}>
              {markedForReview ? "★ Marked for review" : "☆ Mark for review"}
            </button>

            <button
              className="secondary"
              disabled={index === 0}
              onClick={() => setIndex(i => i - 1)}
            >
              Back
            </button>

            <input
              style={{ width: 110 }}
              placeholder="Go to #"
              value={jumpTo}
              onChange={(e) => setJumpTo(e.target.value)}
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

            <button
              disabled={index === questionIds.length - 1}
              onClick={() => setIndex(i => i + 1)}
            >
              Next
            </button>
          </div>

          {result !== null && (
            <div className="card" style={{ marginTop: 16 }}>
              <h3>{result ? "✅ Correct" : "❌ Incorrect"}</h3>
              {!result && <p>Correct answer: {question.correct_answer}</p>}
              {question.rationale && <p>{question.rationale}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

