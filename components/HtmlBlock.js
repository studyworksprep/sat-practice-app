export default function HtmlBlock({ html }) {
  if (!html) return null;
  // Assumes content_html is trusted. If you store untrusted HTML, sanitize on write.
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
