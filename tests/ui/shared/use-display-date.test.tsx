import { renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { useDisplayDate } from '~/shared/hooks/use-display-date';

const instant = '2026-03-08T00:00:00.000Z';

function DateLabel({ value }: { value: Date | string }) {
  return <span>{useDisplayDate(value)}</span>;
}

describe('useDisplayDate', () => {
  test('renders a UTC calendar date on the server for both serialized and Date values', () => {
    expect(renderToString(<DateLabel value={instant} />)).toBe('<span>3/8/2026</span>');
    expect(renderToString(<DateLabel value={new Date(instant)} />)).toBe('<span>3/8/2026</span>');
  });

  test('formats the current value in the browser timezone as the input changes', () => {
    const { result, rerender } = renderHook(({ value }) => useDisplayDate(value), {
      initialProps: { value: instant },
    });
    const localFormat = new Intl.DateTimeFormat('en-US');

    expect(result.current).toBe(localFormat.format(new Date(instant)));

    const next = '2026-06-01T07:30:00.000Z';
    rerender({ value: next });

    expect(result.current).toBe(localFormat.format(new Date(next)));
  });
});
