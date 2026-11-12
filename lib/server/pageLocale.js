import { notFound, permanentRedirect } from 'next/navigation';
import { getLocaleConfig, isSupportedLocale, normalizeLocale } from '../locales.js';

export async function resolvePageLocale(params, basePath, searchParams) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const normalized = normalizeLocale(locale);
  const config = getLocaleConfig(normalized);
  if (locale !== config.rootPath.slice(1)) {
    const query = new URLSearchParams(await searchParams || {}).toString();
    permanentRedirect(`${config.rootPath}${basePath}${query ? `?${query}` : ''}`);
  }
  return normalized;
}
