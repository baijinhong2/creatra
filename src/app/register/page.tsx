import { redirect } from 'next/navigation';

export default function RegisterPage() {
  // The single auth page lives at /login and toggles to register mode
  // via a client-side button. We just bounce /register there.
  redirect('/login');
}
