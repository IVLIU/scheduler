export interface IBatchConfig {
  forceBatch: IForceBatch | null;
}

export interface IForceBatch {
  lanes: number;
}

export interface ITask {
  index: number;
  lane: number;
  creationTick: number;
  executionTick: number;
  expirationTick: number;
  callback: (callTick: number) => void;
  effect: ((aborted: boolean) => void) | null;
  debugger: ((task: ITask) => void) | null;
  signal: AbortSignal | null;
  forceBatch: IForceBatch | null;
  expired: boolean;
  prev: ITask;
  next: ITask;
  prevLaneTask: ITask;
  nextLaneTask: ITask;
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
