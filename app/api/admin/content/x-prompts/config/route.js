import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getCrawlerConfig, updateCrawlerConfig } from '@/lib/services/xPromptCrawler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.contentRead);
  if (!guard.ok) return guard.response;

  const config = await getCrawlerConfig();

  // 掩码处理敏感 Cookie
  const safeConfig = {
    ...config,
    cookies: {
      hasAuthToken: Boolean(config.cookies?.authToken),
      authTokenMasked: config.cookies?.authToken
        ? `${config.cookies.authToken.slice(0, 4)}••••${config.cookies.authToken.slice(-4)}`
        : '',
      hasCt0: Boolean(config.cookies?.ct0),
      ct0Masked: config.cookies?.ct0
        ? `${config.cookies.ct0.slice(0, 4)}••••${config.cookies.ct0.slice(-4)}`
        : '',
    },
  };

  return okResponse(safeConfig, guard.requestId);
}

async function handlePUT(request) {
  const guard = await requirePermission(request, PERMISSIONS.contentWrite);
  if (!guard.ok) return guard.response;

  let body = {};
  try {
    body = await request.json();
  } catch {
    return errorResponse('INVALID_BODY', '无效的 JSON 请求体', 400, guard.requestId);
  }

  const current = await getCrawlerConfig();

  // 若传入新的 Cookie 且非掩码值，则更新；否则保留现存值
  const newAuthToken = body.cookies?.authToken;
  const newCt0 = body.cookies?.ct0;

  const cookiesToSave = {
    authToken: (newAuthToken && !newAuthToken.includes('••••')) ? newAuthToken.trim() : current.cookies.authToken,
    ct0: (newCt0 && !newCt0.includes('••••')) ? newCt0.trim() : current.cookies.ct0,
  };

  const updated = await updateCrawlerConfig(
    {
      cookies: cookiesToSave,
      rules: body.rules || current.rules,
    },
    guard.user.email
  );

  return okResponse(
    {
      ...updated,
      cookies: {
        hasAuthToken: Boolean(updated.cookies?.authToken),
        authTokenMasked: updated.cookies?.authToken
          ? `${updated.cookies.authToken.slice(0, 4)}••••${updated.cookies.authToken.slice(-4)}`
          : '',
        hasCt0: Boolean(updated.cookies?.ct0),
        ct0Masked: updated.cookies?.ct0
          ? `${updated.cookies.ct0.slice(0, 4)}••••${updated.cookies.ct0.slice(-4)}`
          : '',
      },
    },
    guard.requestId
  );
}

export const GET = withAdminErrorBoundary(handleGET);
export const PUT = withAdminErrorBoundary(handlePUT);
