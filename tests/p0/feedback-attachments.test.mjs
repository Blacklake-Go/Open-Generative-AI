import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FEEDBACK_ATTACHMENT_MAX_FILES,
  FEEDBACK_ATTACHMENT_MAX_TOTAL_BYTES,
  getFeedbackAttachmentKind,
  getFeedbackAttachmentStorageType,
  normalizeGithubUrl,
  validateFeedbackAttachments,
} from '../../lib/feedback/attachments.js';

function file(name, size, type = '') {
  return { name, size, type };
}

test('允许的图片、视频、音频与文档按类型映射到存储前缀', () => {
  assert.equal(getFeedbackAttachmentKind('shot.PNG', 'image/png'), 'image');
  assert.equal(getFeedbackAttachmentKind('demo.mov', ''), 'video');
  assert.equal(getFeedbackAttachmentKind('voice.m4a', ''), 'audio');
  assert.equal(getFeedbackAttachmentKind('trace.log', ''), 'file');
  assert.equal(getFeedbackAttachmentStorageType('spec.pdf', ''), 'document');
  assert.equal(getFeedbackAttachmentStorageType('trace.log', ''), 'other');
});

test('附件数量、单文件与总量都受 30MB 上限约束', () => {
  const five = Array.from({ length: FEEDBACK_ATTACHMENT_MAX_FILES }, (_, index) =>
    file(`shot-${index}.png`, 1024, 'image/png'),
  );
  const ok = validateFeedbackAttachments(five);
  assert.equal(ok.error, undefined);
  assert.equal(ok.items.length, FEEDBACK_ATTACHMENT_MAX_FILES);

  const tooMany = [...five, file('extra.png', 1024, 'image/png')];
  assert.match(validateFeedbackAttachments(tooMany).error, /最多上传/);

  const oversized = validateFeedbackAttachments([
    file('big.zip', FEEDBACK_ATTACHMENT_MAX_TOTAL_BYTES + 1),
  ]);
  assert.match(oversized.error, /不能超过/);

  const total = validateFeedbackAttachments([
    file('a.zip', 16 * 1024 * 1024),
    file('b.zip', 15 * 1024 * 1024),
  ]);
  assert.match(total.error, /总大小/);
});

test('拒绝可执行扩展名与不可读的空文件', () => {
  assert.match(validateFeedbackAttachments([file('payload.svg', 100)]).error, /不支持/);
  assert.match(validateFeedbackAttachments([file('page.html', 100)]).error, /不支持/);
  assert.match(validateFeedbackAttachments([file('empty.png', 0)]).error, /空附件/);
});

test('GitHub 链接只接受具体仓库或 Issue，并去掉末尾斜杠', () => {
  const repo = normalizeGithubUrl('https://github.com/Blacklake-Go/Open-Generative-AI/');
  assert.equal(repo.url, 'https://github.com/Blacklake-Go/Open-Generative-AI');

  const issue = normalizeGithubUrl('https://github.com/Blacklake-Go/Open-Generative-AI/issues/12');
  assert.equal(issue.url, 'https://github.com/Blacklake-Go/Open-Generative-AI/issues/12');
  assert.equal(normalizeGithubUrl('').url, null);

  assert.match(normalizeGithubUrl('https://example.com/a/b').error, /github\.com/);
  assert.match(normalizeGithubUrl('javascript:alert(1)').error, /http/);
  assert.match(normalizeGithubUrl('https://github.com/Blacklake-Go').error, /具体仓库/);
});
