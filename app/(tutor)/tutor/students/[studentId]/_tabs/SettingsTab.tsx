// Settings tab: goal and start date, the step-back switch, and the
// standing extended-time accommodation — the things a tutor sets
// once rather than reads every visit.

import { formatDate } from '@/lib/formatters';
import { EditTargetStartButton } from '../EditTargetStartModal';
import { ExtendedTimeCard } from '../ExtendedTimeCard';
import { StepBackOffersCard } from '../StepBackOffersCard';
import type { StudentDetail } from '../load';
import { CardHead, ProfileRow } from './parts';
import s from '../StudentDetail.module.css';

export function SettingsTab({ d }: { d: StudentDetail }) {
  const { student, settings } = d;
  return (
    <div className={s.settingsGrid}>
      <section className={s.card}>
        <CardHead title="Goal and start date">
          <EditTargetStartButton studentId={student.id} targetScore={student.targetScore ?? null} startDate={student.startDate} />
        </CardHead>
        <dl className={s.snapshotList}>
          <ProfileRow label="Target score" value={student.targetScore ?? '—'} />
          <ProfileRow
            label="Start date"
            value={student.effectiveStartDate ? (formatDate(student.effectiveStartDate) ?? '—') : '—'}
            sub={student.startDate ? undefined : 'defaults to signup'}
          />
        </dl>
      </section>
      <StepBackOffersCard
        studentId={student.id}
        enabled={settings.detoursEnabled}
        isExplicit={settings.detourIsExplicit}
        hasAssignedTutor={settings.hasAssignedTutor}
      />
      <ExtendedTimeCard studentId={student.id} value={settings.timeAccommodation} />
    </div>
  );
}
