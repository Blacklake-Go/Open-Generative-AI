import { NextResponse } from 'next/server';
import {
  getUserFromRequest,
  submitOnboardingIdentity,
  submitOnboardingPreferences,
  submitOnboardingSkip,
  submitUserOnboarding,
} from '@/lib/services/auth.js';
import { publicErrorMessage } from '@/lib/security/publicError.js';
import { consumeRateLimit, guardMutation } from '@/lib/security/requestGuard';
import { getQuotaRules } from '@/lib/services/quotaRules.js';

export const runtime = 'nodejs';

function ipOf(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

export async function POST(request) {
  const deniedByOrigin = guardMutation(request);
  if (deniedByOrigin) return deniedByOrigin;

  try {
    const user = await getUserFromRequest(request);
    const rl = await consumeRateLimit({
      scope: 'user.onboarding',
      subject: user?.id || ipOf(request),
      limit: 20,
      windowMs: 60_000,
    });

    if (!rl.allowed) {
      return NextResponse.json(
        { error: '请求过于频繁，请稍后再试' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    if (!user) {
      return NextResponse.json({ error: '请先登录后再提交偏好信息' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const step = Number(body.step);

    // 1. 分步模式：第一步 身份设定 (昵称与头像)
    if (step === 1) {
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : null;
      const avatarUrl = typeof body.avatarUrl === 'string' ? body.avatarUrl.trim() : null;
      const result = await submitOnboardingIdentity({
        userId: user.id,
        displayName,
        avatarUrl,
        fallbackDisplayName: user.displayName,
      });

      return NextResponse.json({
        ok: true,
        message: '创作者身份与昵称已设定',
        data: {
          step: 1,
          userId: user.id,
          displayName: result.profile?.display_name || displayName,
          avatarUrl: result.profile?.avatar_url || avatarUrl,
        },
      });
    }

    // 2. 分步模式：跳过引导 (或直接请求 skip)
    if (body.skip === true || (step === 2 && body.skip)) {
      const result = await submitOnboardingSkip({ userId: user.id });
      return NextResponse.json({
        ok: true,
        message: '已跳过引导，进入创作工作台',
        data: {
          completed: true,
          skipped: true,
          rewardCredits: 0,
          userId: user.id,
        },
      });
    }

    // 3. 分步模式：第二步 偏好问卷提交
    if (step === 2 && body.answers && typeof body.answers === 'object') {
      const result = await submitOnboardingPreferences({
        userId: user.id,
        answers: body.answers,
      });

      return NextResponse.json({
        ok: true,
        message: '创作者偏好已保存，新手礼包已发放到账',
        data: {
          completed: true,
          userId: user.id,
          rewardCredits: result.rewardCredits,
          personaCode: result.personaCode,
          tagIds: result.tagIds,
        },
      });
    }

    // 4. 一体化弹窗表单模式 (UserOnboardingModal 提交)
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : null;
    const avatarUrl = typeof body.avatarUrl === 'string' ? body.avatarUrl.trim() : null;
    const zodiac = typeof body.zodiac === 'string' ? body.zodiac.trim() : null;
    const industry = typeof body.industry === 'string' ? body.industry.trim() : null;
    const occupation = typeof body.occupation === 'string' ? body.occupation.trim() : null;
    const preferences = body.preferences && typeof body.preferences === 'object' ? body.preferences : {};

    const result = await submitUserOnboarding({
      userId: user.id,
      displayName,
      avatarUrl,
      fallbackDisplayName: user.displayName,
      zodiac,
      industry,
      occupation,
      preferences,
    });

    return NextResponse.json({
      ok: true,
      message: '用户互动画像与偏好习惯保存成功',
      data: {
        completed: true,
        userId: user.id,
        displayName: result.profile?.display_name || displayName || user.displayName,
        avatarUrl: result.profile?.avatar_url || avatarUrl || user.avatar,
        rewardCredits: result.rewardCredits,
        zodiac,
        industry,
        occupation,
        preferences,
      },
    });
  } catch (error) {
    console.error('[api/user/onboarding] 保存失败:', error);
    const code = error?.code || 'ONBOARDING_FAILED';
    const message = error?.message || '保存偏好设置失败';
    return NextResponse.json(
      { code, error: publicErrorMessage(error, message) },
      { status: 500 }
    );
  }
}
