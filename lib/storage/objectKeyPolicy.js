export function assertCanvasUploadObjectKey(objectKey, userId) {
  const key = String(objectKey || '');
  const safeUserId = String(userId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const parts = key.split('/');
  const filename = parts[3] || '';

  if (
    !safeUserId ||
    parts.length !== 4 ||
    parts[0] !== 'uploads' ||
    parts[1] !== safeUserId ||
    parts[2] !== 'canvas' ||
    !/^[a-f0-9]{64}-[a-f0-9]{64}\.bin$/.test(filename)
  ) {
    throw Object.assign(new Error('Canvas 上传对象键无效或不属于当前用户'), { code: 'STORAGE_OBJECT_KEY_INVALID' });
  }

  return key;
}
