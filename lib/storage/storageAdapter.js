import 'server-only';

/**
 * Provider adapter contract. Cloud-specific implementations must keep all SDK
 * details behind this surface so application services stay provider-neutral.
 */
export class StorageAdapter {
  constructor(provider) {
    this.provider = provider;
  }

  notImplemented(operation) {
    throw Object.assign(new Error(`${this.provider} adapter 未实现 ${operation}`), { code: 'STORAGE_ADAPTER_NOT_IMPLEMENTED' });
  }

  upload(args) { return this.notImplemented('upload', args); }
  multipartUpload(args) { return this.notImplemented('multipartUpload', args); }
  download(args) { return this.notImplemented('download', args); }
  downloadStream(args) { return this.notImplemented('downloadStream', args); }
  delete(args) { return this.notImplemented('delete', args); }
  exists(args) { return this.notImplemented('exists', args); }
  getMetadata(args) { return this.notImplemented('getMetadata', args); }
  getUrl(args) { return this.notImplemented('getUrl', args); }
  getSignedUrl(args) { return this.notImplemented('getSignedUrl', args); }
  copy(args) { return this.notImplemented('copy', args); }
  move(args) { return this.notImplemented('move', args); }
}
