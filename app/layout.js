import './globals.css';
import localFont from "next/font/local";
import { cookies, headers } from 'next/headers';
import { getLocaleConfig } from '@/lib/locales';
import ChunkSelfHealing from '@/components/ChunkSelfHealing';
import GlobalSiteBanner from '@/components/GlobalSiteBanner';
import MaintenanceGate from '@/components/MaintenanceGate';
import { getSettingByKey } from '@/lib/services/settings';
import { getUserBySession } from '@/lib/services/auth';
import { getBrandConfig, getNavigationConfig } from '@/lib/services/branding';
import { BrandingProvider } from '@/lib/hooks/useBranding';

import DynamicFavicon from '@/components/site/DynamicFavicon';
import VisitorAnalytics from '@/components/analytics/VisitorAnalytics';
import { getVisitorAnalyticsConfig } from '@/lib/services/visitorAnalytics';
import { getSeoConfig, buildMetadata } from '@/lib/services/seo';

const inter = localFont({
  variable: "--font-inter",
  src: [
    {
      path: "./fonts/inter-latin-wght-normal.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
});

const jost = localFont({
  variable: "--font-jost",
  src: [
    {
      path: "./fonts/jost-latin-wght-normal.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
});

export const viewport = {
  themeColor: '#030303',
  colorScheme: 'dark',
};

export async function generateMetadata() {
  try {
    const seo = await getSeoConfig();
    const meta = buildMetadata(seo);
    return {
      ...meta,
      icons: {
        icon: [
          { url: '/branding/favicon.svg?v=3', type: 'image/svg+xml' },
          { url: '/branding/favicon.ico', sizes: 'any' },
        ],
        shortcut: '/branding/favicon.svg?v=3',
        apple: '/branding/favicon.svg?v=3',
      },
    };
  } catch {
    return {
      metadataBase: new URL('https://www.supdance.com'),
      title: 'SupDance — Free AI Image & Video Studio',
      description: 'Generate AI images and videos using 200+ models — Flux, Midjourney, Kling, Veo, Seedance and more.',
      icons: {
        icon: [
          { url: '/branding/favicon.svg?v=3', type: 'image/svg+xml' },
          { url: '/branding/favicon.ico', sizes: 'any' },
        ],
      },
    };
  }
}

export default async function RootLayout({ children }) {
  // Locale is derived from the URL path by middleware.js and passed
  // through as a plain response header — the root layout is shared by
  // every locale's route tree, so it can't take a `locale` prop directly.
  const headerList = await headers();
  const { htmlLang } = getLocaleConfig(headerList.get('x-locale'));

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('ko_session')?.value;
  const user = await getUserBySession(sessionToken);

  let banner = null;
  let maintenance = null;
  let brand = null;
  let navigation = null;
  let visitorAnalytics = null;
  try {
    banner = (await getSettingByKey('site_banner'))?.value || null;
    maintenance = (await getSettingByKey('maintenance_mode'))?.value || null;
    brand = await getBrandConfig();
    navigation = await getNavigationConfig();
    visitorAnalytics = await getVisitorAnalyticsConfig();
  } catch {}

  const currentLocale = getLocaleConfig(headerList.get('x-locale')).code;

  return (
    <html
      lang={htmlLang || currentLocale}
      className="dark bg-canvas"
      style={{ backgroundColor: '#030303', colorScheme: 'dark' }}
    >
      <body
        className={`bg-canvas text-ink ${inter.variable} ${jost.variable}`}
        style={{ backgroundColor: '#030303', color: '#ededf0' }}
      >
        <DynamicFavicon />
        <ChunkSelfHealing />
        <VisitorAnalytics config={visitorAnalytics} />
        <GlobalSiteBanner banner={banner} />
        <BrandingProvider initialBrand={brand} initialNav={navigation}>
          <MaintenanceGate maintenance={maintenance} user={user}>
            {children}
          </MaintenanceGate>
        </BrandingProvider>
      </body>
    </html>
  );
}
