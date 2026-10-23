import FeedbackPageClient from '@/components/feedback/FeedbackPageClient';
import { DEFAULT_FEEDBACK_SUPPORT_EMAIL } from '@/lib/feedback/catalog';
import { getSubscriptionFaqConfig } from '@/lib/services/subscriptionFaq';

export const metadata = {
  title: '建议与需求 — SupDance',
  description: '提交网站报错、体验建议或安全漏洞，可附截图、录屏与日志（合计 30MB），有效采纳后获得硬币奖励。',
};

export const dynamic = 'force-dynamic';

export default async function FeedbackPage() {
  const config = await getSubscriptionFaqConfig();
  return <FeedbackPageClient supportEmail={config.supportEmail || DEFAULT_FEEDBACK_SUPPORT_EMAIL} />;
}
