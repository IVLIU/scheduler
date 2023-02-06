import type { IScheduler } from './type';

export const createDispatcher = (handler: () => void) => {
  const self = globalThis as typeof globalThis & { scheduler: IScheduler };
  if ('scheduler' in self && typeof self.scheduler.postTask === 'function') {
    return (options: Partial<Parameters<IScheduler['postTask']>[1]>) =>
      self.scheduler.postTask(() => handler(), options);
  } else if ('MessageChannel' in self && typeof MessageChannel === 'function') {
    const mc = new MessageChannel();
    mc.port2.onmessage = () => handler();
    return () => mc.port1.postMessage(null);
  } else if ('setImmediate' in self && typeof setImmediate === 'function') {
    return () => setImmediate(() => handler());
  } else {
    return () => setTimeout(() => handler(), 0);
  }
};
