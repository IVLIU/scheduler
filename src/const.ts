import type { IOptions } from './type';

// lanes
export const NoLanes = 0b0000000000000000000000000000000;
export const NoLane = 0b0000000000000000000000000000000;
export const SyncLane = 0b0000000000000000000000000000001;
export const NormalLane = 0b0000000000000000000000000000010;
export const TransitionLane = 0b0000000000000000000000000000100;
// Max 31 bit integer. The max integer size in V8 for 32-bit systems.
// Math.pow(2, 30) - 1
export const maxSigned31BitInt = 0b111111111111111111111111111111;

// timeout
export const SYNC_PRIORITY_TIMEOUT = -1; // 立即过期以获得最高优先级
export const NORMAL_PRIORITY_TIMEOUT = 50;
export const TRANSITION_PRIORITY_TIMEOUT = maxSigned31BitInt;

// env
export const __DEV__ = process.env.NODE_ENV === 'development';

export const defaultOptions = {
  sync: false,
  transition: false,
  signal: null,
  effect: null,
  debugger: null,
} as IOptions;
