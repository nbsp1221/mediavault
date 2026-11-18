import { useSyncExternalStore } from 'react';

const UTC_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' });
const LOCAL_DATE_FORMATTER = new Intl.DateTimeFormat('en-US');

// React uses the server snapshot for both SSR and the first hydration render.
function subscribe() {
  return () => {};
}

export function useDisplayDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);

  return useSyncExternalStore(
    subscribe,
    () => LOCAL_DATE_FORMATTER.format(date),
    () => UTC_DATE_FORMATTER.format(date),
  );
}
