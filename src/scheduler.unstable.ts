import { createDispatcher } from './createDispatcher';
import { createMinHeap } from './minHeap';
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

const { push, pop, peek } = createMinHeap();
const _yieldInterval = 5;
let _pendingTaskQueue: ITask | null = null;
let _taskQueue: ITask | null = null;
let _workInProgressTaskQueue: ITask | null = null;
let _currentPendingLaneTask: ITask | null = null;
let _currentLaneTask: ITask | null = null;
let _firstPendingSyncLaneTask: ITask | null = null;
let _firstPendingNormalLaneTask: ITask | null = null;
let _firstPendingTransitionLaneTask: ITask | null = null;
let _firstSyncLaneTask: ITask | null = null;
let _firstNormalLaneTask: ITask | null = null;
let _firstTransitionLaneTask: ITask | null = null;
let _currentPendingSyncLaneTask: ITask | null = null;
let _currentPendingNormalLaneTask: ITask | null = null;
let _currentPendingTransitionLaneTask: ITask | null = null;
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
    } while (scheduleInWorker() || (!isInputPending() && tick < frameDeadTick));
    if (task === null) {
      if ((_scheduleLane & SyncLane) === SyncLane) {
        _firstSyncLaneTask = null;
      }
      if ((_scheduleLane & NormalLane) === NormalLane) {
        _firstNormalLaneTask = null;
      }
      if ((_scheduleLane & TransitionLane) === TransitionLane) {
        _firstTransitionLaneTask = null;
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
  options =
    options === defaultOptions ? options : { ...defaultOptions, ...options };
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
    if (_firstSyncLaneTask === null) {
      _firstSyncLaneTask = task;
    }
    task.lane = ((_remainingLanes |= SyncLane), SyncLane);
    task.expirationTick = creationTick + SYNC_PRIORITY_TIMEOUT;
    task.expired = true;
  } else if (options.transition) {
    const timeout =
      typeof options.transition === 'object' && options.transition.timeout >= 0
        ? creationTick + options.transition.timeout
        : TRANSITION_PRIORITY_TIMEOUT;
    if (timeout < TRANSITION_PRIORITY_TIMEOUT) {
      push(task);
    }
    if (_firstTransitionLaneTask === null) {
      _firstTransitionLaneTask = task;
    }
    task.lane = ((_remainingLanes |= TransitionLane), TransitionLane);
    task.expirationTick = timeout;
  } else {
    if (_firstNormalLaneTask === null) {
      _firstNormalLaneTask = task;
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
            if (!task) {
              break;
            }
            _remainingLanes |= task.lane;
            task = task.nextLaneTask;
          } while (task !== firstTask);
        }
      }
      const lane = _remainingLanes & -_remainingLanes;
      dispatch({
        priority:
          (lane & SyncLane) === SyncLane
            ? 'user-blocking'
            : (lane & TransitionLane) === TransitionLane
            ? 'background'
            : 'user-visible',
      });
    }
    _needSchedule = false;
  });

