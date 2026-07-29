import 'server-only';

import { AsyncLocalStorage } from 'node:async_hooks';

const systemDataAccess = new AsyncLocalStorage<boolean>();

export function hasSystemDataAccess() {
  return systemDataAccess.getStore() === true;
}

export function withSystemDataAccess<T>(callback: () => Promise<T>) {
  return systemDataAccess.run(true, callback);
}
