export const isInputPending = (): boolean =>
  'scheduling' in navigator &&
  // @ts-ignore
  typeof navigator.scheduling.isInputPending === 'function'
    ? // @ts-ignore
      navigator.scheduling.isInputPending({ includeContinuous: true }) // 开启检测连续事件，如mousemove、pointermove
    : false;
