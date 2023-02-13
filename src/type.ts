export interface ITask {
  index: number;
  sortIndex: number;
  lane: number;
  /** 创建时间 */
  creationTick: number;
  /** 可调度时间，为将来支持delay做准备，目前等于创建时间 */
  executionTick: number;
  /** 过期时间 */
  expirationTick: number;
  callback: (callTick: number) => void;
  effect: ((aborted: boolean) => void) | null;
  debugger: ((task: ITask) => void) | null;
  signal: AbortSignal | null;
  expired: boolean;
  prev: ITask;
  next: ITask;
  prevLaneTask: ITask;
  nextLaneTask: ITask;
  prevSameLaneTask: ITask;
  nextSameLaneTask: ITask;
}

export interface IOptions {
  sync: boolean;
  transition: boolean | { timeout: number };
  signal: AbortSignal | null;
  effect: ((aborted: boolean) => void) | null;
  debugger: ((task: ITask) => void) | null;
}

export interface ITaskController {
  new (options: {
    priority?: 'user-blocking' | 'user-visible' | 'background';
  }): {
    signal: { aborted: boolean };
    abort: () => void;
  };
}

export interface IScheduler {
  postTask: <T extends any = any>(
    callback: () => T,
    options?: Partial<{
      priority: TSchedulePriority;
      signal: ITaskSignal | AbortSignal;
      delay: number;
    }>,
  ) => Promise<ReturnType<typeof callback>>;
}

export interface ITaskSignal {
  aborted: boolean;
  priority: TSchedulePriority;
}

export type TSchedulePriority = 'user-blocking' | 'user-visible' | 'background';
