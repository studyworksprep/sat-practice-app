"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function ProgressPage() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState("Loading...");
  const [stats, setStats] = useState(null);

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

    async function loadProgress() {
      setStatus("Loading...");

      // question_state has one row per user+question with counts
      const { data, error } = await supabase
        .from("question_state")
        .select("attempts_count, correct_count, incorrect_count, marked_for_review");

      if (error) {
        setStatus(error.message);
        return;
      }

      const rows = data ?? [];
      const attemptedQuestions = rows.length;
      const attempts = rows.reduce((sum, r) => sum + (r.attempts_count || 0), 0);
      const correct = rows.reduce((sum, r) => sum + (r.correct_count || 0), 0);
      const incorrect = rows.reduce((sum, r) => sum + (r.incorrect_count || 0), 0);
      const marked = rows.reduce((sum, r) => sum + (r.marked_for_review ? 1 : 0), 0);

      const accuracy = (correct + incorrect) > 0 ? (correct / (correct + incorrect)) : 0;

      setStats({
        attemptedQuestions,
        attempts,
        correct,
        incorrect,
        accuracy,
        marked
      });
      setStatus("");
    }

    loadProgress();
  }, [session]);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Progress</h1>
        <div className="row">
          <button className="secondary" onClick={() => router.push("/")}>Home</button>
          <button className="secondary" onClick={() => router.push("/practice")}>Practice</button>
          <button className="secondary" onClick={logout}>Log out</button>
        </div>
      </div>

      {status && <p style={{ marginTop: 16 }}>{status}</p>}

      {stats && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="row">
            <div><strong>Questions attempted:</strong> {stats.attemptedQuestions}</div>
            <div><strong>Total attempts:</strong> {stats.attempts}</div>
          </div>

          <div className="row" style={{ marginTop: 8 }}>
            <div><strong>Correct:</strong> {stats.correct}</div>
            <div><strong>Incorrect:</strong> {stats.incorrect}</div>
            <div><strong>Accuracy:</strong> {(stats.accuracy * 100).toFixed(1)}%</div>
          </div>

          <div className="row" style={{ marginTop: 8 }}>
            <div><strong>Marked for review:</strong> {stats.marked}</div>
          </div>
        </div>
      )}

      <p style={{ marginTop: 16, opacity: 0.7 }}>
        Next upgrade: progress breakdown by Domain / Skill and a review queue.
      </p>
    </div>
  );
}

