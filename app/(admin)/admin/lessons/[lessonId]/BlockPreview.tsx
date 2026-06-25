// Read-only WYSIWYG preview for a single lesson block.
//
// This is the "what the learner sees" half of every card on the
// canvas. It deliberately mirrors lib/ui/LessonSlideshow.jsx (the
// runtime renderer) so the canvas reads like the published lesson —
// text/image via SafeHtml, video as a live embed, check as the
// prompt + choices with the correct one marked, etc.
//
// Phase 1 keeps the question-bank and Desmos previews as informative
// placeholder cards; Phase 2/3 swap in a live QuestionRenderer and a
// live Desmos calculator respectively.

'use client';

import { useEffect, useRef, useState } from 'react';
import { SafeHtml } from '@/lib/ui/SafeHtml';
import { MathText } from '@/lib/ui/MathText';
import { useMathTypeset } from '@/lib/ui/preview-effects';
import { blockMetaFor } from './block-meta';
import { getQuestionById } from './actions';

type Block = {
  id?: string;
  block_type?: string;
  content?: Record<string, unknown> & {
    html?: string;
    url?: string;
    caption?: string;
    prompt?: string;
    choices?: string[];
    correct_index?: number;
    explanation?: string;
    question_id?: string;
    title?: string;
    instructions_html?: string;
    validation?: { mode?: string };
  };
};

// Mirror of getEmbedUrl in lib/ui/LessonSlideshow.jsx — kept local so
// the preview stays a leaf with no cross-import into the 1k-line
// runtime file.
function getEmbedUrl(url: string | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  let m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
  m = url.match(/vimeo\.com\/(\d+)/);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  return null;
}

export function BlockPreview({ block }: { block: Block }) {
  const type = block?.block_type;
  if (type === 'text') return <TextPreview block={block} />;
  if (type === 'video') return <VideoPreview block={block} />;
  if (type === 'check') return <CheckPreview block={block} />;
  if (type === 'question_link') return <QuestionLinkPreview block={block} />;
  if (type === 'desmos_interactive') return <DesmosPreview block={block} />;
  return <EmptyPreview label={`No preview for "${type}"`} />;
}

function TextPreview({ block }: { block: Block }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = block.content?.html ?? '';
  useMathTypeset(ref, html);
  if (!html.trim()) return <EmptyPreview label="Empty text block — click Edit to add content." />;
  return (
    <div ref={ref}>
      <SafeHtml as="div" html={html} />
    </div>
  );
}

