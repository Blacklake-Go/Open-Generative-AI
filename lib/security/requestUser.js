import { getUserFromRequest } from '@/lib/services/auth';
import { publicErrorMessage } from '@/lib/security/publicError';

/** Resolve a request session without turning auth infrastructure failures into 500s. */
export async function resolveRequestUser(request) {
  try {
    const user = await getUserFromRequest(request);
    if (user) return { user };
    return {
      user: null,
      status: 401,
      code: 'UNAUTHENTICATED',
      error: '请先登录',
    };
  } catch (error) {
    return {
      user: null,
      status: 503,
      code: 'AUTH_SESSION_UNAVAILABLE',
      error: publicErrorMessage(error, '登录状态暂时无法确认，请稍后重试'),
    };
  }
}
