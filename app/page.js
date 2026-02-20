import Link from 'next/link';
import { getUser } from '../lib/db';

export default async function HomePage() {
  const user = await getUser();

  return (
    <main className="container">
      <div className="card">
        <div className="h1">SAT Practice</div>
        <p className="muted" style={{ marginTop: 0 }}>
          Filter questions, attempt them, and track what you've finished or marked for review.
        </p>
        <hr />
        <div className="row">
          <div className="col">
            <div className="h2">Get started</div>
            <p className="muted">
              Use <span className="kbd">Practice</span> to filter questions and begin a session.
              Use <span className="kbd">Review</span> to revisit marked items.
            </p>
            <div className="row">
              <Link className="btn" href="/practice">Go to Practice</Link>
              <Link className="btn secondary" href="/review">Go to Review</Link>
            </div>
          </div>
          <div className="col">
            <div className="h2">Account</div>
            {user ? (
              <p className="muted">You're signed in as <span className="kbd">{user.email}</span>.</p>
            ) : (
              <p className="muted">
                Sign in to save attempts and status.
              </p>
            )}
            <div className="row">
              <Link className="btn secondary" href="/login">Log in</Link>
              <Link className="btn" href="/signup">Sign up</Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
