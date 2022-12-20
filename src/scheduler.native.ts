import { getCurrentTick } from './getCurrentTick';
import { warn } from './warn';
import { __DEV__ } from './const';
import { IScheduler, ITask, experimental_IOptions } from './type';

export const postTask = (
  callback: ITask['callback'],
  options: Partial<experimental_IOptions> = {
    sync: false,
    transition: false,
    signal: null,
    effect: null,
    delay: 0,
  },
) => {
  const scheduler = (globalThis as typeof globalThis & {
    scheduler: IScheduler;
  }).scheduler;
  scheduler.postTask(
    () => {
      try {
        const aborted = !!(options.signal && options.signal.aborted);
        if (!aborted) {
          const callTick = getCurrentTick();
          callback(callTick);
          if (__DEV__) {
            if (getCurrentTick() - callTick > 50) {
              warn();
            }
          }
        }
        if (options.effect) {
          options.effect(aborted);
        }
      } catch (error) {
        console.error(error);
      }
    },
    {
      priority: options.sync
        ? 'user-blocking'
        : options.transition
        ? 'background'
        : 'user-visible',
      signal: options.signal || undefined,
      delay:
        (options.delay &&
          typeof options.delay === 'number' &&
          options.delay > 0 &&
          options.delay) ||
        0,
    },
  );
};

export const postSyncTask = (
  callback: ITask['callback'],
  options: Partial<Omit<experimental_IOptions, 'sync' | 'transition'>> = {
    signal: null,
    effect: null,
  },
) => postTask(callback, { ...options, sync: true });

export const postTransitionTask = (
  callback: ITask['callback'],
  options: Partial<Omit<experimental_IOptions, 'sync'>> = {
    transition: true,
    signal: null,
    effect: null,
  },
) => postTask(callback, { transition: true, ...options });
