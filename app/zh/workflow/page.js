import { redirect } from 'next/navigation';

export const metadata = {
  title: '工作流 — supdance',
  robots: { index: false, follow: false },
};

export default function LocalizedWorkflowIndexPage() {
  redirect('/zh/studio/workflows');
}
