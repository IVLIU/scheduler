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
  defaultOptions,
} from './const';
import { ITask, IOptions } from './type';

const _yieldInterval = 5;
let _pendingTaskQueue: ITask | null = null;
let _taskQueue: ITask | null = null;
let _workInProgressTaskQueue: ITask | null = null;
let _firstPendingLaneTask: ITask | null = null;
let _firstSyncLaneTask: ITask | null = null;
let _firstNormalLaneTask: ITask | null = null;
let _firstTransitionLaneTask: ITask | null = null;
let _currentSyncLaneTask: ITask | null = null;
let _currentNormalLaneTask: ITask | null = null;
let _currentTransitionLaneTask: ITask | null = null;
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
      if((_scheduleLane & SyncLane) === SyncLane) {
        _firstSyncLaneTask = _currentSyncLaneTask = null;
      }
      if((_scheduleLane & NormalLane) === NormalLane) {
        _firstNormalLaneTask = _currentNormalLaneTask = null;
      }
      if((_scheduleLane & TransitionLane) === TransitionLane) {
        _firstTransitionLaneTask = _currentTransitionLaneTask = null;
      }
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
  options: Partial<IOptions> = defaultOptions,
) => {
  options = options === defaultOptions ? defaultOptions : { ...defaultOptions, ...options };
  const creationTick = getCurrentTick();
  const task = {
    callback,
    creationTick,
    executionTick: creationTick,
    signal: options.signal,
    effect: options.effect,
    debugger: options.debugger,
    expired: false,
    index: ++_index,
  } as ITask;
  if (options.sync) {
    if(_firstSyncLaneTask === null) {
      _firstSyncLaneTask = _currentSyncLaneTask = task;
    }
    task.lane = ((_remainingLanes |= SyncLane), SyncLane);
    task.expirationTick = creationTick + SYNC_PRIORITY_TIMEOUT;
    task.expired = true;
  } else if (options.transition) {
    if(_firstTransitionLaneTask === null) {
      _firstTransitionLaneTask = _currentTransitionLaneTask = task;
    }
    task.lane = ((_remainingLanes |= TransitionLane), TransitionLane);
    task.expirationTick = TRANSITION_PRIORITY_TIMEOUT;
    // ! 暂时放弃支持自定义过期时间，需要小顶堆来支持过期任务的正确执行
    // task.expirationTick =
    //   typeof options.transition === 'object' && options.transition.timeout >= 0
    //     ? creationTick + options.transition.timeout
    //     : TRANSITION_PRIORITY_TIMEOUT;
  } else {
    if(_firstNormalLaneTask === null) {
      _firstNormalLaneTask = _currentNormalLaneTask = task;
    }
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
    if(lastPendingTask !== _currentSyncLaneTask && (taskLane & SyncLane) === SyncLane) {
      const firstSyncLaneTask = _firstSyncLaneTask!;
      const currentSyncLaneTask = _currentSyncLaneTask!;
      currentSyncLaneTask.nextSameLaneTask = lastPendingTask;
      lastPendingTask.prevSameLaneTask = currentSyncLaneTask;
      lastPendingTask.nextSameLaneTask = firstSyncLaneTask;
      firstSyncLaneTask.prevSameLaneTask = lastPendingTask;
      _currentSyncLaneTask = lastPendingTask;
    }
    if(task !== _currentNormalLaneTask && (taskLane & NormalLane) === NormalLane) {
      const firstNormalLaneTask = _firstNormalLaneTask!;
      const currentNormalLaneTask = _currentNormalLaneTask!;
      currentNormalLaneTask.nextSameLaneTask = lastPendingTask
      lastPendingTask.prevSameLaneTask = currentNormalLaneTask;
      lastPendingTask.nextSameLaneTask = firstNormalLaneTask;
      firstNormalLaneTask.prevSameLaneTask = lastPendingTask;
      _currentNormalLaneTask = task;
    }
    if(task !== _currentTransitionLaneTask && (taskLane & TransitionLane) === TransitionLane) {
      const firstTransitionLaneTask = _firstTransitionLaneTask!;
      const currentTransitionLaneTask = _currentTransitionLaneTask!;
      currentTransitionLaneTask.nextSameLaneTask = lastPendingTask;
      lastPendingTask.prevSameLaneTask = currentTransitionLaneTask;
      lastPendingTask.nextSameLaneTask = firstTransitionLaneTask;
      firstTransitionLaneTask.prevSameLaneTask = lastPendingTask;
      _currentTransitionLaneTask = task;
    }
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
  _workInProgressTaskQueue = null;
  if(_firstTransitionLaneTask && (_firstTransitionLaneTask.expired || (_firstTransitionLaneTask.expired = _firstTransitionLaneTask.expirationTick < tick))) {
    _workInProgressTaskQueue = _firstTransitionLaneTask.prev;
  }
  if(_workInProgressTaskQueue === null && _firstNormalLaneTask && (_firstNormalLaneTask.expired || (_firstNormalLaneTask.expired = _firstNormalLaneTask.expirationTick < tick))) {
    _workInProgressTaskQueue = _firstNormalLaneTask.prev;
  }
  if(_workInProgressTaskQueue === null) {
    const currentQueue = (_firstSyncLaneTask || _firstNormalLaneTask || _firstTransitionLaneTask);
    if(currentQueue) {
      _workInProgressTaskQueue = currentQueue.prev;
    }
  }
  if(_workInProgressTaskQueue) {
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
    _taskQueue = _workInProgressTaskQueue = _firstSyncLaneTask = _firstNormalLaneTask = _firstTransitionLaneTask = _currentSyncLaneTask = _currentNormalLaneTask = _currentTransitionLaneTask = null;
  } else {
    const currentLane = firstWorkInProgressTask.lane;
    const nextFirstWorkInProgressTask = firstWorkInProgressTask.next;
    const prevSameLaneTask = firstWorkInProgressTask.prevSameLaneTask;
    const nextSameLaneTask = firstWorkInProgressTask.nextSameLaneTask;
    const prevLaneTask = firstWorkInProgressTask.prevLaneTask;
    const nextLaneTask = firstWorkInProgressTask.nextLaneTask;
    if(nextSameLaneTask && prevSameLaneTask) {
      if((nextFirstWorkInProgressTask.lane & firstWorkInProgressTask.lane) === NoLane) {
        prevSameLaneTask.nextSameLaneTask = nextSameLaneTask;
        nextSameLaneTask.prevSameLaneTask = prevSameLaneTask;
        if((currentLane & SyncLane) === SyncLane) {
          _firstSyncLaneTask = nextSameLaneTask;
        }
        if((currentLane & NormalLane) === NormalLane) {
          _firstNormalLaneTask = nextSameLaneTask;
        }
        if((currentLane & TransitionLane) === TransitionLane) {
          _firstTransitionLaneTask = nextSameLaneTask;
        }
      } else {
        nextFirstWorkInProgressTask.prevSameLaneTask = prevSameLaneTask;
        nextFirstWorkInProgressTask.nextSameLaneTask = nextSameLaneTask;
        prevLaneTask.nextSameLaneTask = nextFirstWorkInProgressTask;
        nextSameLaneTask.prevSameLaneTask = nextFirstWorkInProgressTask;
        if((currentLane & SyncLane) === SyncLane) {
          _firstSyncLaneTask = nextFirstWorkInProgressTask;
        }
        if((currentLane & NormalLane) === NormalLane) {
          _firstNormalLaneTask = nextFirstWorkInProgressTask;
        }
        if((currentLane & TransitionLane) === TransitionLane) {
          _firstTransitionLaneTask = nextFirstWorkInProgressTask;
        }
      }
    }
    if (prevLaneTask && nextLaneTask) {
      if (
        nextFirstWorkInProgressTask === nextLaneTask
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
  // @ts-ignore
  firstWorkInProgressTask.prevSameLaneTask = null;
  // @ts-ignore
  firstWorkInProgressTask.nextSameLaneTask = null;
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
