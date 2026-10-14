export async function ensureCanvasResultAsset({
  userId,
  creationId,
  getAssetByCreationId,
  getAssetDownload,
  findCreationById,
  syncCreationToAsset,
}) {
  let asset = await getAssetByCreationId(userId, creationId);
  if (asset) {
    const download = await getAssetDownload(userId, asset.id);
    if (download?.objectKey && !download.deletedAt) return { asset, creation: null };
    asset = null;
  }

  const creation = await findCreationById(creationId);
  if (creation?.user_id !== userId || creation.status !== 'succeeded') {
    return { asset: null, creation };
  }

  await syncCreationToAsset(creation);
  asset = await getAssetByCreationId(userId, creationId);
  if (asset) {
    const download = await getAssetDownload(userId, asset.id);
    if (!download?.objectKey || download.deletedAt) asset = null;
  }
  return { asset, creation };
}