function VideoPreview({ block }: { block: Block }) {
  const url = block.content?.url;
  const caption = block.content?.caption;
  const embedUrl = getEmbedUrl(url);
  if (!url) return <EmptyPreview label="No video URL yet — click Edit to add one." />;
  return (
    <div style={S.media}>
      {embedUrl ? (
        <div style={S.videoFrame}>
          <iframe
            src={embedUrl}
            title={caption || 'Lesson video'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={S.iframe}
          />
        </div>
      ) : (
        <a href={url} target="_blank" rel="noreferrer" style={S.plainLink}>
          {url}
        </a>
      )}
      {caption ? <div style={S.caption}>{caption}</div> : null}
    </div>
  );
}

function CheckPreview({ block }: { block: Block }) {
  const prompt = block.content?.prompt ?? '';
  const choices = Array.isArray(block.content?.choices) ? block.content!.choices! : [];
  const correctIndex = block.content?.correct_index ?? 0;
  return (
    <div style={S.check}>
      {prompt ? (
        <MathText as="div" style={S.prompt}>{prompt}</MathText>
      ) : (
        <div style={S.prompt}><em style={S.placeholder}>No prompt yet</em></div>
      )}
      <ul style={S.choiceList}>
        {choices.map((choice, i) => {
          const correct = i === correctIndex;
          return (
            <li key={i} style={{ ...S.choice, ...(correct ? S.choiceCorrect : null) }}>
              <span style={S.choiceLetter}>{String.fromCharCode(65 + i)}</span>
              <MathText as="span">{choice}</MathText>
              {correct ? <span style={S.correctTag}>correct</span> : null}
            </li>
          );
        })}
        {choices.length === 0 ? (
          <li style={S.choice}>
            <em style={S.placeholder}>No choices yet</em>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

type QuestionCard = {
  id: string;
  display_code: string | null;
  stem_html: string | null;
  skill_name: string | null;
};

function QuestionLinkPreview({ block }: { block: Block }) {
  const qid = block.content?.question_id;
  const ref = useRef<HTMLDivElement>(null);
  const [card, setCard] = useState<QuestionCard | null>(null);
  const [missing, setMissing] = useState(false);
  useMathTypeset(ref, card?.stem_html ?? qid ?? '');

  // Resolve the linked question's stem so the canvas shows the real
  // embedded question, not just its id. Re-runs when the linked id
  // changes (e.g. after picking a different question).
  useEffect(() => {
    // No id → nothing to fetch; the render guards on `!qid` first, so
    // any stale card from a previous id is never shown.
    if (!qid) return;
    let alive = true;
    (async () => {
      const res = (await getQuestionById(qid)) as
        | { ok: true; data: { question: QuestionCard | null } }
        | { ok: false; error: string };
      if (!alive) return;
      if (res.ok) {
        setCard(res.data.question);
        setMissing(res.data.question == null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [qid]);

  return (
    <div style={S.linked} ref={ref}>
      <div style={S.linkedIcon}>{blockMetaFor('question_link').icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={S.linkedTitle}>
          Practice question
          {card?.display_code ? (
            <code style={{ ...S.code, marginLeft: 8 }}>{card.display_code}</code>
          ) : null}
        </div>
        {!qid ? (
          <span style={S.placeholder}>No question selected yet — click Edit to pick one.</span>
        ) : missing ? (
          <span style={S.placeholder}>
            Linked id not found in the bank: <code style={S.code}>{qid}</code>
          </span>
        ) : card?.stem_html ? (
          <div style={S.questionStem}>
            <SafeHtml as="div" html={card.stem_html} />
          </div>
        ) : (
          <code style={S.code}>{qid}</code>
        )}
      </div>
    </div>
  );
}

function DesmosPreview({ block }: { block: Block }) {
  const ref = useRef<HTMLDivElement>(null);
  const title = block.content?.title;
  const instructions = block.content?.instructions_html ?? '';
  const mode = block.content?.validation?.mode;
  useMathTypeset(ref, instructions);
  return (
    <div style={S.linked} ref={ref}>
      <div style={S.linkedIcon}>{blockMetaFor('desmos_interactive').icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={S.linkedTitle}>{title || 'Desmos interactive'}</div>
        {instructions ? (
          <SafeHtml as="div" html={instructions} className={undefined} />
        ) : (
          <span style={S.placeholder}>No instructions yet.</span>
        )}
        {mode ? (
          <div style={S.metaRow}>
            checks: <code style={S.code}>{mode}</code>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EmptyPreview({ label }: { label: string }) {
  return <div style={S.empty}>{label}</div>;
}

const S: Record<string, React.CSSProperties> = {
  media: { display: 'flex', flexDirection: 'column', gap: 8 },
  videoFrame: {
    position: 'relative',
    width: '100%',
    maxWidth: 640,
    aspectRatio: '16 / 9',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    background: '#000',
  },
  iframe: { position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 },
  caption: { color: 'var(--fg3)', fontSize: 13 },
  plainLink: { color: 'var(--color-app-accent)', wordBreak: 'break-all' },

  check: { display: 'flex', flexDirection: 'column', gap: 8 },
  prompt: { fontWeight: 600, color: 'var(--fg1)' },
  choiceList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  choice: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 10px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    fontSize: 14,
    color: 'var(--fg1)',
  },
  choiceCorrect: {
    borderColor: 'var(--color-success)',
    background: 'var(--color-success-bg)',
  },
  choiceLetter: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    borderRadius: '50%',
    border: '1px solid var(--border-strong)',
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
  },
  correctTag: {
    marginLeft: 'auto',
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--color-diff-easy-fg)',
  },

  linked: {
    display: 'flex',
    gap: 12,
    alignItems: 'flex-start',
    padding: 12,
    border: '1px dashed var(--border-strong)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-white, var(--card))',
  },
  linkedIcon: { fontSize: 22, lineHeight: 1 },
  linkedTitle: { fontWeight: 600, color: 'var(--fg1)', marginBottom: 2 },
  code: { fontSize: 12, color: 'var(--fg2)' },
  metaRow: { marginTop: 6, fontSize: 12, color: 'var(--fg3)' },
  questionStem: { marginTop: 4, fontSize: 14, color: 'var(--fg1)', maxHeight: 200, overflow: 'auto' },

  empty: { color: 'var(--fg3)', fontStyle: 'italic', fontSize: 13 },
  placeholder: { color: 'var(--fg3)', fontStyle: 'italic' },
};
