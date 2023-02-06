import { createDispatcher } from './createDispatcher';
import { runMicroTaskCallback } from './runMicroTaskCallback';
import { scheduleInWorker } from './scheduleInWorker';
import { getCurrentTick } from './getCurrentTick';
import { isInputPending } from './isInputPending';
import { warn } from './warn';
import {
  NoLanes,
  NoLane,
  SyncLane,
  NormalLane,
  TransitionLane,
  SYNC_PRIORITY_TIMEOUT,
  NORMAL_PRIORITY_TIMEOUT,
  TRANSITION_PRIORITY_TIMEOUT,
  __DEV__,
} from './const';
import { ITask, IOptions } from './type';

const _yieldInterval = 5;
let _pendingTaskQueue: ITask | null = null;
let _taskQueue: ITask | null = null;
let _workInProgressTaskQueue: ITask | null = null;
let _firstPendingLaneTask: ITask | null = null;
let _remainingLanes = NoLanes;
let _urgentScheduleLane = NoLane;
let _scheduleLane = NoLane;
let _pendingLane = NoLane;
let _index = 0;
let _needSchedule = false;
let _isScheduling = false;

export const workLoop = () => {
  const prevScheduleLane = _scheduleLane;
  try {
    _urgentScheduleLane = _remainingLanes & -_remainingLanes;
    _scheduleLane = _urgentScheduleLane;
    _isScheduling = true;
    if (_scheduleLane === NoLane) {
      return;
    }
    let tick = getCurrentTick();
    const frameDeadTick = tick + _yieldInterval;
    let task: ITask | null = null;
    do {
      task = getFirstWorkInProgressTask(tick);
      if (task === null) {
        if (
          (requestWorkInProgressTaskQueue(tick),
          getFirstWorkInProgressTask(tick) === null)
        ) {
          break;
        }
        continue;
      }
      const currentTick = getCurrentTick();
      if ((_scheduleLane & _urgentScheduleLane) === NoLane && !task.expired) {
        _scheduleLane = _urgentScheduleLane;
        continue;
      }
      popWorkInProgressTask();
      performTask(task, (tick = currentTick));
      // ? worker中不做切片处理
    } while (
      scheduleInWorker() ? true : !isInputPending() && tick < frameDeadTick
    );
    if (task === null) {
      _remainingLanes &= ~_scheduleLane;
    }
    if (_taskQueue !== null) {
      schedule();
    }
  } finally {
    _scheduleLane = prevScheduleLane;
    _isScheduling = false;
  }
};

export const dispatch = createDispatcher(workLoop);

export const postTask = (
  callback: ITask['callback'],
  options: Partial<IOptions> = {
    sync: false,
    transition: false,
    signal: null,
    effect: null,
    debugger: null,
  },
) => {
  const creationTick = getCurrentTick();
  const task = {
    callback,
    creationTick,
    signal: options.signal,
    effect: options.effect,
    debugger: options.debugger,
    expired: false,
    index: ++_index,
  } as ITask;
  if (options.sync) {
    task.lane = ((_remainingLanes |= SyncLane), SyncLane);
    task.expirationTick = creationTick + SYNC_PRIORITY_TIMEOUT;
    task.expired = true;
  } else if (options.transition) {
    task.lane = ((_remainingLanes |= TransitionLane), TransitionLane);
    task.expirationTick =
      typeof options.transition === 'object' && options.transition.timeout >= 0
        ? creationTick + options.transition.timeout
        : TRANSITION_PRIORITY_TIMEOUT;
  } else {
    task.lane = ((_remainingLanes |= NormalLane), NormalLane);
    task.expirationTick = creationTick + NORMAL_PRIORITY_TIMEOUT;
  }
  if ((_urgentScheduleLane & (_remainingLanes & -_remainingLanes)) === NoLane) {
    _urgentScheduleLane = _remainingLanes & -_remainingLanes;
  }
  pushPendingTask(task);
  if (_isScheduling) {
    pushTask();
  }
  if (!_needSchedule) {
    schedule();
    _needSchedule = true;
  }
  return _index;
};

