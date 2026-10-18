import { NextResponse } from 'next/server';
import { getLocaleConfig, getLocaleFromPathname, isSupportedLocale, normalizeLocale, SUPPORTED_LOCALES } from './lib/locales';
/* --- [TEMPORARY PLUGIN: china-ip-block START] --- */
import { handleChinaIpBlockMiddleware } from './plugins/china-ip-block/index.js';
/* --- [TEMPORARY PLUGIN: china-ip-block END] --- */



function addSecurityHeaders(response) {
    // Prevent MIME type sniffing (CWE-693)
    response.headers.set('X-Content-Type-Options', 'nosniff');
    // Prevent clickjacking (CWE-1021)
    response.headers.set('X-Frame-Options', 'DENY');
    // Enable XSS filter in legacy browsers
    response.headers.set('X-XSS-Protection', '1; mode=block');
    // Referrer policy
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Content Security Policy
    // style-src includes fonts.googleapis.com for Jost webfont
    // font-src includes fonts.gstatic.com for actual font files
    response.headers.set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.googletagmanager.com https://*.googletagmanager.com https://hm.baidu.com https://www.clarity.ms https://*.clarity.ms; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' https://canvas.supdance.com https://*.supdance.com https://muapi.ai https://*.muapi.ai https://www.runninghub.ai https://*.runninghub.ai https://*.runninghub.cn https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://hm.baidu.com https://www.clarity.ms https://*.clarity.ms; font-src 'self' data: https://fonts.gstatic.com; frame-src 'self' https://*.alipay.com https://openapi.alipay.com https://excashier.alipay.com https://unitradeprod.alipay.com https://*.alipayobjects.com;"
    );
    // 强制 HTML 页面与动态 API 不被浏览器协商强缓存，防止版本发布后旧 HTML 错位
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    return response;
}

// 别名语言前缀（/ja、/zh-CN、/es-ES）今天各自能渲染出一份重复的可索引页面。
// 308 的 Location origin 只能来自 PUBLIC_APP_URL：request.nextUrl.origin 是服务自己的
// 监听地址（localhost:3100），Next 既不读 Host 也不读 X-Forwarded-Host；而相对形式的
// Location 在 NextResponse 那一关直接抛 ERR_INVALID_URL。没配 PUBLIC_APP_URL 时宁可不跳转，
// 也不能把用户送去 localhost —— 308 可缓存，记住就回不来。
const APP_ORIGIN = (() => {
    const raw = String(process.env.PUBLIC_APP_URL || '').trim();
    if (!raw) return '';
    try {
        return new URL(raw).origin;
    } catch {
        return '';
    }
})();

