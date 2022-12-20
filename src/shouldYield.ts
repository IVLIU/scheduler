import { isInputPending } from './isInputPending';
import { getCurrentTick } from './getCurrentTick';

let _deadTick = -1;

export const shouldYield = () => {
  if (_deadTick === -1) {
    _deadTick = getCurrentTick() + 5;
  }
  return isInputPending() || getCurrentTick() > _deadTick
    ? ((_deadTick = -1), true)
    : false;
};