export const pushPendingTask = (task: ITask) => {
  const taskLane = task.lane;
  if ((taskLane & SyncLane) === SyncLane) {
    if (_firstPendingSyncLaneTask === null) {
      _firstPendingSyncLaneTask = _currentPendingSyncLaneTask = task;
    }
  }
  if ((taskLane & NormalLane) === NormalLane) {
    if (_firstPendingNormalLaneTask === null) {
      _firstPendingNormalLaneTask = _currentPendingNormalLaneTask = task;
    }
  }
  if ((taskLane & TransitionLane) === TransitionLane) {
    if (_firstPendingTransitionLaneTask) {
      _firstPendingTransitionLaneTask = _currentPendingTransitionLaneTask = task;
    }
  }
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
    if (_currentPendingLaneTask === null) {
      _currentPendingLaneTask = firstPendingTask;
    }
    _currentPendingLaneTask.nextLaneTask = task;
    task.prevLaneTask = _currentPendingLaneTask;
    task.nextLaneTask = firstPendingTask;
    firstPendingTask.prevLaneTask = task;
    if ((taskLane & SyncLane) === SyncLane) {
      if (_firstPendingSyncLaneTask && _firstPendingSyncLaneTask !== task) {
        if (_currentPendingSyncLaneTask === null) {
          _currentPendingSyncLaneTask = _firstPendingSyncLaneTask;
        }
        _currentPendingSyncLaneTask.nextSameLaneTask = task;
        task.prevSameLaneTask = _currentPendingSyncLaneTask;
        task.nextSameLaneTask = _firstPendingSyncLaneTask;
        _firstPendingSyncLaneTask.prevSameLaneTask = task;
      }
      _currentPendingSyncLaneTask = task;
    }
    if ((taskLane & NormalLane) === NormalLane) {
      if (_firstPendingNormalLaneTask && _firstPendingNormalLaneTask !== task) {
        if (_currentPendingNormalLaneTask === null) {
          _currentPendingNormalLaneTask = _firstPendingNormalLaneTask;
        }
        _currentPendingNormalLaneTask.nextSameLaneTask = task;
        task.prevSameLaneTask = _currentPendingNormalLaneTask;
        task.nextSameLaneTask = _firstPendingNormalLaneTask;
        _firstPendingNormalLaneTask.prevSameLaneTask = task;
      }
      _currentPendingNormalLaneTask = task;
    }
    if ((taskLane & TransitionLane) === TransitionLane) {
      if (
        _firstPendingTransitionLaneTask &&
        _firstPendingTransitionLaneTask !== task
      ) {
        if (_currentPendingTransitionLaneTask === null) {
          _currentPendingTransitionLaneTask = _firstPendingTransitionLaneTask;
        }
        _currentPendingTransitionLaneTask.nextSameLaneTask = task;
        task.prevSameLaneTask = _currentPendingTransitionLaneTask;
        task.nextSameLaneTask = _firstPendingTransitionLaneTask;
        _firstPendingTransitionLaneTask.prevSameLaneTask = task;
      }
      _currentPendingTransitionLaneTask = task;
    }
    _currentPendingLaneTask = lastPendingTask;
    _pendingLane = taskLane;
  }
};

