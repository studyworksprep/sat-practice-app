import "../styles/globals.css";

export const metadata = {
  title: "SAT Practice",
  description: "SAT practice application",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="max-w-6xl mx-auto px-4 py-6">{children}</div>
      </body>
    </html>
  );
}
