'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import s from './PlanOverview.module.css';

export interface PhasePanel {
  label: string;
  summary: string;
  weeks: number[];
  content: ReactNode;
}

export function PlanPhaseTabs({ panels, currentWeek }: { panels: PhasePanel[]; currentWeek: number | null }) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const current = panels.findIndex((panel) => currentWeek != null && panel.weeks.includes(currentWeek));
  const [selected, setSelected] = useState(Math.max(current, 0));
  const active = panels[selected] ? selected : Math.max(current, 0);

  useEffect(() => {
    // Week links can also arrive from a bookmark or the browser's Back button.
    function revealWeek() {
      const match = /^#plan-week-(\d+)$/.exec(window.location.hash);
      if (!match) return;
      const panel = panels.findIndex((p) => p.weeks.includes(Number(match[1]) - 1));
      if (panel < 0) return;
      if (panel !== active) {
        setSelected(panel);
        return;
      }
      const week = document.getElementById(match[0].slice(1));
      if (week instanceof HTMLDetailsElement && root.current?.contains(week)) {
        week.open = true;
        week.querySelector('summary')?.focus({ preventScroll: true });
        week.scrollIntoView({ block: 'start' });
      }
    }
    revealWeek();
    window.addEventListener('hashchange', revealWeek);
    return () => {
      window.removeEventListener('hashchange', revealWeek);
    };
  }, [active, panels]);

  function select(index: number) {
    if (active !== index && /^#plan-week-\d+$/.test(location.hash)) {
      history.replaceState(history.state, '', location.pathname + location.search);
    }
    setSelected(index);
  }

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = panels.length - 1;
    let next;
    switch (event.key) {
      case 'ArrowLeft': next = index === 0 ? last : index - 1; break;
      case 'ArrowRight': next = index === last ? 0 : index + 1; break;
      case 'Home': next = 0; break;
      case 'End': next = last; break;
      default: return;
    }
    event.preventDefault();
    select(next);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  }

  return <div ref={root}>
    <div className={s.phaseTabs} role="tablist" aria-label="Study plan phases">
      {panels.map((panel, index) => (
        <button type="button" key={panel.weeks[0]} role="tab" id={`${id}-tab-${index}`}
          aria-controls={`${id}-panel-${index}`} aria-selected={active === index}
          aria-current={current === index ? 'step' : undefined} tabIndex={active === index ? 0 : -1}
          onClick={() => select(index)} onKeyDown={(event) => navigate(event, index)}>
          {panel.label}
        </button>
      ))}
    </div>
    {panels.map((panel, index) => (
      <div key={panel.weeks[0]} role="tabpanel" id={`${id}-panel-${index}`}
        aria-labelledby={`${id}-tab-${index}`} hidden={active !== index}>
        <p className={s.panelMeta}>
          {index === current && 'Current phase · '}
          {panel.weeks.length === 1 ? `Week ${panel.weeks[0] + 1}` :
            panel.weeks.length === panel.weeks[panel.weeks.length - 1] - panel.weeks[0] + 1
              ? `Weeks ${panel.weeks[0] + 1}–${panel.weeks[panel.weeks.length - 1] + 1}`
              : `${panel.weeks.length} weeks`}
        </p>
        {panel.summary && <p className={s.panelSummary}>{panel.summary}</p>}
        {panel.content}
      </div>
    ))}
  </div>;
}
