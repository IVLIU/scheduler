export const runMicroTaskCallback = (callback: VoidFunction) =>
  'queueMicrotask' in globalThis
    ? queueMicrotask(callback)
    : 'Promise' in globalThis
    ? Promise.resolve().then(callback)
    : setTimeout(callback, 0);
