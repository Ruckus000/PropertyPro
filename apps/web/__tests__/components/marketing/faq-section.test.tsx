import { describe, expect, it } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FaqSection } from '../../../src/components/marketing/faq-section';

const Q1 = /required to have a website/i;
const A1 = /required to maintain a compliant website/i;
const Q2 = /need to be technical/i;
const A2 = /If you can use email/i;

describe('FaqSection', () => {
  it('renders the section with the deep-link id and heading', () => {
    const { container } = render(<FaqSection />);
    expect(container.querySelector('section#faq')).toBeTruthy();
    expect(screen.getByText('The things managers always ask.')).toBeTruthy();
  });

  it('collapses all answers by default', () => {
    render(<FaqSection />);
    const buttons = screen.getAllByRole('button');
    for (const button of buttons) {
      expect(button.getAttribute('aria-expanded')).toBe('false');
    }
    // Answer text is in the DOM (crawlable) but not visible.
    const answer = screen.getByText(A1);
    expect(answer).not.toBeVisible();
    expect(answer.hasAttribute('hidden')).toBe(true);
  });

  it('wires each question button to its answer via aria-controls', () => {
    render(<FaqSection />);
    const button = screen.getByRole('button', { name: Q1 });
    const answerId = button.getAttribute('aria-controls');
    expect(answerId).toBeTruthy();
    const answer = screen.getByText(A1);
    expect(answer.id).toBe(answerId);
  });

  it('reveals an answer when its question is clicked', () => {
    render(<FaqSection />);
    const button = screen.getByRole('button', { name: Q1 });
    const answer = screen.getByText(A1);
    expect(answer).not.toBeVisible();

    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(answer).toBeVisible();
    expect(answer.hasAttribute('hidden')).toBe(false);
  });

  it('collapses again on a second click', () => {
    render(<FaqSection />);
    const button = screen.getByRole('button', { name: Q1 });
    const answer = screen.getByText(A1);

    fireEvent.click(button);
    expect(answer).toBeVisible();

    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(answer).not.toBeVisible();
  });

  it('keeps a single item open at a time', () => {
    render(<FaqSection />);
    const first = screen.getByRole('button', { name: Q1 });
    const second = screen.getByRole('button', { name: Q2 });
    const firstAnswer = screen.getByText(A1);
    const secondAnswer = screen.getByText(A2);

    fireEvent.click(first);
    expect(firstAnswer).toBeVisible();
    expect(secondAnswer).not.toBeVisible();

    fireEvent.click(second);
    expect(secondAnswer).toBeVisible();
    expect(firstAnswer).not.toBeVisible();
    expect(first.getAttribute('aria-expanded')).toBe('false');
    expect(second.getAttribute('aria-expanded')).toBe('true');
  });
});
