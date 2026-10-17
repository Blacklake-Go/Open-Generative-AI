import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OCCUPATIONS,
  PURPOSES,
  OCCUPATION_MAP,
  PURPOSE_MAP,
  normalizePreferenceAnswers,
  buildPersonaCode,
  tagIdsForPreferences,
} from '../../lib/onboarding/schema.js';
import {
  submitOnboardingPreferences,
  submitOnboardingSkip,
} from '../../lib/services/auth.js';
import { execute, queryOne } from '../../lib/db/index.js';

test('新人引导 3.0：Schema 枚举与归一化校验契约', () => {
  // 1. 验证 9 项核心职业枚举
  const expectedOccCodes = [
    'media_culture',
    'content_creator',
    'freelancer',
    'art_design',
    'education_training',
    'ad_marketing',
    'technology',
    'student',
    'other',
  ];
  for (const code of expectedOccCodes) {
    assert.ok(OCCUPATION_MAP[code], `职业枚举中必须存在 ${code}`);
    assert.ok(OCCUPATION_MAP[code].label, `${code} 必须有中文标签`);
    assert.ok(OCCUPATION_MAP[code].labelEn, `${code} 必须有英文标签`);
    assert.ok(OCCUPATION_MAP[code].tagId, `${code} 必须有对应运营标签`);
  }

  // 2. 验证 8 项核心创作场景目的枚举
  const expectedPurCodes = [
    'self_media',
    'ad_content',
    'film_video',
    'product_design',
    'personal_interest',
    'creative_inspiration',
    'aigc_training',
    'other',
  ];
  for (const code of expectedPurCodes) {
    assert.ok(PURPOSE_MAP[code], `目的枚举中必须存在 ${code}`);
    assert.ok(PURPOSE_MAP[code].label, `${code} 必须有中文标签`);
    assert.ok(PURPOSE_MAP[code].labelEn, `${code} 必须有英文标签`);
    assert.ok(PURPOSE_MAP[code].tagId, `${code} 必须有对应运营标签`);
  }

  // 3. 归一化输入校验：合法两步式回答通过
  const validRes = normalizePreferenceAnswers({
    occupation: 'content_creator',
    purpose: 'self_media',
    customText: '主攻短视频与小红书分享',
  });
  assert.equal(validRes.error, undefined, '合法输入不应返回错误');
  assert.equal(validRes.value.occupation, 'content_creator');
  assert.equal(validRes.value.occupationLabel, '自媒体创作者');
  assert.deepEqual(validRes.value.purposeCodes, ['self_media']);
  assert.equal(validRes.value.customText, '主攻短视频与小红书分享');
  assert.equal(validRes.value.commitment, 'browsing', '默认频次兜底合规');
  assert.equal(validRes.value.usageIntent, 'personal', '默认用途兜底合规');

  // 4. 非法输入拦截
  const missingOcc = normalizePreferenceAnswers({ purpose: 'self_media' });
  assert.match(missingOcc.error, /工作领域|职业/, '未选职业应提示错误');

  const missingPur = normalizePreferenceAnswers({ occupation: 'content_creator' });
  assert.match(missingPur.error, /创作场景|目的/, '未选创作场景应提示错误');

  // 5. 人群短码与标签生成
  const persona = buildPersonaCode(validRes.value);
  assert.ok(persona.includes('CREATOR'), '短码应包含 CREATOR 段');
  assert.ok(persona.includes('SMEDIA'), '短码应包含 SMEDIA 段');

  const tagIds = tagIdsForPreferences(validRes.value);
  assert.ok(tagIds.includes('tag_occ_creator'), '标签集应包含 tag_occ_creator');
  assert.ok(tagIds.includes('tag_pur_self_media'), '标签集应包含 tag_pur_self_media');
});

