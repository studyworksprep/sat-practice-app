"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function HomePage() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="card">
      <h1>SAT Practice</h1>

      <p>
        {session ? (
          <>
            You’re logged in. Go to <Link href="/practice">Practice</Link>.
          </>
        ) : (
          <>
            Please <Link href="/login">log in</Link> to begin.
          </>
        )}
      </p>

      <div className="row">
        <Link href="/login">
          <button className="secondary">Login</button>
        </Link>
        <Link href="/practice">
          <button>Practice</button>
        </Link>
      </div>
    </div>
  );
}

