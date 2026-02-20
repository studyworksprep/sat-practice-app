import LoginForm from "./LoginForm";

export default function LoginPage({ searchParams }) {
  const next = searchParams?.next || "/";
  return (
    <div className="max-w-md mx-auto">
      <div className="card p-6">
        <h1 className="text-2xl font-semibold mb-2">Sign in</h1>
        <p className="text-sm text-zinc-600 mb-6">
          You must be signed in to access the question bank.
        </p>
        <LoginForm nextPath={next} />
      </div>
    </div>
  );
}
