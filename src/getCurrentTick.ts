const currentDateTick = Date.now();

export const getCurrentTick = () =>
  'performance' in globalThis
    ? performance.now()
    : Date.now() - currentDateTick;
