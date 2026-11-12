import Client from '@/components/community/CommunitySubmitClient';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'My submissions — SupDance ONE', robots: { index: false, follow: false } };
export default function Page() { return <Client locale='zh-CN'/>; }
