import { postTask } from '../src';

describe('blah', () => {
  it('works', () => {
    expect(postTask(() => console.log('task performed'))).lastReturnedWith(1);
  });
});
