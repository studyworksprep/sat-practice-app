import LoginForm from "./LoginForm";

export const metadata = {
  title: "Login - SAT Practice",
};

export default function LoginPage({ searchParams }) {
  const next = searchParams?.next || "/";
  return (
    <div className="max-w-md mx-auto">
      <div className="card p-6">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="text-sm text-zinc-600 mt-2">
          You must be signed in to access the question bank.
        </p>
        <div className="mt-4">
          <LoginForm nextPath={next} />
        </div>
      </div>
    </div>
  );
}
