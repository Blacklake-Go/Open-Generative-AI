import 'server-only';

/**
 * @deprecated Compatibility shim for older imports. New code must use
 * `lib/storage/storageService.js` or `lib/storage/index.js`. Provider SDKs and
 * credentials are intentionally not exposed from this module.
 */
import { getStorageService } from './storageService.js';

export async function getConfiguredObjectStorage() {
  return getStorageService();
}

export async function getObjectStorages() {
  const storage = await getStorageService();
  return { active: storage };
}

export async function getObjectStorageForRegion() {
  return getStorageService();
}
