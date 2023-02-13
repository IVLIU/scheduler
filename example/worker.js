// @ts-check
import {
  postTask,
  postSyncTask,
  postTransitionTask,
} from '../.';

postTransitionTask(() => {
  console.log('transition task in worker');
});

postTask(() => {
  console.log('normal task in worker');
});

postSyncTask(() => {
  console.log('sync task in worker');
});
