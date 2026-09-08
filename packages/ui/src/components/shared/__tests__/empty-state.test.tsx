// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Inbox } from 'lucide-react';
import { EmptyState } from '../empty-state';

describe('EmptyState (props-only)', () => {
  it('renders title, description and action', () => {
    render(<EmptyState icon={Inbox} title="Nothing here" description="No open threads." action={<button>Refresh</button>} />);
    expect(screen.getByRole('heading', { name: 'Nothing here' })).toBeTruthy();
    expect(screen.getByText('No open threads.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
  });
});
