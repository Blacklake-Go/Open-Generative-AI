import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { getLocaleConfig, isSupportedLocale, normalizeLocale } from '@/lib/locales';

export const dynamic = 'force-dynamic';

export default async function LocalizedAssetsPage({ params }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale) || normalizeLocale(locale) === 'en') notFound();
  const normalized = normalizeLocale(locale);
  const { rootPath } = getLocaleConfig(normalized);
  redirect(`${rootPath}/assets`);
}
