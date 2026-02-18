"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function PracticeLandingPage() {
  const router = useRouter();
  const [session, setSession] = useState(null);

  // Landing filters (these affect counts + what set user starts)
  const [difficulty, setDifficulty] = useState(""); // "1"|"2"|"3"| ""
  const [scoreBands, setScoreBands] = useState([]); // array of numbers
  const [markedOnly, setMarkedOnly] = useState(false);

  // Data
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]); // outline rows: {domain, skill_desc, question_count}
  const [status, setStatus] = useState("");

  // Auth
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

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  // Load performance summary once (and when session changes)
  useEffect(() => {
    if (!session) return;

    (async () => {
      const { data, error } = await supabase.rpc("get_user_practice_summary");
      if (error) {
        setStatus(error.message);
        return;
      }
      setSummary(data?.[0] ?? null);
    })();
  }, [session]);

  // Load outline counts whenever filters change
  useEffect(() => {
    if (!session) return;

    (async () => {
      setStatus("Loading outline...");
      const { data, error } = await supabase.rpc("get_question_outline_counts", {
        p_difficulty: difficulty ? Number(difficulty) : null,
        p_score_bands: scoreBands.length ? scoreBands : null,
        p_marked_only: markedOnly
      });

      if (error) {
        setStatus(error.message);
        setRows([]);
        return;
      }

      setRows(data ?? []);
      setStatus("");
    })();
  }, [session, difficulty, scoreBands, markedOnly]);

  // Group rows by domain for display
  const outline = useMemo(() => {
    const map = new Map(); // domain => { domain, total, skills: [{skill_desc,count}] }
    for (const r of rows) {
      const d = r.domain ?? "Other";
      const s = r.skill_desc ?? "Other";
      const c = Number(r.question_count || 0);

      if (!map.has(d)) map.set(d, { domain: d, total: 0, skills: [] });
      const entry = map.get(d);
      entry.total += c;
      entry.skills.push({ skill_desc: s, count: c });
    }

    // Sort domains and skills
    const domains = Array.from(map.values()).sort((a, b) => a.domain.localeCompare(b.domain));
    domains.forEach((d) => d.skills.sort((a, b) => a.skill_desc.localeCompare(b.skill_desc)));
    return domains;
  }, [rows]);

  function startSession({ domain = "", skill = "" }) {
    const params = new URLSearchParams();
    if (domain) params.set("domain", domain);
    if (skill) params.set("skill", skill);
    if (difficulty) params.set("difficulty", difficulty);
    if (scoreBands.length) params.set("scoreBands", scoreBands.join(","));
    if (markedOnly) params.set("markedOnly", "1");
    router.push(`/practice/session?${params.toString()}`);
  }
  
  function toggleScoreBand(n) {
    setScoreBands((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b)
    );
  }


  return (
    <div className="page practiceWide">
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1 style={{ margin: 0 }}>Practice</h1>
          <div className="row">
            <button className="secondary" onClick={() => router.push("/")}>Home</button>
            <button className="secondary" onClick={() => router.push("/progress")}>Progress</button>
            <button className="secondary" onClick={logout}>Log out</button>
          </div>
        </div>

        {/* Performance snapshot */}
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Performance snapshot</h3>
          {summary ? (
            <div className="row">
              <div className="card" style={{ padding: 12, minWidth: 180 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Total attempts</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.total_attempts ?? 0}</div>
              </div>
              <div className="card" style={{ padding: 12, minWidth: 180 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Percent correct</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.percent_correct ?? 0}%</div>
              </div>
              <div className="card" style={{ padding: 12, minWidth: 180 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Unique questions attempted</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.total_unique_attempted ?? 0}</div>
              </div>
              <div className="card" style={{ padding: 12, minWidth: 180 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Marked for review</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.marked_count ?? 0}</div>
              </div>
            </div>
          ) : (
            <p style={{ margin: 0, opacity: 0.8 }}>Loading…</p>
          )}
        </div>

        {/* Filters */}
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Filters</h3>
          <div className="row">
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="">Difficulty (any)</option>
              <option value="1">Easy</option>
              <option value="2">Medium</option>
              <option value="3">Hard</option>
            </select>

            <div className="row" style={{ alignItems: "center" }}>
              <div style={{ fontWeight: 600, marginRight: 6 }}>Score band</div>
              <div className="row" style={{ gap: 6 }}>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => {
                  const on = scoreBands.includes(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      className="secondary"
                      onClick={() => toggleScoreBand(n)}
                      aria-pressed={on}
                      style={{
                        padding: "8px 10px",
                        borderColor: on ? "#111" : undefined,
                        boxShadow: on ? "0 0 0 1px #111 inset" : undefined,
                        fontWeight: on ? 700 : 600
                      }}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="row" style={{ gap: 6 }}>
              <input
                type="checkbox"
                checked={markedOnly}
                onChange={(e) => setMarkedOnly(e.target.checked)}
              />
              Marked only
            </label>

            <button
              className="secondary"
              onClick={() => {
                setDifficulty("");
                setScoreBands([]);
                setMarkedOnly(false);
              }}
            >
              Clear
            </button>
          </div>

          {status ? <p style={{ marginTop: 10 }}>{status}</p> : null}
        </div>

        {/* Outline */}
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Choose what to practice</h3>

          {!outline.length ? (
            <p style={{ margin: 0, opacity: 0.8 }}>
              No questions match your filters.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {outline.map((d) => (
                <div key={d.domain} className="card" style={{ padding: 12 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div style={{ fontWeight: 800 }}>
                      {d.domain} <span style={{ opacity: 0.6, fontWeight: 600 }}>({d.total})</span>
                    </div>

                    <button
                      className="secondary"
                      onClick={() => startSession({ domain: d.domain })}
                      aria-label={`Practice domain ${d.domain}`}
                    >
                      Practice this domain →
                    </button>
                  </div>

                  <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                    {d.skills.map((s) => (
                      <button
                        key={s.skill_desc}
                        className="secondary"
                        onClick={() => startSession({ domain: d.domain, skill: s.skill_desc })}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          width: "100%",
                          textAlign: "left"
                        }}
                      >
                        <span>{s.skill_desc}</span>
                        <span style={{ opacity: 0.7 }}>{s.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p style={{ marginTop: 14, opacity: 0.7, fontSize: 12 }}>
          Tip: adjust filters to update counts, then click a domain or skill to start a focused session.
        </p>
      </div>
    </div>
  );
}
