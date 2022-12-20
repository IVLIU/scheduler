export const createDispatcher = (handler: () => void) => {
  if (typeof MessageChannel === 'function') {
    const mc = new MessageChannel();
    mc.port2.onmessage = () => handler();
    return () => mc.port1.postMessage(null);
  } else if (typeof setImmediate === 'function') {
    return () => setImmediate(() => handler());
  } else {
    return () => setTimeout(() => handler(), 0);
  }
};
