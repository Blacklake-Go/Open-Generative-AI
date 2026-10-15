import 'server-only';

import { getModelControlAuditSnapshot as readSnapshot } from '../repositories/modelControlAudit.js';

export async function getModelControlAuditSnapshot(action, body) {
  return readSnapshot(action, body);
}
