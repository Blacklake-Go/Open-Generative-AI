import { notFound } from 'next/navigation';
import { resolveAuthEmbedOptions } from '@/lib/auth/embedAuth';
import EmbeddedAuth from './EmbeddedAuth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'SupDance 登录', robots: { index: false, follow: false } };

export default async function EmbedAuthPage({ searchParams }) {
  const options = resolveAuthEmbedOptions(await searchParams);
  if (!options) notFound();
  return <EmbeddedAuth {...options} />;
}
