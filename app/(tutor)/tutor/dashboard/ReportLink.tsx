'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { track } from '@vercel/analytics';
import { useDashboardHistory } from '@/lib/tutor/DashboardHistory';

type Props = Omit<ComponentProps<typeof Link>, 'onClick'> & {
  studentId: string;
  assignmentType: string;
};

export function ReportLink({ studentId, assignmentType, children, ...props }: Props) {
  const { recordStudent } = useDashboardHistory([]);
  return <Link {...props} prefetch={false} onClick={() => {
    recordStudent?.(studentId);
    track('tutor_dashboard_action', { action: 'review_results', assignment_type: assignmentType });
  }}>{children}</Link>;
}
