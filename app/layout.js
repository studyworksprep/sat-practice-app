import Script from "next/script";
import "../styles/globals.css";

export const metadata = {
  title: "SAT Practice",
  description: "SAT Question Practice App"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* MathJax configuration */}
        <Script id="mathjax-config" strategy="beforeInteractive">
          {`
            window.MathJax = {
              options: {
                skipHtmlTags: ['script','noscript','style','textarea','pre','code']
              }
            };
          `}
        </Script>

        {/* MathJax v4 (TeX + MathML input, CommonHTML output) */}
        <Script
          id="mathjax-script"
          src="https://cdn.jsdelivr.net/npm/mathjax@4/tex-mml-chtml.js"
          strategy="beforeInteractive"
        />
      </head>
    
      <body>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}

