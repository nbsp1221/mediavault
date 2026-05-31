import { useBeforeUnload, useBlocker } from 'react-router';

export function useUnsavedChangesGuard(shouldBlock: boolean) {
  const blocker = useBlocker(shouldBlock);

  useBeforeUnload((event) => {
    if (!shouldBlock) {
      return;
    }

    event.preventDefault();
  }, { capture: true });

  return {
    blocker,
    location: blocker.state === 'blocked' ? blocker.location : null,
    isBlocked: blocker.state === 'blocked',
    reset: () => {
      if (blocker.state === 'blocked') {
        blocker.reset();
      }
    },
  };
}
