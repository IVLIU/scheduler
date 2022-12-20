export const scheduleInWorker = () =>
  globalThis.constructor.name === 'DedicatedWorkerGlobalScope';
