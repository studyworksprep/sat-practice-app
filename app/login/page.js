"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [status, setStatus] = useState("");
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) router.push("/practice");
  }, [session, router]);

  async function onSubmit(e) {
    e.preventDefault();
    setStatus("");

    if (!email || !password) {
      setStatus("Enter email and password.");
      return;
    }

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setStatus(error.message);
      else setStatus("Account created. You can now log in (or check email if confirmation is enabled).");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setStatus(error.message);
    else setStatus("Logged in!");
  }

  async function logout() {
    await supabase.auth.signOut();
    setStatus("Logged out.");
  }

  return (
    <div className="card">
      <h1>{mode === "signup" ? "Create account" : "Log in"}</h1>

      {session ? (
        <>
          <p>You’re already logged in.</p>
          <div className="row">
            <button onClick={() => router.push("/practice")}>Go to Practice</button>
            <button className="secondary" onClick={logout}>Log out</button>
          </div>
        </>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <button
              className={mode === "login" ? "" : "secondary"}
              onClick={() => setMode("login")}
              type="button"
            >
              Log in
            </button>
            <button
              className={mode === "signup" ? "" : "secondary"}
              onClick={() => setMode("signup")}
              type="button"
            >
              Sign up
            </button>
          </div>

          <form onSubmit={onSubmit} className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <input
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <input
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
            <button type="submit">{mode === "signup" ? "Create account" : "Log in"}</button>
          </form>
        </>
      )}

      {status && <p style={{ marginTop: 12 }}>{status}</p>}
    </div>
  );
}