export const pushTask = () => {
  if (_pendingTaskQueue === null) {
    return;
  }
  if (_taskQueue === null) {
    _taskQueue = _pendingTaskQueue;
    _currentLaneTask = _currentPendingLaneTask;
    _currentSyncLaneTask = _currentPendingSyncLaneTask;
    _currentNormalLaneTask = _currentPendingNormalLaneTask;
    _currentTransitionLaneTask = _currentPendingTransitionLaneTask;
    _pendingTaskQueue = null;
    _currentPendingLaneTask = null;
    _firstPendingSyncLaneTask = _firstPendingNormalLaneTask = _firstPendingTransitionLaneTask = null;
    _currentPendingSyncLaneTask = _currentPendingNormalLaneTask = _currentPendingTransitionLaneTask = null;
    return;
  }
  const lastTask = _taskQueue;
  const firstTask = lastTask.next;
  const lastPendingTask = _pendingTaskQueue;
  const firstPendingTask = lastPendingTask.next;
  lastTask.next = firstPendingTask;
  firstPendingTask.prev = lastTask;
  lastPendingTask.next = firstTask;
  firstTask.prev = lastPendingTask;
  if (_currentPendingLaneTask) {
    if (_currentLaneTask) {
      _currentLaneTask.nextLaneTask = firstPendingTask;
      firstPendingTask.prevLaneTask = _currentLaneTask;
    } else {
      firstTask.nextLaneTask = firstPendingTask;
      firstPendingTask.prevLaneTask = firstTask;
    }
    _currentPendingLaneTask.nextLaneTask = firstTask;
    firstTask.prevLaneTask = _currentPendingLaneTask;
    _currentLaneTask = _currentPendingLaneTask;
  } else {
    if (_currentLaneTask) {
      _currentLaneTask.nextLaneTask = firstPendingTask;
      firstPendingTask.prevLaneTask = _currentLaneTask;
      firstPendingTask.nextLaneTask = firstTask;
      firstTask.prevLaneTask = firstPendingTask;
    } else {
      firstTask.nextLaneTask = firstPendingTask;
      firstTask.prevLaneTask = firstPendingTask;
      firstPendingTask.nextLaneTask = firstTask;
      firstPendingTask.prevLaneTask = firstTask;
    }
    _currentLaneTask = firstPendingTask;
  }
  if (_currentPendingSyncLaneTask && _currentSyncLaneTask) {
    const firstPendingSyncLaneTask = _firstPendingSyncLaneTask!;
    const firstSyncLaneTask = _firstSyncLaneTask!;
    _currentPendingSyncLaneTask.nextSameLaneTask = firstSyncLaneTask;
    firstSyncLaneTask.prevSameLaneTask = _currentPendingSyncLaneTask;
    _currentSyncLaneTask.nextSameLaneTask = firstPendingSyncLaneTask;
    firstPendingSyncLaneTask.prevSameLaneTask = _currentSyncLaneTask;
    _currentSyncLaneTask = _currentPendingSyncLaneTask;
  }
  if (_currentPendingNormalLaneTask && _currentNormalLaneTask) {
    const firstPendingNormalLaneTask = _firstPendingNormalLaneTask!;
    const firstNormalLaneTask = _firstNormalLaneTask!;
    _currentPendingNormalLaneTask.nextSameLaneTask = firstNormalLaneTask;
    firstNormalLaneTask.prevSameLaneTask = _currentPendingNormalLaneTask;
    _currentNormalLaneTask.nextSameLaneTask = firstPendingNormalLaneTask;
    firstPendingNormalLaneTask.prevSameLaneTask = _currentNormalLaneTask;
    _currentNormalLaneTask = _currentPendingNormalLaneTask;
  }
  if (_currentPendingTransitionLaneTask && _currentTransitionLaneTask) {
    const firstPendingTransitionLaneTask = _firstPendingTransitionLaneTask!;
    const firstTransitionLaneTask = _firstTransitionLaneTask!;
    _currentPendingTransitionLaneTask.nextSameLaneTask = firstTransitionLaneTask;
    firstTransitionLaneTask.prevSameLaneTask = _currentPendingTransitionLaneTask;
    _currentTransitionLaneTask.nextSameLaneTask = firstPendingTransitionLaneTask;
    firstPendingTransitionLaneTask.prevSameLaneTask = _currentTransitionLaneTask;
    _currentTransitionLaneTask = _currentPendingTransitionLaneTask;
  }
  _taskQueue = lastPendingTask;
  _pendingTaskQueue = null;
  _currentPendingLaneTask = null;
  _firstPendingSyncLaneTask = _firstPendingNormalLaneTask = _firstPendingTransitionLaneTask = null;
  _currentPendingSyncLaneTask = _currentPendingNormalLaneTask = _currentPendingTransitionLaneTask = null;
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
  // _workInProgressTaskQueue = null;
  // if(
  //   firstTimerTask &&
  //   (firstTimerTask.expired ||
  //     (firstTimerTask.expired = firstTimerTask.expirationTick < tick))
  // ) {
  //   _workInProgressTaskQueue = firstTimerTask.prev;
  // }
  // if(
  //   _workInProgressTaskQueue === null &&
  //   (_firstTransitionLaneTask &&
  //     (_firstTransitionLaneTask.expired ||
  //       (_firstTransitionLaneTask.expired = _firstTransitionLaneTask.expirationTick < tick)))
  // ) {
  //   _workInProgressTaskQueue = _firstTransitionLaneTask.prev;
  // }
  // if(_workInProgressTaskQueue === null && (_firstNormalLaneTask && (_firstNormalLaneTask.expired || (_firstNormalLaneTask.expired = _firstNormalLaneTask.expirationTick < tick)))) {
  //   _workInProgressTaskQueue = _firstNormalLaneTask.prev;
  // }
  // if(_workInProgressTaskQueue === null) {
  //   const currentQueue = _firstSyncLaneTask || _firstNormalLaneTask || _firstTransitionLaneTask
  //   if(currentQueue) {
  //     _workInProgressTaskQueue = currentQueue.prev;
  //   }
  // }
  // if (_workInProgressTaskQueue) {
  //   _scheduleLane = _workInProgressTaskQueue.next.lane;
  // }
  const firstTimerTask = peek();
  const firstTask = getFirstTask();
  let task = firstTask;
  let expiredTaskQueue: ITask | null = null;
  let workInProgressTaskQueue: ITask | null = null;
  _workInProgressTaskQueue = null;
  if (
    firstTimerTask &&
    (firstTimerTask.expired ||
      (firstTimerTask.expired = firstTimerTask.expirationTick < tick))
  ) {
    expiredTaskQueue = firstTimerTask.prev;
  } else {
    do {
      if (!task) {
        break;
      }
      if (task.expired || (task.expired = task.expirationTick < tick)) {
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
  }
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
  if (typeof firstWorkInProgressTask.sortIndex === 'number') {
    pop();
  }
  if (lastWorkInProgressTask === firstWorkInProgressTask) {
    _taskQueue = _workInProgressTaskQueue = _currentLaneTask = _firstSyncLaneTask = _firstNormalLaneTask = _firstTransitionLaneTask = null;
  } else {
    const nextFirstWorkInProgressTask = firstWorkInProgressTask.next;
    const prevLaneTask = firstWorkInProgressTask.prevLaneTask;
    const nextLaneTask = firstWorkInProgressTask.nextLaneTask;
    const prevSameLaneTask = firstWorkInProgressTask.prevSameLaneTask;
    const nextSameLaneTask = firstWorkInProgressTask.nextSameLaneTask;
    if (prevLaneTask && nextLaneTask) {
      if (nextFirstWorkInProgressTask === nextLaneTask) {
        prevLaneTask.nextLaneTask = nextFirstWorkInProgressTask;
        nextFirstWorkInProgressTask.prevLaneTask = prevLaneTask;
      } else {
        if (firstWorkInProgressTask === _currentLaneTask) {
          _currentLaneTask = nextFirstWorkInProgressTask;
        }
        nextFirstWorkInProgressTask.prevLaneTask = prevLaneTask;
        nextFirstWorkInProgressTask.nextLaneTask = nextLaneTask;
        prevLaneTask.nextLaneTask = nextFirstWorkInProgressTask;
        nextLaneTask.prevLaneTask = nextFirstWorkInProgressTask;
      }
    }
    if (prevSameLaneTask && nextSameLaneTask) {
      const currentLane = firstWorkInProgressTask.lane;
      if ((nextFirstWorkInProgressTask.lane & currentLane) === currentLane) {
        if ((currentLane & SyncLane) === SyncLane) {
          _firstSyncLaneTask = nextFirstWorkInProgressTask;
        }
        if ((currentLane & NormalLane) === NormalLane) {
          _firstNormalLaneTask = nextFirstWorkInProgressTask;
        }
        if ((currentLane & TransitionLane) === TransitionLane) {
          _firstTransitionLaneTask = nextFirstWorkInProgressTask;
        }
        nextFirstWorkInProgressTask.prevSameLaneTask = prevSameLaneTask;
        nextFirstWorkInProgressTask.nextSameLaneTask = nextSameLaneTask;
        prevSameLaneTask.nextSameLaneTask = nextFirstWorkInProgressTask;
        nextSameLaneTask.prevSameLaneTask = nextFirstWorkInProgressTask;
      } else {
        if ((currentLane & SyncLane) === SyncLane) {
          _firstSyncLaneTask = nextSameLaneTask;
        }
        if ((currentLane & NormalLane) === NormalLane) {
          _firstNormalLaneTask = nextSameLaneTask;
        }
        if ((currentLane & TransitionLane) === TransitionLane) {
          _firstTransitionLaneTask = nextSameLaneTask;
        }
        prevSameLaneTask.nextSameLaneTask = nextSameLaneTask;
        nextSameLaneTask.prevSameLaneTask = prevSameLaneTask;
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
  firstWorkInProgressTask.deprecated = true;
  return firstWorkInProgressTask;
};

export const getFirstWorkInProgressTask = (tick: number) => {
  if (_workInProgressTaskQueue === null) {
    return null;
  }
  const firstTimerTask = peek();
  const lastWorkInProgressTask = _workInProgressTaskQueue;
  const firstWorkInProgressTask = lastWorkInProgressTask.next;
  if (
    firstTimerTask &&
    (firstTimerTask.expired ||
      (firstTimerTask.expired = firstTimerTask.expirationTick < tick))
  ) {
    requestWorkInProgressTaskQueue(tick);
  }
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