export const postSyncTask = (
  callback: ITask['callback'],
  options: Partial<Omit<IOptions, 'sync' | 'transition'>> = {
    signal: null,
    effect: null,
  },
) => postTask(callback, { ...options, sync: true });

export const postTransitionTask = (
  callback: ITask['callback'],
  options: Partial<Omit<IOptions, 'sync'>> = {
    transition: true,
    signal: null,
    effect: null,
  },
) => postTask(callback, { transition: true, ...options });

export const schedule = () =>
  runMicroTaskCallback(() => {
    pushTask();
    if (_taskQueue) {
      if ((_remainingLanes & -_remainingLanes) === NoLane) {
        const lastTask = _taskQueue;
        const firstTask = lastTask.next;
        if (!firstTask.nextLaneTask) {
          _remainingLanes |= firstTask.lane;
        } else {
          let task = firstTask;
          do {
            _remainingLanes |= task.lane;
            task = task.nextLaneTask;
          } while (task !== firstTask);
        }
      }
      const lane = _remainingLanes & -_remainingLanes;
      dispatch(
        {
          priority: (lane & SyncLane) === SyncLane
            ? 'user-blocking'
            : (lane & TransitionLane) === TransitionLane
            ? 'background'
            : 'user-visible',
        }
      );
    }
    _needSchedule = false;
  });

export const pushPendingTask = (task: ITask) => {
  const taskLane = task.lane;
  if (_pendingTaskQueue === null) {
    _pendingTaskQueue = task.prev = task.next = task;
    _pendingLane = taskLane;
    return;
  }
  const lastPendingTask = _pendingTaskQueue;
  const firstPendingTask = lastPendingTask.next;
  task.next = firstPendingTask;
  firstPendingTask.prev = task;
  lastPendingTask.next = task;
  task.prev = lastPendingTask;
  _pendingTaskQueue = task;
  if ((taskLane & _pendingLane) === NoLane) {
    const lastPendingTask = _pendingTaskQueue;
    const firstPendingTask = lastPendingTask.next;
    if (_firstPendingLaneTask === null) {
      _firstPendingLaneTask = firstPendingTask;
    }
    _firstPendingLaneTask.nextLaneTask = lastPendingTask;
    lastPendingTask.prevLaneTask = _firstPendingLaneTask;
    lastPendingTask.nextLaneTask = firstPendingTask;
    firstPendingTask.prevLaneTask = lastPendingTask;
    _firstPendingLaneTask = lastPendingTask;
    _pendingLane = taskLane;
  }
};

export const pushTask = () => {
  if (_pendingTaskQueue === null) {
    return;
  }
  if (_taskQueue === null) {
    _taskQueue = _pendingTaskQueue;
    _pendingTaskQueue = null;
    _firstPendingLaneTask = null;
    return;
  }
  const lastTask = _taskQueue;
  const firstTask = lastTask.next;
  const lastPendingTask = _pendingTaskQueue;
  const firstPendingTask = lastPendingTask.next;
  if (_firstPendingLaneTask === null) {
    firstPendingTask.nextLaneTask = firstTask;
    firstTask.prevLaneTask = firstPendingTask;
  } else {
    _firstPendingLaneTask.nextLaneTask = firstTask;
    firstPendingTask.prevLaneTask = _firstPendingLaneTask;
  }
  firstTask.nextLaneTask = firstPendingTask;
  firstPendingTask.prevLaneTask = firstTask;
  lastTask.next = firstPendingTask;
  firstPendingTask.prev = lastTask;
  lastPendingTask.next = firstTask;
  firstTask.prev = lastPendingTask;
  _taskQueue = lastPendingTask;
  _pendingTaskQueue = null;
  _firstPendingLaneTask = null;
};

export const getFirstTask = () => {
  if (_taskQueue === null) {
    return null;
  }
  const lastTask = _taskQueue;
  const firstTask = lastTask.next;
  return firstTask;
};

