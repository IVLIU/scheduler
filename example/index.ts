import {
  runIdleCallback,
  runSyncIdleCallback,
  runTransitionIdleCallback,
  shouldYield,
  createAbortController,
} from '../.';

new Worker(new URL('worker.js', import.meta.url), { type: 'module' });

const transitionTaskList = Array.from({ length: 5 });

const normalTaskList = Array.from({ length: 5 });

const syncTaskList = Array.from({ length: 5 });

const asyncTasks = [
  () =>
    new Promise<void>(r =>
      setTimeout(() => {
        console.log('async 1');
        r();
      }, 3),
    ),
  () =>
    new Promise<void>(r =>
      setTimeout(() => {
        console.log('async 2');
        r();
      }, 5),
    ),
  () =>
    new Promise<void>(r =>
      setTimeout(() => {
        console.log('async 3');
        r();
      }, 2),
    ),
  () =>
    new Promise<void>(r =>
      setTimeout(() => {
        console.log('async 4');
        r();
      }, 1),
    ),
  () =>
    new Promise<void>(r =>
      setTimeout(() => {
        console.log('async 5');
        r();
      }, 4),
    ),
];

const str =
  'react react-dom react-native react-redux react-router vue vue-router angular';
const reg = new RegExp('(react(-[a-z]+)?|vue(-[a-z]+)?|angular)', 'g');

const controller = createAbortController();

let count = 0;

runIdleCallback(() => console.log('normal task 1 will be aborted'), {
  signal: controller.signal,
  effect: aborted => console.log('normal task 1 aborted value is', aborted),
});

runIdleCallback(() => console.log('normal task 2 will be aborted'), {
  signal: controller.signal,
  effect: aborted => console.log('normal task 2 aborted value is', aborted),
});

runIdleCallback(() => console.log('normal task 3 will be aborted'), {
  signal: controller.signal,
  effect: aborted => console.log('normal task 3 aborted value is', aborted),
  debugger: task => {
    console.log('debugger task is', task);
  },
});

controller.abort();

runTransitionIdleCallback(() => {
  console.log('transition task wrapped sync task');
  runSyncIdleCallback(() => {
    console.log('sync task in transition task');
  });
});

transitionTaskList.forEach((_, index) =>
  runTransitionIdleCallback(tick =>
    console.log(`transition task ${index} performed`, tick),
  ),
);

normalTaskList.forEach((_, index) =>
  runIdleCallback(tick => console.log(`normal task ${index} performed`, tick)),
);

syncTaskList.forEach((_, index) =>
  runSyncIdleCallback(tick =>
    console.log(`sync task ${index} performed`, tick),
  ),
);

function _exec() {
  runTransitionIdleCallback(() => {
    let arr: RegExpExecArray | null = null;
    do {
      if (!(arr = reg.exec(str))) {
        break;
      }
      console.log(`the matched is ${arr[1]}`);
    } while (arr && !shouldYield());
    if (arr) {
      _exec();
    }
  });
}

_exec();

function _asyncExec(tasks: Array<() => Promise<void>>) {
  runTransitionIdleCallback(async () => {
    let current: (() => Promise<void>) | undefined = undefined;
    while (!shouldYield() && (current = tasks.pop())) {
      await current();
    }
    if (tasks.length) {
      _asyncExec(tasks);
    }
  });
}

_asyncExec(asyncTasks.reverse());

Promise.resolve().then(() =>
  runIdleCallback(() => console.log('normal task in micro task.')),
);

runIdleCallback(() => {
  Promise.resolve().then(() => {
    runIdleCallback(() => console.log('normal task in inner micro task.'));
  });
});

setTimeout(
  () => runIdleCallback(() => console.log('normal task in macro task.')),
  0,
);

function* gen() {
  yield Promise.resolve(1);
  yield Promise.resolve(2);
  yield Promise.resolve(3);
  yield Promise.resolve(4);
  yield Promise.resolve(5);
}

function co(gen: Generator<Promise<number>>) {
  return new Promise((resolve, reject) => {
    function next(iter: IteratorResult<Promise<number>>) {
      if (iter.done) {
        return resolve(iter.value);
      }
      iter.value
        .then(value => {
          runIdleCallback(() => {
            console.log('gen', value);
            next(gen.next(value));
          });
        })
        .catch(err => reject(gen.throw(err)));
    }
    next(gen.next());
  });
}

co(gen());

const checkbox = document.querySelector(
  'input[type="checkbox"]',
) as HTMLInputElement;

document.querySelector('input[type="text"]')!.addEventListener('keydown', e => {
  runSyncIdleCallback(() => {
    if (checkbox.checked) {
      const current = performance.now();
      while (performance.now() - current < 100) {}
    }
    // @ts-ignore
    document.querySelector('.sync-p').innerText =
      // @ts-ignore
      e.target.value || 'please enter';
  });
  runTransitionIdleCallback(
    () => {
      // @ts-ignore
      document.querySelector('.transition-p').innerText =
        // @ts-ignore
        e.target.value || 'please enter';
    },
    { transition: { timeout: 1000 } },
  );
});
