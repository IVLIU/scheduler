# scheduler

scheduler是一个基于帧分片实现的任务调度器

它可以帮助您优雅的处理大量的JavaScript计算，同时保持页面的快速响应。例如大数据的校验。

它没有任何依赖，您可以用极低的成本来引入它，同时它的使用超级简单

## 安装

```bash
# install
npm install @ai-indeed/scheduler # or yarn add @ai-indeed/scheduler
```

## 文档

它提供的核心api只有一个，即runIdleCallback，它很强大也很简单，具体我们看一个例子。

```typescript
import { runIdleCallback } from '@ai-indeed/scheduler';

runIdleCallback(() => console.log('i am a task'));
```
以上是一个最简单是使用，传入一个回调函数，它会在合适的时机被执行

想象一个场景，我们有一个输入框和一个数量巨大的列表，通过在输入框输入值来过滤该列表。
注意我的用词‘数量巨大’，所以如果不做优化的话，页面应该会出现卡顿的。
从用户的角度来说，他肯定是希望输入框保持快速响应，列表过滤可以慢一点，也可以说输入框输入的优先级要更高。
所以scheduler实现了优先级调度，目前实现了三个优先级（sync priority，normal priority，transition priority），他们的优先级依次降低。
看个例子
```typescript
import { runIdleCallback } from '@ai-indeed/scheduler';

runIdleCallback(() => console.log('sync task'), { sync: true });
runIdleCallback(() => console.log('normal task'));
runIdleCallback(() => console.log('transition task'), { transition: true });
runIdleCallback(() => console.log('transition task'), { transition: { timeout: 3000 } }); // 自定义过期时间
```
同时为了解决饥饿问题，所以我们设置了过期时间，分别是立即过期，50毫秒后过期，和不过期（但是可以设置）。

除此之外，它还提供了一个辅助api，即shouldYield，它帮助您更高效的执行任务。它会在5毫秒后过期。
看个例子
```typescript
import { runIdleCallback, shouldYield } from '@ai-indeed/scheduler';

function _exec() {
  runIdleCallback(
    () => {
      let arr: RegExpExecArray = null;
      do {
        if (!(arr = reg.exec(str))) {
          break;
        }
        console.log(`the matched is ${arr[1]}`);
      } while (arr && !shouldYield());
      if (arr) {
        _exec();
      }
    },
    { transition: true },
  );
}

_exec();
```

## 例子

请参照example

## todo

1. 支持tearing api
2. 支持native scheduler
3. 支持delay time
4. 支持动态调整优先级

## Gitlab

https://code.ii-ai.tech/ued/ii-scheduler

没有权限请联系流川