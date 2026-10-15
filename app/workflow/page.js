import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Workflows — supdance',
  robots: { index: false, follow: false },
};

/** 旧别名：工作台段已经收进 /studio/workflows，这条壳不该再被索引第二遍。 */
export default function WorkflowIndexPage() {
  redirect('/studio/workflows');
}
