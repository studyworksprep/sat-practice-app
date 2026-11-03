// Topic filter on /practice/history. A plain GET form: changing the
// select submits it, and a <noscript> Apply button covers no-JS.

'use client';

import { useRef } from 'react';
import s from './page.module.css';

interface Props {
  topics: string[];
  value: string;
  /** Params the form keeps (status, test). */
  keep: Record<string, string>;
}

export function TopicSelect({ topics, value, keep }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} method="get" className={s.topicForm}>
      {Object.entries(keep).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label htmlFor="history-topic" className={s.topicLabel}>Topic</label>
      <select
        id="history-topic"
        name="topic"
        defaultValue={value}
        className={s.topicSelect}
        onChange={() => formRef.current?.requestSubmit()}
      >
        <option value="">All topics</option>
        {topics.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <noscript>
        <button type="submit" className={s.topicApply}>Apply</button>
      </noscript>
    </form>
  );
}
