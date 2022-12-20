import { ITaskController } from './type';

export const createTaskController = (
  priority?: 'sync' | 'normal' | 'transition',
) =>
  'TaskController' in globalThis
    ? new (globalThis as typeof globalThis & {
        TaskController: ITaskController;
      }).TaskController({
        priority: priority
          ? priority === 'sync'
            ? 'user-blocking'
            : priority === 'transition'
            ? 'background'
            : 'user-visible'
          : 'user-visible',
      })
    : (({
        signal: { aborted: false },
        abort: function() {
          this.signal.aborted = true;
        },
      } as any) as ITaskController);
