import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/messages', () => ({
  send: vi.fn(),
}));

import { send } from '@/lib/messages';
import { authStatus$, profiles$ } from '@/lib/state';
import { App } from './App';
import type { Reply } from '@/lib/messages';

const mockSend = send as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockSend.mockReset();
  authStatus$.value = 'unknown';
  profiles$.value = null;
  // Reset onMessage listeners on the shimmed chrome.* runtime
  (chrome.runtime.onMessage as unknown as { addListener: ReturnType<typeof vi.fn> }).addListener =
    vi.fn();
  (chrome.runtime.onMessage as unknown as { removeListener: ReturnType<typeof vi.fn> }).removeListener =
    vi.fn();
});

afterEach(() => cleanup());

const emptyProfilesReply: Reply = {
  type: 'BOOTSTRAP_DRIVE',
  ok: true,
  rootFolderId: 'r',
  profiles: {
    schemaVersion: 1,
    rootFolderId: 'r',
    updatedAt: 'now',
    updatedBy: 'extension',
    profiles: [],
  },
};

function defaultMock(): void {
  mockSend.mockImplementation(async (msg: { type: string }): Promise<Reply> => {
    if (msg.type === 'BOOTSTRAP_DRIVE') return emptyProfilesReply;
    if (msg.type === 'GET_LAST_SENT') return { type: 'GET_LAST_SENT', ok: true, sent: null };
    return { type: 'BOOT_AUTH', status: 'signed-in' };
  });
}

describe('Popup App', () => {
  it('shows loading skeleton while auth is unknown', () => {
    mockSend.mockResolvedValue({ type: 'BOOT_AUTH', status: 'signed-out' } as Reply);
    render(<App />);
    expect(screen.getByTestId('popup-loading')).toBeInTheDocument();
  });

  it('shows sign-in CTA when signed-out', () => {
    mockSend.mockResolvedValue({ type: 'BOOT_AUTH', status: 'signed-out' } as Reply);
    authStatus$.value = 'signed-out';
    render(<App />);
    expect(screen.getAllByText(/Sign in with Google/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /Sign in with Google/ })).toBeInTheDocument();
  });

  it('shows the profile/category summary card and Manage in settings button when signed-in', async () => {
    mockSend.mockImplementation(async (msg: { type: string }): Promise<Reply> => {
      if (msg.type === 'BOOTSTRAP_DRIVE') {
        return {
          type: 'BOOTSTRAP_DRIVE',
          ok: true,
          rootFolderId: 'r',
          profiles: {
            schemaVersion: 1,
            rootFolderId: 'r',
            updatedAt: 'now',
            updatedBy: 'extension',
            profiles: [
              {
                id: 'p1',
                name: 'Flutter',
                fileId: 'f1',
                createdAt: 'now',
                categories: [
                  {
                    id: 'c1',
                    name: 'Senior',
                    fileId: 'cf',
                    createdAt: 'now',
                    defaultResumeId: null,
                    descriptionFileId: null,
                    templateFileId: null,
                    resumes: [],
                  },
                  {
                    id: 'c2',
                    name: 'Junior',
                    fileId: 'cf2',
                    createdAt: 'now',
                    defaultResumeId: null,
                    descriptionFileId: null,
                    templateFileId: null,
                    resumes: [],
                  },
                ],
              },
            ],
          },
        };
      }
      if (msg.type === 'GET_LAST_SENT') return { type: 'GET_LAST_SENT', ok: true, sent: null };
      return { type: 'BOOT_AUTH', status: 'signed-in' };
    });
    authStatus$.value = 'signed-in';
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/1 profile/)).toBeInTheDocument();
      expect(screen.getByText(/2 categories/)).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Manage in settings')).toBeInTheDocument();
  });

  it('opens the options page when Manage in settings is clicked', async () => {
    defaultMock();
    authStatus$.value = 'signed-in';
    const openSpy = vi.fn();
    (chrome.runtime as unknown as { openOptionsPage: () => void }).openOptionsPage = openSpy;
    render(<App />);
    await waitFor(() => screen.getByLabelText('Manage in settings'));
    fireEvent.click(screen.getByLabelText('Manage in settings'));
    expect(openSpy).toHaveBeenCalled();
  });

  it('does NOT render any history / sent list / dashboard / inbox affordance', async () => {
    defaultMock();
    authStatus$.value = 'signed-in';
    const { container } = render(<App />);
    await waitFor(() => screen.getByLabelText('Manage in settings'));
    const html = container.innerHTML.toLowerCase();
    expect(html).not.toMatch(/\bhistory\b/);
    expect(html).not.toMatch(/\bsent emails?\b/);
    expect(html).not.toMatch(/\bdashboard\b/);
    expect(html).not.toMatch(/\binbox\b/);
  });

  it('shows a "Last sent" line when GET_LAST_SENT returns an entry', async () => {
    mockSend.mockImplementation(async (msg: { type: string }): Promise<Reply> => {
      if (msg.type === 'BOOTSTRAP_DRIVE') return emptyProfilesReply;
      if (msg.type === 'GET_LAST_SENT') {
        return {
          type: 'GET_LAST_SENT',
          ok: true,
          sent: { subject: 'Application: Flutter Dev', sentAt: new Date().toISOString() },
        };
      }
      return { type: 'BOOT_AUTH', status: 'signed-in' };
    });
    authStatus$.value = 'signed-in';
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('popup-last-sent')).toBeInTheDocument();
    });
    expect(screen.getByTestId('popup-last-sent').textContent).toContain(
      'Application: Flutter Dev',
    );
  });

  it('does NOT render a list of sent emails (only a single most-recent line)', async () => {
    mockSend.mockImplementation(async (msg: { type: string }): Promise<Reply> => {
      if (msg.type === 'BOOTSTRAP_DRIVE') return emptyProfilesReply;
      if (msg.type === 'GET_LAST_SENT') {
        return {
          type: 'GET_LAST_SENT',
          ok: true,
          sent: { subject: 'Hello', sentAt: new Date().toISOString() },
        };
      }
      return { type: 'BOOT_AUTH', status: 'signed-in' };
    });
    authStatus$.value = 'signed-in';
    const { container } = render(<App />);
    await waitFor(() => screen.getByTestId('popup-last-sent'));
    expect(container.querySelectorAll('[data-testid="popup-last-sent"]').length).toBe(1);
    // No <ul>/<ol> or "View all" affordance
    expect(container.querySelector('ul')).toBeNull();
    expect(container.querySelector('ol')).toBeNull();
  });
});
