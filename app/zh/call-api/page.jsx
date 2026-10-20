import CallApiPage from '@/app/call-api/page';

export const metadata = {
  title: '开发者 API — 筹备中 | SupDance',
  description: 'SupDance 开发者 API 仍在筹备中，暂未开放 API Key、SDK 或 MCP 接入。',
  robots: { index: false, follow: false },
};

export default function ZhCallApiPage() {
  return <CallApiPage locale="zh-CN" />;
}
