import Script from 'next/script';
import { getVisitorAnalyticsConfig, normalizeVisitorAnalyticsConfig } from '@/lib/services/visitorAnalytics';
import CustomScriptLoader from './CustomScriptLoader';
import AnalyticsRouteTracker from './AnalyticsRouteTracker';

/**
 * VisitorAnalytics Component
 * Asynchronously injects enabled third-party analytics trackers (GA4, Baidu Tongji,
 * Microsoft Clarity, and custom scripts) into the public website layout.
 *
 * Performance Characteristics:
 * - GA4 & Baidu Tongji: strategy="afterInteractive" (loads after hydration)
 * - Microsoft Clarity: strategy="lazyOnload" (loads on idle, protects INP & TBT)
 * - Custom Scripts: non-blocking async execution via CustomScriptLoader
 * - Clean DOM: Returns null (0 DOM nodes, 0 script tags) when all tools are disabled.
 */
export default async function VisitorAnalytics({ config: initialConfig = null }) {
  const config = initialConfig || (await getVisitorAnalyticsConfig());
  const norm = normalizeVisitorAnalyticsConfig(config);

  const ga4Enabled = Boolean(norm.googleAnalytics?.enabled && norm.googleAnalytics?.measurementId);
  const baiduEnabled = Boolean(norm.baiduTongji?.enabled && norm.baiduTongji?.siteId);
  const clarityEnabled = Boolean(norm.microsoftClarity?.enabled && norm.microsoftClarity?.projectId);
  const customEnabled = Boolean(norm.customScript?.enabled && norm.customScript?.code);

  // If no tracking tool is active, render 0 DOM nodes and 0 script tags
  if (!ga4Enabled && !baiduEnabled && !clarityEnabled && !customEnabled) {
    return null;
  }

  return (
    <>
      {/* Google Analytics 4 */}
      {ga4Enabled && (
        <>
          <Script
            id="ga4-src"
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(norm.googleAnalytics.measurementId)}`}
          />
          <Script id="ga4-inline" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${norm.googleAnalytics.measurementId.replace(/[^A-Za-z0-9_-]/g, '')}');
            `}
          </Script>
        </>
      )}

      {/* Baidu Tongji */}
      {baiduEnabled && (
        <>
          <Script id="baidu-tongji-init" strategy="afterInteractive">
            {`window._hmt = window._hmt || [];`}
          </Script>
          <Script
            id="baidu-tongji"
            strategy="afterInteractive"
            src={`https://hm.baidu.com/hm.js?${encodeURIComponent(norm.baiduTongji.siteId)}`}
          />
        </>
      )}

      {/* Microsoft Clarity (lazyOnload for Core Web Vitals INP/TBT protection) */}
      {clarityEnabled && (
        <Script id="clarity-script" strategy="lazyOnload">
          {`
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "${norm.microsoftClarity.projectId.replace(/[^0-9a-zA-Z]/g, '')}");
          `}
        </Script>
      )}

      {/* Custom Analytics Code */}
      {customEnabled && (
        <CustomScriptLoader code={norm.customScript.code} />
      )}

      {/* SPA Route Transitions Listener */}
      {(ga4Enabled || baiduEnabled) && (
        <AnalyticsRouteTracker
          ga4Enabled={ga4Enabled}
          ga4Id={norm.googleAnalytics.measurementId}
          baiduEnabled={baiduEnabled}
        />
      )}
    </>
  );
}
