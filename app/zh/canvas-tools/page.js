import { cookies } from 'next/headers';
import CanvasToolsStudio from '@/components/canvasTools/CanvasToolsStudio';
import { getUserBySession } from '@/lib/services/auth';
import '@/components/canvasTools/canvas-tools.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '画布工具 — SupDance',
  description: '扩图、智能超清、抠图、三视图与多角度画布工具，由 Seedream 图生图承接。',
};

export default async function ZhCanvasToolsPage() {
  let user = null;
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('ko_session')?.value;
    if (sessionToken) user = await getUserBySession(sessionToken);
  } catch {}

  const initialUser = user
    ? { id: user.id, displayName: user.displayName, avatar: user.avatar || null }
    : null;

  return <CanvasToolsStudio initialUser={initialUser} />;
}
