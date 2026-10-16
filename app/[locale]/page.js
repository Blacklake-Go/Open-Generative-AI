import { notFound } from 'next/navigation';
import { getLocaleConfig, isSupportedLocale, normalizeLocale } from '@/lib/locales';
import JimengHomePortal from '@/components/home/JimengHomePortal';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const normalized = normalizeLocale(locale);
  return {
    title: normalized === 'zh-CN' ? 'SupDance 创作中心' : 'SupDance — AI Creative Workspace',
    description: 'AI Creative Creation Portal & Studio.',
  };
}

export default async function LocalizedHome({ params }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const normalized = normalizeLocale(locale);
  if (normalized === 'en') notFound();

  return <JimengHomePortal locale={normalized} />;
}
