import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import CanvasToolsStudio from '@/components/canvasTools/CanvasToolsStudio';
import { getUserBySession } from '@/lib/services/auth';
import '@/components/canvasTools/canvas-tools.css';

export const dynamic = 'force-dynamic';

const TOOL_ROUTES = Object.freeze({
  outpaint: { toolId: 'outpaint', title: '扩图' },
  upscale: { toolId: 'upscale', title: '智能超清' },
  cutout: { toolId: 'cutout', title: '抠图' },
  'three-view': { toolId: 'preset', title: '三视图' },
  preset: { toolId: 'preset', title: '三视图' },
  'multi-angle': { toolId: 'view_control', title: '多角度' },
  'view-control': { toolId: 'view_control', title: '多角度' },
  view_control: { toolId: 'view_control', title: '多角度' },
});

const PRESET_ROUTES = Object.freeze({
  'scene-top-view': 'scene_top_view',
  storyboard: 'continuous_storyboard',
  'nine-grid': 'multi_camera_nine_grid',
  character: 'character_three_view',
  face: 'face_three_view',
  product: 'product_three_view',
  scene_top_view: 'scene_top_view',
  continuous_storyboard: 'continuous_storyboard',
  multi_camera_nine_grid: 'multi_camera_nine_grid',
  character_three_view: 'character_three_view',
  face_three_view: 'face_three_view',
  product_three_view: 'product_three_view',
});

const PRESET_LABELS = Object.freeze({
  scene_top_view: '场景俯视图',
  continuous_storyboard: '连续分镜图',
  multi_camera_nine_grid: '多机位九宫格',
  character_three_view: '人物三视图',
  face_three_view: '面部三视图',
  product_three_view: '产品三视图',
});

function resolveRoute(slug, queryPreset) {
  const segments = Array.isArray(slug)
    ? slug.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
    : [];
  if (!segments.length || segments.length > 2) return null;

  const tool = TOOL_ROUTES[segments[0]];
  if (!tool) return null;

  if (segments.length === 2) {
    if (tool.toolId !== 'preset') return null;
    const presetId = PRESET_ROUTES[segments[1]];
    return presetId ? { ...tool, presetId } : null;
  }

  if (tool.toolId === 'preset' && queryPreset) {
    const presetId = PRESET_ROUTES[String(queryPreset).trim().toLowerCase()];
    if (presetId) return { ...tool, presetId };
  }

  return tool;
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const route = resolveRoute(slug);
  if (!route) return { title: '画布工具 — SupDance' };
  const label = route.presetId ? `${route.title} · ${PRESET_LABELS[route.presetId]}` : route.title;
  return {
    title: `${label} — SupDance 画布`,
    description: `${label}：上传图片即可使用，由 Seedream 图生图承接。`,
  };
}

export default async function ZhCanvasToolPage({ params, searchParams }) {
  const { slug } = await params;
  const query = await searchParams;
  const route = resolveRoute(slug, query?.preset);
  if (!route) notFound();

  let user = null;
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('ko_session')?.value;
    if (sessionToken) user = await getUserBySession(sessionToken);
  } catch {}

  const initialUser = user
    ? { id: user.id, displayName: user.displayName, avatar: user.avatar || null }
    : null;

  return (
    <CanvasToolsStudio
      initialUser={initialUser}
      initialTool={route.toolId}
      initialPreset={route.presetId || null}
    />
  );
}
