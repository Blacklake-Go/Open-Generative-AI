import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUserBySession } from '../services/auth.js';
import { hasPermission, ROLE_PERMISSIONS } from './permissions.js';

/** 只有持有至少一项后台权限的角色才算管理员身份。 */
export function isAdminTierRole(role) {
  return (ROLE_PERMISSIONS?.[String(role || '')]?.size || 0) > 0;
}

/**
 * @param permission 需要的权限点；传 null 表示只要求管理员身份。
 *   /admin/forbidden 自身是“权限不足”的落点，若仍按具体权限校验会再跳回本页形成死循环。
 */
export async function requireAdminPagePermission(permission) {
  const cookieStore = await cookies();
  const token = cookieStore.get('ko_session')?.value;
  const user = await getUserBySession(token);
  if (!user) redirect('/account?next=/admin');
  if (permission === null) {
    if (!isAdminTierRole(user.role)) redirect('/account?next=/admin');
    return user;
  }
  if (!hasPermission(user.role, permission)) redirect('/admin/forbidden');
  return user;
}
