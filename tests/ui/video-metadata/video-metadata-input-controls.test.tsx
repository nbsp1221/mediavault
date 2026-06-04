import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import type { VideoTaxonomyItem } from '../../../app/modules/library/domain/video-taxonomy';
import { VideoTagInput } from '../../../app/features/video-metadata/ui/VideoTagInput';
import {
  VideoTaxonomyMultiSelect,
  VideoTaxonomySingleSelect,
} from '../../../app/features/video-metadata/ui/VideoTaxonomyCombobox';

const contentTypes: VideoTaxonomyItem[] = [
  { active: true, label: 'Movie', slug: 'movie', sortOrder: 10 },
  { active: true, label: 'Series', slug: 'series', sortOrder: 20 },
];

const genres: VideoTaxonomyItem[] = [
  { active: true, label: 'Action', slug: 'action', sortOrder: 10 },
  { active: true, label: 'Drama', slug: 'drama', sortOrder: 20 },
];

describe('Video metadata input controls', () => {
  beforeAll(() => {
    class TestResizeObserver {
      disconnect() {
        return undefined;
      }

      observe() {
        return undefined;
      }

      unobserve() {
        return undefined;
      }
    }

    globalThis.ResizeObserver = TestResizeObserver;
    window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {
      return undefined;
    };
  });

  test('normalizes comma-separated tag drafts before committing them', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    function ControlledTagInput() {
      const [tags, setTags] = useState(['neo']);

      return (
        <VideoTagInput
          ariaLabel="Tags"
          onChange={(nextTags) => {
            onChange(nextTags);
            setTags(nextTags);
          }}
          value={tags}
        />
      );
    }

    render(<ControlledTagInput />);

    await user.type(screen.getByLabelText('Tags'), '  Neo, New Tag, action!!, , ');
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenLastCalledWith(['neo', 'new_tag', 'action']);
    expect(screen.getByLabelText('Tags')).toHaveValue('');
  });

  test('commits a non-empty tag draft on blur and ignores empty drafts', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <div>
        <VideoTagInput ariaLabel="Tags" onChange={onChange} value={[]} />
        <button type="button">Next field</button>
      </div>,
    );

    await user.click(screen.getByLabelText('Tags'));
    await user.tab();
    expect(onChange).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Tags'), '  Quiet Scene  ');
    await user.click(screen.getByRole('button', { name: 'Next field' }));

    expect(onChange).toHaveBeenCalledWith(['quiet_scene']);
  });

  test('removes tags through chips and only backspaces chips from an empty draft', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<VideoTagInput ariaLabel="Tags" onChange={onChange} value={['neo', 'action']} />);

    await user.click(screen.getByRole('button', { name: 'Remove neo tag' }));
    expect(onChange).toHaveBeenLastCalledWith(['action']);

    await user.type(screen.getByLabelText('Tags'), 'd');
    await user.keyboard('{Backspace}');
    expect(onChange).toHaveBeenCalledTimes(1);

    await user.keyboard('{Backspace}');
    expect(onChange).toHaveBeenLastCalledWith(['neo']);
  });

  test('keeps tag draft and remove actions disabled when the control is disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<VideoTagInput ariaLabel="Tags" disabled onChange={onChange} value={['neo']} />);

    expect(screen.getByLabelText('Tags')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove neo tag' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Remove neo tag' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  test('selects and clears a single taxonomy value while exposing known and fallback labels', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <VideoTaxonomySingleSelect
        ariaLabel="Content type"
        onChange={onChange}
        options={contentTypes}
        placeholder="No content type"
        value="movie"
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Content type' })).toHaveTextContent('Movie');

    rerender(
      <VideoTaxonomySingleSelect
        ariaLabel="Content type"
        onChange={onChange}
        options={contentTypes}
        placeholder="No content type"
        value="archival"
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Content type' })).toHaveTextContent('archival');

    await user.click(screen.getByRole('combobox', { name: 'Content type' }));
    await user.click(await screen.findByText('Series'));
    expect(onChange).toHaveBeenLastCalledWith('series');
    expect(screen.getByRole('combobox', { name: 'Content type' })).toHaveAttribute('aria-expanded', 'false');

    await user.click(screen.getByRole('combobox', { name: 'Content type' }));
    await user.click(await screen.findByText('No selection'));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  test('keeps a disabled single taxonomy trigger closed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <VideoTaxonomySingleSelect
        ariaLabel="Content type"
        disabled
        onChange={onChange}
        options={contentTypes}
        placeholder="No content type"
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Content type' }));

    expect(screen.getByRole('combobox', { name: 'Content type' })).toBeDisabled();
    expect(screen.queryByText('No selection')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  test('adds, removes, and toggles multi taxonomy values', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <VideoTaxonomyMultiSelect
        ariaLabel="Genre"
        onChange={onChange}
        options={genres}
        placeholder="No genres"
        value={['action', 'archival']}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Genre' })).toHaveTextContent('2 selected');
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('archival')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove archival genre' }));
    expect(onChange).toHaveBeenLastCalledWith(['action']);

    await user.click(screen.getByRole('combobox', { name: 'Genre' }));
    await user.click(await screen.findByText('Drama'));
    expect(onChange).toHaveBeenLastCalledWith(['action', 'archival', 'drama']);

    const listbox = screen.getByRole('listbox');
    await user.click(within(listbox).getByText('Action'));
    expect(onChange).toHaveBeenLastCalledWith(['archival']);
  });

  test('shows the multi taxonomy placeholder and disables chip removal when needed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <VideoTaxonomyMultiSelect
        ariaLabel="Genre"
        onChange={onChange}
        options={genres}
        placeholder="No genres"
        value={[]}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Genre' })).toHaveTextContent('No genres');

    rerender(
      <VideoTaxonomyMultiSelect
        ariaLabel="Genre"
        disabled
        onChange={onChange}
        options={genres}
        placeholder="No genres"
        value={['action']}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Remove Action genre' }));

    expect(screen.getByRole('combobox', { name: 'Genre' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove Action genre' })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
