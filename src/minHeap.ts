import type { ITask } from './type';

export const createMinHeap = () => {
  const heap = [] as ITask[];
  const push = (task: ITask) => {
    heap.push(task);
    shiftUp(task.sortIndex = heap.length - 1);
  }
  const pop = () => {
    swap(0, heap.length - 1);
    heap.pop();
    shiftDown(0);
  }
  const peek = () => heap[0];
  const swap = (index1: number, index2: number) => {
    [heap[index2], heap[index1]] = [heap[index1], heap[index2]];
    heap[index1].sortIndex = index1;
    heap[index2].sortIndex = index2; 
  };
  const shiftUp = (index: number) => {
    if(index === 0) {
      return;
    }
    const parentIndex = ~~((index - 1) / 2);
    if(heap[parentIndex].expirationTick > heap[index].expirationTick) {
      swap(parentIndex, index);
      shiftUp(parentIndex);
    }
  }
  const shiftDown = (index: number) => {
    const leftIndex = (index + 1) * 2 - 1;
    const rightIndex = (index + 1) * 2;
    const length = heap.length;
    if(leftIndex < length && heap[leftIndex].expirationTick < heap[index].expirationTick) {
      swap(leftIndex, index);
      shiftDown(leftIndex);
    }
    if(rightIndex < length && heap[rightIndex].expirationTick < heap[index].expirationTick) {
      swap(rightIndex, index);
      shiftDown(rightIndex);
    }
  }
  return {
    push,
    pop,
    peek,
  }
}