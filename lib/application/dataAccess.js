import 'server-only';

// Application-facing data boundary for route components. Keeping repository and
// database wiring here prevents UI/API modules from bypassing service seams.
export {
  query,
  queryOne,
  queryMany,
  execute,
  withTransaction,
} from '../db/index.js';

export * from '../repositories/auth.js';
export {
  findUserByIdOrNumber,
  updateUserPrivacySettings,
} from '../repositories/users.js';
export * from '../repositories/billing.js';
export * from '../repositories/aiCatalog.js';
export * from '../repositories/providers.js';
export * from '../repositories/notifications.js';