function getPublicOrigin(request) {
    const rawHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
    if (rawHost) {
        const cleanHost = rawHost.split(',')[0].trim().toLowerCase();
        if (!cleanHost.includes('localhost') && !cleanHost.includes('127.0.0.1')) {
            const proto = (request.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim();
            return `${proto}://${cleanHost}`;
        }
    }
    if (APP_ORIGIN) return APP_ORIGIN;
    return request.nextUrl.origin;
}

const LOCALE_SHAPE = /^[a-z]{2}(?:[-_][A-Za-z]{2})?$/;

/** 首段是别名前缀时返回规范前缀（`/zh`、`/ja-JP`…）；已是规范前缀或不是语言段时 null。 */
function aliasCanonicalRoot(pathname) {
    const seg = pathname.split('/')[1] || '';
    if (!LOCALE_SHAPE.test(seg) || !isSupportedLocale(seg)) return null;
    const code = normalizeLocale(seg);
    if (code === 'en') return null;
    const rootPath = getLocaleConfig(code)?.rootPath || '';
    if (!rootPath || rootPath === `/${seg}`) return null;
    return rootPath;
}

function getCookieDomain(request) {
    const rawHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host || '';
    const cleanHost = rawHost.split(',')[0].trim().toLowerCase().split(':')[0];
    if (cleanHost.endsWith('.supdance.com') || cleanHost === 'supdance.com') {
        return '.supdance.com';
    }
    return undefined;
}

function isAllowedCanvasOrigin(origin) {
    if (!origin) return false;
    const lower = String(origin).trim().toLowerCase();
    if (lower === 'https://www.supdance.com' || lower === 'https://supdance.com' || lower === 'https://canvas.supdance.com') return true;
    if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
    return false;
}

export async function middleware(request) {
    const url = request.nextUrl;
    const pathname = url.pathname;
    const origin = request.headers.get('origin');

    // 0. 支持 Canvas 站点跨域 API 调用（含凭证和 OPTIONS 预检）
    if (pathname.startsWith('/api/') && isAllowedCanvasOrigin(origin)) {
        if (request.method === 'OPTIONS') {
            const preflight = new NextResponse(null, { status: 204 });
            preflight.headers.set('Access-Control-Allow-Origin', origin);
            preflight.headers.set('Access-Control-Allow-Credentials', 'true');
            preflight.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
            preflight.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key, X-KoyoSIM-Canvas, X-SupDance-Canvas, Accept, X-Requested-With');
            preflight.headers.set('Access-Control-Max-Age', '86400');
            preflight.headers.set('Vary', 'Origin');
            return preflight;
        }
    }

    // 0.5. 无限画布 (/canvas 或 /:locale/canvas) 属于独立子站点，规范重定向至 https://canvas.supdance.com
    if (pathname === '/canvas' || pathname.startsWith('/canvas/') || pathname.match(/^\/[a-zA-Z]{2}(?:-[a-zA-Z]{2})?\/canvas(?:\/.*)?$/)) {
        const canvasPath = pathname.replace(/^\/[a-zA-Z]{2}(?:-[a-zA-Z]{2})?(?=\/|$)/, '') || '/canvas';
        const canvasOrigin = 'https://canvas.supdance.com';
        const redirectUrl = new URL(`${canvasPath}${url.search}`, canvasOrigin);
        return addSecurityHeaders(NextResponse.redirect(redirectUrl, 308));
    }

    // 1. 静态资源、系统探针及 ACME 证书挑战路径免检放行
    const isExcluded =
        pathname.startsWith('/_next') ||
        pathname.startsWith('/.well-known') ||
        pathname === '/favicon.ico' ||
        pathname === '/robots.txt' ||
        pathname === '/sitemap.xml';

    /* --- [TEMPORARY PLUGIN: china-ip-block START] --- */
    const chinaIpBlockResponse = handleChinaIpBlockMiddleware(request);
    if (chinaIpBlockResponse) {
        return addSecurityHeaders(chinaIpBlockResponse);
    }
    /* --- [TEMPORARY PLUGIN: china-ip-block END] --- */

    // 2. 别名语言前缀收敛：/ja/studio → /ja-JP/studio，/zh-CN/… → /zh/…，/en/… → /…（保留其余段与 query）
    if (!isExcluded && !pathname.startsWith('/api/')) {
        const origin = getPublicOrigin(request);
        const cookieDomain = getCookieDomain(request);
        const cookieOpts = { path: '/', maxAge: 31536000, sameSite: 'lax', ...(cookieDomain ? { domain: cookieDomain } : {}) };
        const seg = pathname.split('/')[1] || '';
        if (seg === 'en') {
            const tail = pathname.slice(3) || '/';
            const redirectUrl = new URL(`${tail}${url.search}`, origin);
            const response = NextResponse.redirect(redirectUrl, 308);
            response.cookies.set('NEXT_LOCALE', 'en', cookieOpts);
            response.cookies.set('locale', 'en', cookieOpts);
            return addSecurityHeaders(response);
        }
        // 首页永远是根域名 https://www.Supdance.com：访问 /zh 或 /zh/ 直接规范收敛回 /，并在 cookie 中记录中文偏好
        if (pathname === '/zh' || pathname === '/zh/') {
            const redirectUrl = new URL(`/${url.search}`, origin);
            const response = NextResponse.redirect(redirectUrl, 308);
            response.cookies.set('NEXT_LOCALE', 'zh-CN', cookieOpts);
            response.cookies.set('locale', 'zh-CN', cookieOpts);
            return addSecurityHeaders(response);
        }
        const aliasRoot = aliasCanonicalRoot(pathname);
        if (aliasRoot) {
            const tail = pathname.slice(1 + (pathname.split('/')[1] || '').length);
            const segLocale = normalizeLocale(seg);
            const response = NextResponse.redirect(`${origin}${aliasRoot}${tail}${url.search}`, 308);
            if (segLocale) {
                response.cookies.set('NEXT_LOCALE', segLocale, cookieOpts);
                response.cookies.set('locale', segLocale, cookieOpts);
            }
            return addSecurityHeaders(response);
        }
    }

    let locale = getLocaleFromPathname(pathname);
    if (locale === 'en') {
        const queryLocale = url.searchParams.get('lang') || url.searchParams.get('locale');
        const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value || request.cookies.get('locale')?.value;
        const normalizedQueryLocale = normalizeLocale(queryLocale);
        const normalizedCookieLocale = normalizeLocale(cookieLocale);
        if (queryLocale && isSupportedLocale(queryLocale) && SUPPORTED_LOCALES.includes(normalizedQueryLocale)) {
            locale = normalizedQueryLocale;
        } else if (cookieLocale && isSupportedLocale(cookieLocale) && SUPPORTED_LOCALES.includes(normalizedCookieLocale)) {
            locale = normalizedCookieLocale;
        } else {
            const acceptLang = request.headers.get('accept-language');
            if (acceptLang) {
                const first = acceptLang.split(',')[0]?.trim()?.toLowerCase() || '';
                if (first.startsWith('zh')) {
                    locale = (first.includes('tw') || first.includes('hk')) ? 'zh-TW' : 'zh-CN';
                } else if (first.startsWith('ja')) {
                    locale = 'ja-JP';
                } else if (first.startsWith('ko')) {
                    locale = 'ko-KR';
                } else if (first.startsWith('es')) {
                    locale = 'es';
                }
            }
        }
    }

    // 5. 工作台与登录多语言直达：若非默认英文语言且访问未加前缀的 /studio 或 /login，跳转至对应工作台/登录页根路径（如 /zh/studio, /zh/login）
    // 注意：首页根路径 (pathname === '/') 绝对不跳转，永远稳定停留在 https://www.Supdance.com
    const publicOrigin = getPublicOrigin(request);
    if ((pathname === '/studio' || pathname.startsWith('/studio/') || pathname === '/login') && locale !== 'en') {
        const config = getLocaleConfig(locale);
        if (config?.rootPath) {
            const redirectUrl = new URL(`${config.rootPath}${pathname}${url.search}`, publicOrigin);
            const response = NextResponse.redirect(redirectUrl, 307);
            response.headers.set('x-locale', locale);
            return addSecurityHeaders(response);
        }
    }

    // 6. 资产中心严格守卫：未携带登录会话直接 307 重定向至登录页并携带回跳参数
    const isAssetsPath = !pathname.startsWith('/api/') && (pathname === '/assets' || pathname.endsWith('/assets'));
    if (isAssetsPath && !request.cookies.get('ko_session')?.value) {
        const config = getLocaleConfig(locale);
        const loginRoot = config?.rootPath ? `${config.rootPath}/login` : '/login';
        const redirectUrl = new URL(`${loginRoot}?redirect=${encodeURIComponent(pathname + url.search)}`, publicOrigin);
        const response = NextResponse.redirect(redirectUrl, 307);
        response.headers.set('x-locale', locale);
        return addSecurityHeaders(response);
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-locale', locale);

    const response = NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    });
    response.headers.set('x-locale', locale);
    const clientOrigin = request.headers.get('origin');
    if (pathname.startsWith('/api/') && isAllowedCanvasOrigin(clientOrigin)) {
        response.headers.set('Access-Control-Allow-Origin', clientOrigin);
        response.headers.set('Access-Control-Allow-Credentials', 'true');
        response.headers.set('Vary', 'Origin');
    }
    return addSecurityHeaders(response);
}

// Match all paths for security headers. Exclude Next.js internal paths.
export const config = {
    runtime: 'nodejs',
    matcher: [
        '/api/:path*',
        '/((?!_next/static|_next/image|favicon.ico|__nextjs_original-stack-frame).*)',
    ],
};

