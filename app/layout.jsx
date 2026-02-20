import "../styles/globals.css";

export const metadata = {
  title: "SAT Practice",
  description: "SAT practice app",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-zinc-200 bg-white">
            <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
              <div className="font-semibold">SAT Practice</div>
              <nav className="text-sm flex gap-4">
                <a href="/">Overview</a>
                <a href="/practice">Practice</a>
                <a href="/login">Account</a>
              </nav>
            </div>
          </header>

          <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>

          <footer className="max-w-6xl mx-auto px-4 py-10 text-xs text-zinc-500">
            © {new Date().getFullYear()} Studyworks
          </footer>
        </div>
      </body>
    </html>
  );
}
