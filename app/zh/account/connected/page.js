import Client from '@/components/account/FederationAccountClient';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'SupDance ONE — Account connection', robots: { index: false, follow: false } };
export default function Page() { return <Client locale='zh-CN'/>; }
