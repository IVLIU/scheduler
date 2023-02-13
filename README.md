# scheduler

scheduler是一个宏任务分片的调度器。

为什么我们需要一个调度器呢？
由于js线程和UI线程互斥，当js线程长时间占用线程，此时的UI会发生卡顿，给用户不愉悦的体验。
如果此时有一个调度器可以把任务切割成一段一段的，每执行完一段，就把线程让给UI，使UI可以得到快速响应。

为什么是基于宏任务的，明明微任务优先级更高？

熟悉event loop的都知道，要开启下一次循环的前提是清空微任务队列，如果我们把任务都放在微任务的话，那仍然需要很长时间清空队列，此时UI仍然是阻塞的。

## 特性

- 性能高，增删查任务操作99.99%都是在O(1)复杂度下完成，最极端情况也只有O(log(n))复杂度
- 支持不同优先级的任务
- 支持任务过期，不会出现饥饿问题
- 使用简单，仅包含一个核心api和一个辅助api
- 零依赖，任何项目都可接入

## 安装

```bash
# install
npm install @ai-indeed/scheduler # or yarn add @ai-indeed/scheduler or pnpm add @ai-indeed/scheduler
```

## API

### postTask

它是最核心的api，使用进需要将任务包裹在回调函数里

```typescript
import { postTask } from '@ai-indeed/scheduler';

postTask((tick) => {
  console.log('我将会在某个时间调用，这是我调用时的时间戳' + tick);
});
```

### shouldYield

如果耗时任务在事件本身，比如一个很长的循环，那我们可以借助shouldYield来自行决定是否需要暂停

```typescript

function _exec() {
  postTransitionTask(() => {
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
```

## 高阶用法

设置不同优先级，我们可以根据任务的紧迫程度设置响应的优先级

同时我们也提供了postSyncTask和postTransitionTask使用

```typescript
import { postTask } from '@ai-indeed/scheduler';

postTask(() => {
  console.log('transition lane task');
}, { transition: true /** { timeout: number } */ });

postTask(() => console.log('normal lane task'));

postTask(() => console.log('sync lane task'), { sync: true });
```

取消任务，基于AbortController比如我们的任务是实时刷新的，那么我们可以取消之前的任务，

```typescript
import { postTask } from '@ai-indeed/scheduler';

const ac = new AbortController();

postTask(() => { console.log('我是一个不确定是否执行的任务') }, 
{ 
  signal: ac.signal, 
  effect: (aborted) => {
    console.log(`任务${aborted ? '取消了' : '没取消'}`);
  }});

```

## 使用场景

- dom resize callback
- dom操作
- 大数据处理

## todo

1. 支持避免data tearing api
2. 支持delay time
3. 支持动态调整优先级