test('新人引导 3.0：数据库落库、字段持久化与算力发放全流程验证', async () => {
  const testUserId = String(88000000 + Math.floor(Math.random() * 900000));
  const testEmail = `test_ob3_${testUserId}@example.com`;

  try {
    // 预分配 ID 契约
    await execute('INSERT INTO auth_usr.user_id_allocations (user_id, digit_length) VALUES ($1, $2)', [testUserId, testUserId.length]);

    // 创建测试用户 (符合 users_id_numeric_check 与 FK 约束)
    await execute(`
      INSERT INTO auth_usr.users (id, email, display_name, credits, onboarding_completed, onboarding_step)
      VALUES ($1, $2, $3, 0, false, 0)
    `, [testUserId, testEmail, '测试创作者']);

    // 执行两步式入驻提交
    const submitResult = await submitOnboardingPreferences({
      userId: testUserId,
      answers: {
        occupation: 'media_culture',
        purpose: 'film_video',
        customText: 'AI 概念微电影探索',
      },
      displayName: '新锐导演极光',
    });

    assert.ok(submitResult.profile, '提交后应返回用户档案');
    assert.equal(submitResult.profile.onboarding_completed, true, '档案 onboarding_completed 应为 true');
    assert.equal(submitResult.profile.onboarding_step, 2, '档案 onboarding_step 应为 2');
    assert.equal(submitResult.profile.occupation_code, 'media_culture', '档案 occupation_code 应为 media_culture');
    assert.equal(submitResult.profile.occupation, '影视传媒', '档案 occupation 应为 影视传媒');
    assert.deepEqual(submitResult.profile.purpose_codes, ['film_video'], '档案 purpose_codes 应为 [film_video]');
    assert.equal(submitResult.profile.display_name, '新锐导演极光', '档案 display_name 应成功更新');

    // 检查数据库实际落库数据
    const userInDb = await queryOne(`
      SELECT occupation_code, occupation, purpose_codes, onboarding_completed, onboarding_step,
             onboarded_at, onboarding_answers_json, credits
      FROM auth_usr.users WHERE id = $1
    `, [testUserId]);

    assert.ok(userInDb, '数据库中应查到该用户');
    assert.equal(userInDb.onboarding_completed, true);
    assert.equal(userInDb.onboarding_step, 2);
    assert.ok(userInDb.onboarded_at, '应记录 onboarded_at 完成时间戳');
    assert.equal(userInDb.occupation_code, 'media_culture');
    assert.deepEqual(userInDb.purpose_codes, ['film_video']);
    assert.ok(userInDb.onboarding_answers_json?.preference, '应将问卷答卷存入 JSONB');

    // 检查算力到账
    assert.ok(userInDb.credits >= 50, '完成新人引导应获得至少 50 算力');

    // 幂等性测试：再次提交不应重复发奖
    const repeatResult = await submitOnboardingPreferences({
      userId: testUserId,
      answers: {
        occupation: 'media_culture',
        purpose: 'film_video',
      },
    });
    assert.equal(repeatResult.rewardCredits, 0, '二次提交或重复提交 rewardCredits 应为 0');

    // 检查标签写入表
    const tagsInDb = await queryOne(`
      SELECT COUNT(*)::int as count FROM user_tags WHERE user_id = $1
    `, [testUserId]);
    assert.ok(tagsInDb.count >= 2, 'user_tags 应至少写入职业与目的标签');
  } finally {
    // 清理测试数据
    await execute('DELETE FROM user_tags WHERE user_id = $1', [testUserId]);
    await execute('DELETE FROM ops_bill.credit_ledger_v2 WHERE user_id = $1', [testUserId]).catch(() => {});
    await execute('DELETE FROM credit_ledger WHERE user_id = $1', [testUserId]).catch(() => {});
    await execute('DELETE FROM auth_usr.users WHERE id = $1', [testUserId]);
    await execute('DELETE FROM auth_usr.user_id_allocations WHERE user_id = $1', [testUserId]);
  }
});

test('新人引导 3.0：跳过流程验证', async () => {
  const testUserId = String(89000000 + Math.floor(Math.random() * 900000));
  try {
    await execute('INSERT INTO auth_usr.user_id_allocations (user_id, digit_length) VALUES ($1, $2)', [testUserId, testUserId.length]);
    await execute(`
      INSERT INTO auth_usr.users (id, email, display_name, credits, onboarding_completed, onboarding_step)
      VALUES ($1, $2, $3, 0, false, 0)
    `, [testUserId, `${testUserId}@example.com`, '跳过测试用户']);

    const skipResult = await submitOnboardingSkip({ userId: testUserId });
    assert.equal(skipResult.skipped, true);
    assert.equal(skipResult.rewardCredits, 0);

    const userInDb = await queryOne('SELECT onboarding_completed, onboarding_step FROM auth_usr.users WHERE id = $1', [testUserId]);
    assert.equal(userInDb.onboarding_completed, true);
    assert.equal(userInDb.onboarding_step, 2);
  } finally {
    await execute('DELETE FROM auth_usr.users WHERE id = $1', [testUserId]);
    await execute('DELETE FROM auth_usr.user_id_allocations WHERE user_id = $1', [testUserId]);
  }
});
