import { NextResponse } from 'next/server';
import { listAvailableAppModels } from '@/lib/services/models';
import { serializePublicAppModel } from '@/lib/modelCenter/publicDirectory';

/**
 * GET /api/app/models/available?type=image
 *
 * 返回指定类型下前台可用的模型列表（含积分价格、能力标签）。
 * 与 Studio 公开目录共用服务端可选集合；不为缺价模型填充默认价格。
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'image';

    const models = await listAvailableAppModels(type);

    const result = models.map(serializePublicAppModel);

    return NextResponse.json({ data: { models: result, type } });
  } catch (err) {
    console.error('[api/app/models/available] Error:', err.message);
    return NextResponse.json(
      { error: { message: '获取可用模型失败' } },
      { status: 500 }
    );
  }
}
