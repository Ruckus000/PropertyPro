/**
 * PortfolioTools: the Communities toolbar's links to Reports and Templates,
 * which replace the rail the portfolio pages no longer have. Templates is a
 * plan feature, so it appears only when the server says the actor has it.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortfolioTools } from '../../src/components/pm/PortfolioTools';

afterEach(cleanup);

describe('PortfolioTools', () => {
  it('links to Reports and Templates when the plan includes templates', () => {
    render(<PortfolioTools showTemplates />);
    const tools = screen.getByRole('navigation', { name: 'Portfolio tools' });

    expect(within(tools).getByRole('link', { name: 'Reports' })).toHaveAttribute('href', '/pm/reports');
    expect(within(tools).getByRole('link', { name: 'Templates' })).toHaveAttribute(
      'href',
      '/pm/portfolio/templates',
    );
  });

  it('leaves Templates out when the plan does not include it', () => {
    render(<PortfolioTools showTemplates={false} />);
    const tools = screen.getByRole('navigation', { name: 'Portfolio tools' });

    expect(within(tools).getByRole('link', { name: 'Reports' })).toBeInTheDocument();
    expect(within(tools).queryByRole('link', { name: 'Templates' })).toBeNull();
  });

  it('gives a phone one 44px menu button instead of the links', () => {
    render(<PortfolioTools showTemplates />);
    const more = screen.getByRole('button', { name: 'More portfolio tools' });

    expect(more).toHaveClass('size-11');
    expect(more.parentElement).toHaveClass('md:hidden');
  });

  it('opens the phone menu with both links', async () => {
    render(<PortfolioTools showTemplates />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'More portfolio tools' }));

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Reports' })).toHaveAttribute('href', '/pm/reports');
    expect(within(menu).getByRole('menuitem', { name: 'Templates' })).toHaveAttribute(
      'href',
      '/pm/portfolio/templates',
    );
  });
});
