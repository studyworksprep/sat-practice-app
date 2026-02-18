import { Suspense } from "react";
import PracticeSessionClient from "./PracticeSessionClient";

export default function PracticeSessionPage() {
  return (
    <Suspense fallback={<div className="card">Loading session…</div>}>
      <PracticeSessionClient />
    </Suspense>
  );
}
