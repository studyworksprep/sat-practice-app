'use client';

import { useState } from 'react';
import { Button } from '@/lib/ui/Button';
import { getBlockLabel, sharedPromptIdFor } from '@/lib/lesson/editor-utils.mjs';
import { RichTextEditor } from './RichTextEditor';
import f from '../../../forms.module.css';
import s from './SharedPromptEditor.module.css';

export type SharedPrompt = { id: string; title: string; html: string };
type Block = { id?: string; block_type?: string; content?: Record<string, unknown> };

export function SharedPromptEditor({ blocks, prompts, activeId, onOpen, onClose, onApply }: {
  blocks: Block[];
  prompts: ReadonlyMap<string, SharedPrompt>;
  activeId: string | null | undefined;
  onOpen: (id: string | null) => void;
  onClose: () => void;
  onApply: (prompt: SharedPrompt, selectedIds: Set<string>) => void;
}) {
  const activePrompt = activeId ? prompts.get(activeId) : undefined;

  return (
    <details className={s.panel}>
      <summary>Shared prompts{prompts.size ? ` (${prompts.size})` : ''}</summary>
      <p className={f.muted}>Write a question, passage, or table once. Choose the slides where students should see it.</p>
      {activeId !== undefined ? (
        <PromptDraft
          key={activeId ?? 'new'}
          blocks={blocks}
          prompts={prompts}
          prompt={activePrompt}
          onClose={onClose}
          onApply={onApply}
        />
      ) : (
        <>
          {[...prompts.values()].map((prompt) => (
            <div key={prompt.id} className={s.promptRow}>
              <span>{prompt.title}</span>
              <Button type="button" variant="secondary" size="sm" aria-label={`Edit ${prompt.title}`} onClick={() => onOpen(prompt.id)}>Edit</Button>
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" disabled={!blocks.length} onClick={() => onOpen(null)}>Add shared prompt</Button>
        </>
      )}
    </details>
  );
}

function PromptDraft({ blocks, prompts, prompt, onApply, onClose }: {
  blocks: Block[];
  prompts: ReadonlyMap<string, SharedPrompt>;
  prompt?: SharedPrompt;
  onApply: (prompt: SharedPrompt, selectedIds: Set<string>) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(prompt?.title ?? '');
  const [html, setHtml] = useState(prompt?.html ?? '');
  const [editHtml, setEditHtml] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set(
    blocks.flatMap((block) => prompt && block.id && sharedPromptIdFor(block) === prompt.id ? [block.id] : []),
  ));
  const available = blocks.filter((block) => {
    const id = sharedPromptIdFor(block);
    return !id || id === prompt?.id;
  });
  const selected = new Set(available.flatMap(({ id }) => id && selectedIds.has(id) ? [id] : []));

  function toggleBlock(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function apply() {
    onApply({ id: prompt?.id ?? crypto.randomUUID(), title: title.trim(), html: html.trim() }, selected);
  }

  return (
    <div className={s.draft}>
      <label className={s.field}>
        Prompt title
        <input className={f.input} value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <div className={s.promptRow}>
        <strong>Prompt content</strong>
        <Button type="button" variant="secondary" size="sm" onClick={() => setEditHtml(!editHtml)}>{editHtml ? 'Use visual editor' : 'Edit HTML'}</Button>
      </div>
      {editHtml ? (
        <textarea aria-label="Prompt HTML" className={f.input} rows={6} value={html} onChange={(event) => setHtml(event.target.value)} />
      ) : (
        <RichTextEditor html={html} onChange={setHtml} allowTables label="Prompt content" />
      )}
      <fieldset className={s.fieldset}>
        <legend>Show on these slides</legend>
        <div className={s.slides}>
          {blocks.map((block, index) => {
            if (!block.id) return null;
            const id = block.id;
            const existingId = sharedPromptIdFor(block);
            const occupied = existingId != null && existingId !== prompt?.id;
            return (
              <label key={id} className={s.slide}>
                <input type="checkbox" checked={selected.has(id)} disabled={occupied} onChange={() => toggleBlock(id)} />
                <span>{index + 1}. {String(getBlockLabel(block)).slice(0, 100)}{occupied ? ` (shows ${prompts.get(existingId)?.title ?? 'another prompt'})` : ''}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className={s.actions}>
        <Button type="button" size="sm" disabled={!title.trim() || !html.trim() || html.trim() === '<p></p>' || !selected.size} onClick={apply}>Apply prompt</Button>
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        {prompt ? <Button type="button" variant="remove" size="sm" onClick={() => onApply(prompt, new Set())}>Remove prompt</Button> : null}
      </div>
    </div>
  );
}
