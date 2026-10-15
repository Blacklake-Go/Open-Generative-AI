const databaseUrl = String(process.env.DATABASE_URL || '').trim();
if (!databaseUrl) throw new Error('DATABASE_URL is required for the worker cycle test.');
if (!['postgres:', 'postgresql:'].includes(new URL(databaseUrl).protocol)) {
  throw new Error('DATABASE_URL must use the postgres:// or postgresql:// scheme.');
}
const { runGenerationWorkerOnce } = await import('../lib/services/taskWorker.js');

const res = await runGenerationWorkerOnce();
console.log('WORKER_CYCLE_SUCCESS:', JSON.stringify(res));
