import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { VideoTagInput } from '../../../app/features/video-metadata/ui/VideoTagInput';

function ControlledTagInput({ onChange }: { onChange: (tags: string[]) => void }) {
  const [tags, setTags] = useState<string[]>(['neo']);
  return (
    <div>
      <VideoTagInput
        ariaLabel="Tags"
        onChange={(next) => {
          onChange(next);
          setTags(next);
        }}
        value={tags}
      />
      <button type="button">Commit focus target</button>
    </div>
  );
}

describe('Unicode tag input', () => {
  test('uses comma-delimited batches while preserving spaces, Korean, punctuation and literal underscores', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledTagInput onChange={onChange} />);
    await user.click(screen.getByLabelText('Tags'));
    await user.paste('  Neo, New Tag, action!!, 가족 여행, C++, old_tag, , ');
    await user.click(screen.getByRole('button', { name: 'Commit focus target' }));
    expect(onChange).toHaveBeenLastCalledWith([
      'neo',
      'new tag',
      'action!!',
      '가족 여행',
      'c++',
      'old_tag',
    ]);
    expect(screen.getByText('old_tag')).toBeInTheDocument();
    expect(screen.getByText('가족 여행')).toBeInTheDocument();
  });
  test('deduplicates composed/decomposed labels on Enter without erasing punctuation', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledTagInput onChange={onChange} />);
    await user.type(screen.getByLabelText('Tags'), 'Café{Enter}CAFE\u0301{Enter}C++{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(['neo', 'café', 'c++']);
  });
  test('does not commit Enter while a Korean IME composition is active', () => {
    const onChange = vi.fn();
    render(<ControlledTagInput onChange={onChange} />);
    const input = screen.getByLabelText('Tags');
    fireEvent.change(input, { target: { value: '가족' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('가족');
    fireEvent.keyDown(input, { key: 'Enter', isComposing: false });
    expect(onChange).toHaveBeenCalledWith(['neo', '가족']);
  });
  test.each(['가'.repeat(101), 'bad\u0000tag', '\tlabel', '\ud800'])(
    'retains invalid draft %j and exposes a clear error without partially committing',
    async (draft) => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<ControlledTagInput onChange={onChange} />);
      const input = screen.getByLabelText('Tags');
      fireEvent.change(input, { target: { value: draft } });
      fireEvent.keyDown(input, { key: 'Enter' });
      await user.click(screen.getByRole('button', { name: 'Commit focus target' }));
      expect(screen.getByRole('alert')).toHaveTextContent(/Tags/);
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveValue(draft);
      expect(onChange).not.toHaveBeenCalled();
      await user.clear(input);
      await user.type(input, '유효한 태그{Enter}');
      expect(onChange).toHaveBeenLastCalledWith(['neo', '유효한 태그']);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );
});
