import { isInputPending } from './isInputPending';
import { getCurrentTick } from './getCurrentTick';

export const yieldTickRef = { current: -1 };

export const shouldYield = () => {
  if (yieldTickRef.current === -1) {
    yieldTickRef.current = getCurrentTick() + 5;
  }
  return isInputPending() || getCurrentTick() > yieldTickRef.current
    ? ((yieldTickRef.current = -1), true)
    : false;
};
