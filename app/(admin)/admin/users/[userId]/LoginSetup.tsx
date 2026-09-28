// "Login" section of the admin user page (server half): reads the auth
// account behind a student profile and hands the facts to the client
// card. The read needs the service role (auth.users is not exposed to
// the RLS client), so it goes through requireServiceRole with the admin
// gate; when the read fails, the card still renders and says so, rather
// than taking the whole user page down.

import { requireServiceRole } from '@/lib/api/auth';
import { isPlaceholderEmail } from '@/lib/email/loginSetup';
import { LoginSetupCard, type LoginState } from './LoginSetupCard';

interface LoginSetupProps {
  subject: {
    id: string;
    email: string | null;
    welcome_email_sent_at: string | null;
    lessonworks_student_id: string | null;
  };
}

export async function LoginSetup({ subject }: LoginSetupProps) {
  let state: LoginState | null = null;
  let loadError: string | null = null;
  try {
    const { service } = await requireServiceRole('admin user page: auth login state', {
      allowedRoles: ['admin'],
    });
    const { data, error } = await service.auth.admin.getUserById(subject.id);
    if (error || !data?.user) {
      loadError = error?.message ?? 'No login account found for this profile.';
    } else {
      const u = data.user;
      state = {
        loginEmail: u.email ?? null,
        placeholder: isPlaceholderEmail(u.email),
        emailConfirmedAt: u.email_confirmed_at ?? null,
        lastSignInAt: u.last_sign_in_at ?? null,
        recoverySentAt: u.recovery_sent_at ?? null,
      };
    }
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Unexpected error';
  }

  return (
    <LoginSetupCard
      userId={subject.id}
      profileEmail={subject.email}
      state={state}
      loadError={loadError}
      welcomeSentAt={subject.welcome_email_sent_at}
      fromLessonworks={subject.lessonworks_student_id != null}
    />
  );
}
