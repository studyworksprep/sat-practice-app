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

  const [questionIds, setQuestionIds] = useState([]);
  const [index, setIndex] = useState(0);
  const [question, setQuestion] = useState(null);

  const [selected, setSelected] = useState("");
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("");

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

    async function loadIds() {
      setStatus("Loading questions...");
      setQuestion(null);
      setSelected("");
      setResult(null);

      let q = supabase.from("questions").select("id");

      if (domain) q = q.eq("domain", domain);
      if (skill) q = q.eq("skill_code", skill);
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
      setStatus(ids.length ? `Loaded ${ids.length} question(s).` : "No questions match filters.");
    }

    loadIds();
  }, [session, domain, skill, difficulty, scoreBand]);

  useEffect(() => {
    if (!session || !questionIds.length) return;

    async function loadQuestion() {
      setStatus("Loading question...");
      setSelected("");
      setResult(null);

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
    }

    loadQuestion();
  }, [session, questionIds, index]);

  const options = useMemo(() => {
    if (!question) return [];
    if (Array.isArray(question.answer_options)) return question.answer_options;
    if (typeof question.answer_options === "string") return safeParseJsonArray(question.answer_options);
    return [];
  }, [question]);

  async function checkAnswer() {
    if (!question || !selected) return;

    setStatus("Checking...");
    setResult(null);

    const { data, error } = await supabase.rpc("submit_attempt", {
      p_question_id: question.id,
      p_selected_answer: selected
    });

    if (!error && data && data.length) {
      setResult(Boolean(data[0].is_correct));
      setStatus("");
      return;
    }

    const isCorrect = String(selected) === String(question.correct_answer);
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
          <input placeholder="Domain" value={domain} onChange={e => setDomain(e.target.value)} />
          <input placeholder="Skill code" value={skill} onChange={e => setSkill(e.target.value)} />
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


          {options.map((opt, i) => {
            const label = typeof opt === "string" ? String.fromCharCode(65 + i) : opt.label;
            const content = typeof opt === "string" ? opt : opt.content;

            return (
              <label key={i} className="row">
                <input
                  type="radio"
                  checked={selected === label}
                  onChange={() => setSelected(label)}
                />
                <div>
                  <strong>{label}.</strong>{" "}
                  <span dangerouslySetInnerHTML={{ __html: content || "" }} />
                </div>
              </label>
            );
          })}

          <div className="row" style={{ marginTop: 16 }}>
            <button onClick={checkAnswer}>Check answer</button>
            <button
              className="secondary"
              disabled={index === 0}
              onClick={() => setIndex(i => i - 1)}
            >
              Back
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

