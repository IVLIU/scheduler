import { runIdleCallback } from '../src';

describe('blah', () => {
  it('works', () => {
    expect(runIdleCallback(() => console.log('task performed'))).lastReturnedWith(1);
  });
});
