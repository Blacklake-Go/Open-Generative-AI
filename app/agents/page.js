import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Agents — supdance',
};

export default function AgentsPage() {
  redirect('/studio/agents');
}
