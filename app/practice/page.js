"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

async function fetchAllQuestionsForOutline({
  difficulty,
  scoreBands,
  markedOnly,
  userId,
}) {
  // If markedOnly is enabled, fetch marked question IDs first (likely small)
  let markedIds = null;
  if (markedOnly) {
    const { data: ms, error: msErr } = await supabase
      .from("question_status")
      .select("question_id")
      .eq("user_id", userId)
      .eq("marked_for_review", true);

    if (msErr) throw msErr;
    markedIds = (ms ?? []).map((r) => r.question_id);

    if (!markedIds.length) {
      // Nothing marked -> empty outline
      return [];
    }
  }

  // Page through questions_v2 (avoid relying on group-by RPCs)
  // We only select the minimal fields needed for the outline.
  const pageSize = 1000;
  let offset = 0;
  let all = [];

  while (true) {
    let q = supabase
      .from("questions_v2")
      .select("domain, skill_desc", { count: "exact" });

    if (difficulty) q = q.eq("difficulty", Number(difficulty));
    if (scoreBands?.length) q = q.in("score_band", scoreBands);

    if (markedIds) q = q.in("id", markedIds);

    q = q.range(offset, offset + pageSize - 1);

    const { data, error } = await q;
    if (error) throw error;

    const rows = data ?? [];
    all = all.concat(rows);

    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return all;
}

export default function PracticeLandingPage() {
  const router = useRouter();
  const [session, setSession] = useState(null);

  // Landing filters
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

  function toggleScoreBand(n) {
    setScoreBands((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b)
    );
  }

  // Load performance summary from question_status (canonical v2)
  useEffect(() => {
    if (!session) return;

    (async () => {
      setStatus("Loading…");

      const { data, error } = await supabase
        .from("question_status")
        .select("attempts_count, correct_count, marked_for_review")
        .eq("user_id", session.user.id);

      if (error) {
        setStatus(error.message);
        setSummary(null);
        return;
      }

      const rs = data ?? [];

      const total_attempts = rs.reduce((sum, r) => sum + Number(r.attempts_count || 0), 0);
      const total_correct = rs.reduce((sum, r) => sum + Number(r.correct_count || 0), 0);
      const total_unique_attempted = rs.filter((r) => Number(r.attempts_count || 0) > 0).length;
      const marked_count = rs.filter((r) => Boolean(r.marked_for_review)).length;

      const percent_correct =
        total_attempts > 0 ? Math.round((total_correct / total_attempts) * 100) : 0;

      setSummary({
        total_attempts,
        percent_correct,
        total_unique_attempted,
        marked_count,
      });

      setStatus("");
    })();
  }, [session]);

  // Load outline counts from questions_v2 (canonical v2)
  useEffect(() => {
    if (!session) return;

    (async () => {
      setStatus("Loading outline…");

      try {
        const outlineRows = await fetchAllQuestionsForOutline({
          difficulty,
          scoreBands,
          markedOnly,
          userId: session.user.id,
        });

        // Client-side group: domain + skill_desc
        const map = new Map(); // key `${domain}||${skill}` => count
        for (const r of outlineRows) {
          const d = r.domain ?? "Other";
          const s = r.skill_desc ?? "Other";
          const key = `${d}||${s}`;
          map.set(key, (map.get(key) || 0) + 1);
        }

        const grouped = Array.from(map.entries()).map(([key, count]) => {
          const [domain, skill_desc] = key.split("||");
          return { domain, skill_desc, question_count: count };
        });

        setRows(grouped);
        setStatus("");
      } catch (e) {
        setRows([]);
        setStatus(e?.message || "Failed to load outline.");
      }
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
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <button
                    key={n}
                    className={scoreBands.includes(n) ? "" : "secondary"}
                    onClick={() => toggleScoreBand(n)}
                    type="button"
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <label className="row" style={{ alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={markedOnly}
                onChange={(e) => setMarkedOnly(e.target.checked)}
              />
              Marked only
            </label>
          </div>

          {status ? <p style={{ marginTop: 12, opacity: 0.8 }}>{status}</p> : null}
        </div>

        {/* Outline */}
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Choose a category</h3>

          {outline.length ? (
            <div style={{ display: "grid", gap: 12 }}>
              {outline.map((d) => (
                <div key={d.domain} className="card" style={{ padding: 12 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div style={{ fontWeight: 800 }}>{d.domain}</div>
                    <div style={{ opacity: 0.7 }}>{d.total} questions</div>
                  </div>

                  <div className="row" style={{ flexWrap: "wrap", marginTop: 10, gap: 8 }}>
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => startSession({ domain: d.domain, skill: "" })}
                    >
                      Start domain
                    </button>

                    {d.skills.map((s) => (
                      <button
                        key={`${d.domain}||${s.skill_desc}`}
                        type="button"
                        className="secondary"
                        onClick={() => startSession({ domain: d.domain, skill: s.skill_desc })}
                        title={`${s.count} questions`}
                      >
                        {s.skill_desc} ({s.count})
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, opacity: 0.8 }}>No questions match these filters.</p>
          )}
        </div>
      </div>
    </div>
  );
}
