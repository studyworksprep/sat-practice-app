"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "../../lib/supabase/client";

export default function LoginForm({ nextPath }) {
  const supabase = createSupabaseBrowser();

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState({ type: "idle", message: "" });

  async function onSubmit(e) {
    e.preventDefault();
    setStatus({ type: "loading", message: "Sending link..." });

    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(
            nextPath || "/"
          )}`
        : undefined;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      setStatus({ type: "error", message: error.message });
      return;
    }

    setStatus({
      type: "success",
      message: "Check your email for a sign-in link.",
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block text-sm font-medium">Email</label>
      <input
        className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        required
      />

      <button
        type="submit"
        className="w-full rounded-lg bg-blue-600 text-white py-2 font-medium hover:bg-blue-700 disabled:opacity-60"
        disabled={status.type === "loading"}
      >
        Send magic link
      </button>

      {status.type !== "idle" && (
        <p
          className={`text-sm ${
            status.type === "error"
              ? "text-red-600"
              : status.type === "success"
              ? "text-green-700"
              : "text-zinc-600"
          }`}
        >
          {status.message}
        </p>
      )}
    </form>
  );
}