export const requestWorkInProgressTaskQueue = (tick: number) => {
  const firstTask = getFirstTask();
  let task = firstTask;
  let expiredTaskQueue: ITask | null = null;
  let workInProgressTaskQueue: ITask | null = null;
  _workInProgressTaskQueue = null;
  do {
    if (!task) {
      break;
    }
    if (task.expired || tick > task.expirationTick) {
      expiredTaskQueue = task.prev;
      break;
    }
    if (
      workInProgressTaskQueue === null &&
      (task.lane & _scheduleLane) === _scheduleLane
    ) {
      workInProgressTaskQueue = task.prev;
    }
    task = task.nextLaneTask;
  } while (task !== firstTask);
  if (
    (_workInProgressTaskQueue = expiredTaskQueue || workInProgressTaskQueue)
  ) {
    _scheduleLane = _workInProgressTaskQueue.next.lane;
  }
};

export const popWorkInProgressTask = () => {
  if (_workInProgressTaskQueue === null) {
    return;
  }
  const lastWorkInProgressTask = _workInProgressTaskQueue;
  const firstWorkInProgressTask = lastWorkInProgressTask.next;
  if (lastWorkInProgressTask === firstWorkInProgressTask) {
    _taskQueue = _workInProgressTaskQueue = null;
  } else {
    const nextFirstWorkInProgressTask = firstWorkInProgressTask.next;
    const prevLaneTask = firstWorkInProgressTask.prevLaneTask;
    const nextLaneTask = firstWorkInProgressTask.nextLaneTask;
    if (prevLaneTask && nextLaneTask) {
      if (
        nextFirstWorkInProgressTask === firstWorkInProgressTask.nextLaneTask
      ) {
        prevLaneTask.nextLaneTask = nextFirstWorkInProgressTask;
        nextFirstWorkInProgressTask.prevLaneTask = prevLaneTask;
      } else {
        nextFirstWorkInProgressTask.prevLaneTask = prevLaneTask;
        nextFirstWorkInProgressTask.nextLaneTask = nextLaneTask;
        prevLaneTask.nextLaneTask = nextFirstWorkInProgressTask;
        nextLaneTask.prevLaneTask = nextFirstWorkInProgressTask;
      }
    }
    lastWorkInProgressTask.next = nextFirstWorkInProgressTask;
    nextFirstWorkInProgressTask.prev = lastWorkInProgressTask;
  }
  if (firstWorkInProgressTask === _taskQueue) {
    _taskQueue = firstWorkInProgressTask.prev;
  }
  // @ts-ignore
  firstWorkInProgressTask.prev = null;
  // @ts-ignore
  firstWorkInProgressTask.next = null;
  // @ts-ignore
  firstWorkInProgressTask.prevLaneTask = null;
  // @ts-ignore
  firstWorkInProgressTask.nextLaneTask = null;
  return firstWorkInProgressTask;
};

export const getFirstWorkInProgressTask = (tick: number) => {
  if (_workInProgressTaskQueue === null) {
    return null;
  }
  const lastWorkInProgressTask = _workInProgressTaskQueue;
  const firstWorkInProgressTask = lastWorkInProgressTask.next;
  return (firstWorkInProgressTask.lane & _scheduleLane) === _scheduleLane
    ? (!firstWorkInProgressTask.expired &&
        (firstWorkInProgressTask.expired =
          firstWorkInProgressTask.expirationTick < tick),
      firstWorkInProgressTask)
    : null;
};

export const performTask = (task: ITask, callTick: number) => {
  try {
    const aborted = !!(task.signal && task.signal.aborted);
    if (!aborted) {
      task.callback(callTick);
      if (__DEV__) {
        if (getCurrentTick() - callTick > 50) {
          warn();
        }
      }
    }
    if (__DEV__ && task.debugger) {
      task.debugger(Object.freeze(task));
    }
    if (task.effect) {
      task.effect(aborted);
    }
  } catch (error) {
    console.error(error);
  }
};
