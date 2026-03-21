import { redirect } from 'next/navigation';

// Legacy route — admin content now lives on the main dashboard.
export default function AdminRedirect() {
  redirect('/dashboard');
}
