import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/messages', () => ({
  send: vi.fn(),
}));

import { send } from '@/lib/messages';
import { profiles$ } from '@/lib/state';
import { App } from './App';
import type { Reply } from '@/lib/messages';
import type { ProfileIndex } from '@/lib/types';

const mockSend = send as unknown as ReturnType<typeof vi.fn>;

function emptyIndex(): ProfileIndex {
  return {
    schemaVersion: 1,
    rootFolderId: 'r',
    updatedAt: '2026-05-15T00:00:00Z',
    updatedBy: 'extension',
    profiles: [],
  };
}

function indexWithOneProfile(): ProfileIndex {
  return {
    schemaVersion: 1,
    rootFolderId: 'r',
    updatedAt: '2026-05-15T00:00:00Z',
    updatedBy: 'extension',
    profiles: [
      {
        id: 'p1',
        name: 'Flutter',
        fileId: 'f1',
        createdAt: '2026-05-15T00:00:00Z',
        categories: [
          {
            id: 'c1',
            name: 'Senior',
            fileId: 'cf1',
            createdAt: '2026-05-15T00:00:00Z',
            defaultResumeId: null,
            descriptionFileId: 'd1',
            templateFileId: 't1',
            resumes: [],
          },
        ],
      },
    ],
  };
}

beforeEach(() => {
  mockSend.mockReset();
  profiles$.value = null;
});

afterEach(() => {
  cleanup();
});

describe('Options App — boot states', () => {
  it('renders empty state when bootstrap returns no profiles', async () => {
    mockSend.mockImplementation(async (msg: { type: string }): Promise<Reply> => {
      if (msg.type === 'BOOTSTRAP_DRIVE') {
        return { type: 'BOOTSTRAP_DRIVE', ok: true, rootFolderId: 'r', profiles: emptyIndex() };
      }
      return { type: 'ERROR', message: 'not handled' };
    });
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Add your first profile')).toBeInTheDocument();
    });
  });

  it('renders the profile list in data state', async () => {
    mockSend.mockImplementation(async (msg: { type: string }): Promise<Reply> => {
      if (msg.type === 'BOOTSTRAP_DRIVE') {
        return {
          type: 'BOOTSTRAP_DRIVE',
          ok: true,
          rootFolderId: 'r',
          profiles: indexWithOneProfile(),
        };
      }
      return { type: 'ERROR', message: 'unhandled' };
    });
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('profile-list')).toBeInTheDocument();
      expect(screen.getByText('Flutter')).toBeInTheDocument();
    });
  });

  it('renders error state when bootstrap fails', async () => {
    mockSend.mockImplementation(async (): Promise<Reply> => ({
      type: 'ERROR',
      message: 'no drive',
    }));
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/no drive/i)).toBeInTheDocument();
    });
  });
});

describe('Options App — profile and category flows', () => {
  it('opens the new-profile dialog and submits create', async () => {
    let createPayload: { name: string } | null = null;
    mockSend.mockImplementation(async (msg: { type: string; payload?: unknown }): Promise<Reply> => {
      if (msg.type === 'BOOTSTRAP_DRIVE') {
        return { type: 'BOOTSTRAP_DRIVE', ok: true, rootFolderId: 'r', profiles: emptyIndex() };
      }
      if (msg.type === 'CREATE_PROFILE') {
        createPayload = msg.payload as { name: string };
        return {
          type: 'CREATE_PROFILE',
          ok: true,
          profile: {
            id: 'np',
            name: createPayload.name,
            fileId: 'fnp',
            createdAt: 'now',
            categories: [],
          },
        };
      }
      if (msg.type === 'REFRESH_PROFILES') {
        return {
          type: 'REFRESH_PROFILES',
          ok: true,
          profiles: {
            ...emptyIndex(),
            profiles: [
              {
                id: 'np',
                name: 'New',
                fileId: 'fnp',
                createdAt: 'now',
                categories: [],
              },
            ],
          },
        };
      }
      return { type: 'ERROR', message: 'unhandled' };
    });

    render(<App />);
    await waitFor(() => screen.getByText('Add your first profile'));

    // Click the empty-state action button
    fireEvent.click(screen.getByText('New profile'));
    const input = await screen.findByPlaceholderText(/Flutter/);
    fireEvent.change(input, { target: { value: 'New' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(createPayload).toEqual({ name: 'New' });
    });
  });

  it('shows category-list once a profile is selected', async () => {
    mockSend.mockImplementation(async (msg: { type: string }): Promise<Reply> => {
      if (msg.type === 'BOOTSTRAP_DRIVE') {
        return {
          type: 'BOOTSTRAP_DRIVE',
          ok: true,
          rootFolderId: 'r',
          profiles: indexWithOneProfile(),
        };
      }
      return { type: 'ERROR', message: 'unhandled' };
    });

    render(<App />);
    await waitFor(() => screen.getByTestId('profile-list'));
    fireEvent.click(screen.getByText('Flutter'));
    await waitFor(() => {
      expect(screen.getByTestId('category-list')).toBeInTheDocument();
      expect(screen.getByText('Senior')).toBeInTheDocument();
    });
  });

  it('opens category panel and shows resume empty state', async () => {
    mockSend.mockImplementation(async (msg: { type: string }): Promise<Reply> => {
      if (msg.type === 'BOOTSTRAP_DRIVE') {
        return {
          type: 'BOOTSTRAP_DRIVE',
          ok: true,
          rootFolderId: 'r',
          profiles: indexWithOneProfile(),
        };
      }
      return { type: 'ERROR', message: 'unhandled' };
    });
    render(<App />);
    await waitFor(() => screen.getByTestId('profile-list'));
    fireEvent.click(screen.getByText('Flutter'));
    await waitFor(() => screen.getByTestId('category-list'));
    fireEvent.click(screen.getByText('Senior'));
    await waitFor(() => {
      expect(screen.getByText('Upload your first resume')).toBeInTheDocument();
    });
  });

  it('surfaces an error when creating a category fails', async () => {
    mockSend.mockImplementation(async (msg: { type: string }): Promise<Reply> => {
      if (msg.type === 'BOOTSTRAP_DRIVE') {
        return {
          type: 'BOOTSTRAP_DRIVE',
          ok: true,
          rootFolderId: 'r',
          profiles: indexWithOneProfile(),
        };
      }
      if (msg.type === 'CREATE_CATEGORY') {
        return { type: 'ERROR', message: 'create-failed' };
      }
      return { type: 'ERROR', message: 'unhandled' };
    });

    render(<App />);
    await waitFor(() => screen.getByTestId('profile-list'));
    fireEvent.click(screen.getByText('Flutter'));
    await waitFor(() => screen.getByTestId('category-list'));
    fireEvent.click(screen.getByLabelText('Add category'));
    const input = await screen.findByPlaceholderText(/Senior Developer/);
    fireEvent.change(input, { target: { value: 'X' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(screen.getByText(/create-failed/)).toBeInTheDocument();
    });
  });
});
