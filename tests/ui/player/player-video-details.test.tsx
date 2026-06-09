import { render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { PlayerVideoDetails } from '../../../app/widgets/player-surface/ui/PlayerVideoDetails';

function renderDetails(overrides: {
  description?: string;
  tagItems?: Array<{
    isActive: boolean;
    value: string;
  }>;
} = {}) {
  render(
    <PlayerVideoDetails
      clearTagFilter={vi.fn()}
      createdAtLabel="3/9/2026"
      description={overrides.description}
      durationLabel="1:30"
      hasTagFilter={false}
      tagItems={overrides.tagItems ?? []}
      title="Details fixture"
      toggleTagFilter={vi.fn()}
    />,
  );
}

describe('PlayerVideoDetails', () => {
  test('omits the section separator and renders the empty tag state when optional details are absent', () => {
    renderDetails();

    const details = screen.getByRole('region', { name: /video details/i });

    expect(within(details).queryByRole('heading', { name: /description/i })).not.toBeInTheDocument();
    expect(within(details).getByText('No tags')).toBeInTheDocument();
    expect(details.querySelector('[data-slot="separator"]')).not.toBeInTheDocument();
  });

  test('keeps the details separator and tag controls when tags exist without a description', () => {
    renderDetails({
      tagItems: [
        { isActive: false, value: 'vault' },
        { isActive: true, value: 'alpha' },
      ],
    });

    const details = screen.getByRole('region', { name: /video details/i });

    expect(within(details).queryByRole('heading', { name: /description/i })).not.toBeInTheDocument();
    expect(within(details).queryByText('No tags')).not.toBeInTheDocument();
    expect(details.querySelector('[data-slot="separator"]')).toBeInTheDocument();
    expect(within(details).getByRole('button', { name: '#vault' })).toBeInTheDocument();
    expect(within(details).getByRole('button', { name: '#alpha' })).toBeInTheDocument();
  });
});
