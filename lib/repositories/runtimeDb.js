import {
  query as read,
  queryOne as readOne,
  queryMany as readMany,
  execute as write,
  withTransaction as runTransaction,
  nowIso as now,
  randomId,
} from '../db/index.js';

export { read, readOne, readMany, write, runTransaction, runTransaction as withTransaction, now, randomId };

// Services use this adapter when a transaction is supplied. The service layer
// therefore depends on a data capability, not on repository SQL primitives.
export function dataClient(transaction = null) {
  return {
    read: transaction?.query || read,
    readOne: transaction?.queryOne || readOne,
    readMany: transaction?.queryMany || readMany,
    write: transaction?.execute || write,
  };
}
