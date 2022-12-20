import {
  runIdleCallback,
  runSyncIdleCallback,
  runTransitionIdleCallback,
} from '../.';

runTransitionIdleCallback(() => {
  console.log('transition task in worker');
});

runIdleCallback(() => {
  console.log('normal task in worker');
});

runSyncIdleCallback(() => {
  console.log('sync task in worker');
});
