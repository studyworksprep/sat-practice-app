'use client';

import { useParams } from 'next/navigation';
import StatsClient from '../../../../dashboard/stats/StatsClient';

export default function TeacherStudentStatsPage() {
  const { studentId } = useParams();

  return (
    <StatsClient
      fetchUrl={`/api/teacher/student/${studentId}/stats`}
      backUrl="/teacher"
      backLabel="← Students"
      title="Student Statistics"
    />
  );
}
