import './globals.css';
import NavBar from '../components/NavBar';
import Script from 'next/script';

export const metadata = {
  title: 'SAT Practice',
  description: 'Practice SAT questions with Supabase + Next.js',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Preload Desmos calculator script so it's ready when students open the calculator */}
        <link
          rel="preload"
          href={`https://www.desmos.com/api/v1.11/calculator.js?apiKey=${process.env.NEXT_PUBLIC_DESMOS_API_KEY || 'bac289385bcd4778a682276b95f5f116'}`}
          as="script"
        />

        {/* MathJax config: enable MathML input + CHTML output */}
        <Script id="mathjax-config" strategy="beforeInteractive">
          {`
            window.MathJax = {
              loader: { load: ['input/mml', 'output/chtml'] },
              options: {
                skipHtmlTags: ['script','noscript','style','textarea','pre','code']
              },
              chtml: {
                scale: 1.0
              }
            };
          `}
        </Script>

        {/* MathJax v3 */}
        <Script
          id="mathjax-script"
          strategy="beforeInteractive"
          src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"
        />
      </head>
      <body>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
