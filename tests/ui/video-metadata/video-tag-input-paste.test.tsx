import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { VideoTagInput } from '../../../app/features/video-metadata/ui/VideoTagInput';

function ControlledTagInput({ onChange }: { readonly onChange: (tags: string[]) => void }) {
  const [tags, setTags] = useState<string[]>(['neo']);

  return (
    <div>
      <VideoTagInput
        ariaLabel="Tags"
        onChange={(nextTags) => {
          onChange(nextTags);
          setTags(nextTags);
        }}
        value={tags}
      />
      <button type="button">Commit focus target</button>
    </div>
  );
}

describe('VideoTagInput pasted drafts', () => {
  test('splits, trims, and drops blank pasted tags on blur', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<ControlledTagInput onChange={onChange} />);

    await user.click(screen.getByLabelText('Tags'));
    await user.paste('  Neo, New Tag, action!!, ,  ');
    await user.click(screen.getByRole('button', { name: 'Commit focus target' }));

    expect(onChange).toHaveBeenLastCalledWith(['neo', 'new_tag', 'action']);
  });
});
