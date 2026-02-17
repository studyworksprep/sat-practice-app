import "../styles/globals.css";

export const metadata = {
  title: "SAT Practice",
  description: "SAT Question Practice App"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}

