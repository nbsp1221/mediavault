import { useBeforeUnload, useBlocker } from 'react-router';

export function useUnsavedChangesGuard(shouldBlock: boolean) {
  const blocker = useBlocker(shouldBlock);

  useBeforeUnload(
    (event) => {
      if (!shouldBlock) {
        return;
      }

      event.preventDefault();
    },
    { capture: true },
  );

  return {
    isBlocked: blocker.state === 'blocked',
    proceed: () => {
      if (blocker.state === 'blocked') {
        blocker.proceed();
      }
    },
    reset: () => {
      if (blocker.state === 'blocked') {
        blocker.reset();
      }
    },
  };
}
