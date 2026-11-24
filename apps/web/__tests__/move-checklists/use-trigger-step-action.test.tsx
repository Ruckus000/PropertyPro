/**
 * A step action (send invite, send welcome packet, schedule inspection)
 * completes its step, and the list cards print "N of M steps done": the list
 * must be refetched as well as the open checklist.
 */
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { requestJsonMock } = vi.hoisted(() => ({ requestJsonMock: vi.fn() }));
vi.mock('@/lib/api/request-json', () => ({ requestJson: requestJsonMock }));

import { useTriggerStepAction } from '@/hooks/use-move-checklists';

describe('useTriggerStepAction', () => {
  it('invalidates the open checklist and the list on success', async () => {
    requestJsonMock.mockResolvedValue({});
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useTriggerStepAction(42, 7), { wrapper });
    result.current.mutate({ stepKey: 'portal_account', action: 'send_invite' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['move-checklist', 42, 7] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['move-checklists', 42] });
  });
});
