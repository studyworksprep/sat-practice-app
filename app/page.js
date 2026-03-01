import { redirect } from 'next/navigation';
import { getUser } from '../lib/db';
import LandingClient from '../components/LandingClient';

export default async function HomePage() {
  const user = await getUser();
  if (user) redirect('/dashboard');
  return <LandingClient />;
}
