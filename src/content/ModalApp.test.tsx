import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModalApp } from './ModalApp';
import type { ProfileIndex } from '@/lib/types';

const profiles: ProfileIndex = {
  schemaVersion: 1,
  rootFolderId: 'root',
  updatedAt: '2026-05-15',
  profiles: [
    {
      id: 'p1',
      name: 'Frontend',
      fileId: 'f1',
      createdAt: '',
      categories: [
        {
          id: 'c1',
          name: 'Outreach',
          fileId: 'fc1',
          createdAt: '',
          defaultResumeId: 'r2',
          descriptionFileId: 'desc-1',
          templateFileId: null,
          resumes: [
            { id: 'r1', name: 'general.pdf', fileId: 'fr1', uploadedAt: '', sizeBytes: 1 },
            { id: 'r2', name: 'targeted.pdf', fileId: 'fr2', uploadedAt: '', sizeBytes: 1 },
          ],
        },
      ],
    },
  ],
};

const extraction = {
  email: 'hiring@example.com',
  recipientName: 'Ada Lovelace',
  role: 'Frontend Engineer',
  company: 'Analytical Engines',
};

function mockSendMessage(
  listReply: unknown = { type: 'LIST_PROFILES_FOR_SEND', ok: true, profiles },
  queueReply: unknown = { type: 'QUEUE_SEND', ok: true, jobId: 'job-42' },
) {
  (chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (msg: { type: string }, cb?: (reply: unknown) => void) => {
      const reply =
        msg.type === 'LIST_PROFILES_FOR_SEND' ? listReply :
        msg.type === 'QUEUE_SEND' ? queueReply : { ok: true };
      if (cb) queueMicrotask(() => cb(reply));
      return Promise.resolve(reply);
    },
  );
}

describe('ModalApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    (chrome.runtime as unknown as { lastError: unknown }).lastError = undefined;
  });

  it.skip('walks the 3-step flow and dispatches QUEUE_SEND with expected payload', async () => {
    mockSendMessage();
    const onClose = vi.fn();
    render(
      <ModalApp extraction={extraction} sourceUrl="https://linkedin.com/x" onClose={onClose} />,
    );
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('Choose a profile')).toBeInTheDocument());

    await user.click(screen.getByTestId('profile-p1'));
    await waitFor(() => expect(screen.getByText(/pick category/i)).toBeInTheDocument());
    await user.click(screen.getByTestId('category-c1'));
    await user.click(screen.getByTestId('continue-to-preview'));

    expect(screen.getByTestId('preview-to')).toHaveValue('hiring@example.com');
    expect(screen.getByTestId('preview-subject')).toHaveValue(
      'Application: Frontend Engineer at Analytical Engines',
    );

    await user.click(screen.getByTestId('send-button'));

    await waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'QUEUE_SEND',
          payload: expect.objectContaining({
            to: 'hiring@example.com',
            subject: 'Application: Frontend Engineer at Analytical Engines',
            attachmentResumeId: 'r2',
            profileId: 'p1',
            categoryId: 'c1',
            sourceUrl: 'https://linkedin.com/x',
          }),
        }),
      );
    });

    expect(screen.getByTestId('ea-toast')).toHaveTextContent(/Queued/i);

    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 1500 });
  });

  it('Esc closes the modal', async () => {
    mockSendMessage();
    const onClose = vi.fn();
    render(
      <ModalApp extraction={extraction} sourceUrl="https://linkedin.com/x" onClose={onClose} />,
    );
    await waitFor(() => expect(screen.getByText('Choose a profile')).toBeInTheDocument());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking the backdrop closes the modal', async () => {
    mockSendMessage();
    const onClose = vi.fn();
    const { container } = render(
      <ModalApp extraction={extraction} sourceUrl="https://linkedin.com/x" onClose={onClose} />,
    );
    await waitFor(() => expect(screen.getByText('Choose a profile')).toBeInTheDocument());
    const backdrop = container.querySelector('.ea-backdrop')!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('Tab cycles within the modal (focus trap)', async () => {
    mockSendMessage();
    const onClose = vi.fn();
    render(
      <ModalApp extraction={extraction} sourceUrl="https://linkedin.com/x" onClose={onClose} />,
    );
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByTestId('profile-p1')).toBeInTheDocument());

    const dialog = screen.getByRole('dialog');
    const focusables = dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const last = focusables[focusables.length - 1]!;
    last.focus();
    expect(document.activeElement).toBe(last);
    await user.tab();
    expect(document.activeElement).toBe(focusables[0]);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(last);
  });

  it('shows the load error path when sendMessage rejects', async () => {
    (chrome.runtime.lastError as unknown) = { message: 'boom' };
    (chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_msg: unknown, cb?: (reply: unknown) => void) => {
        if (cb) queueMicrotask(() => cb(undefined));
        return Promise.reject(new Error('boom'));
      },
    );
    render(
      <ModalApp
        extraction={extraction}
        sourceUrl="https://linkedin.com/x"
        onClose={() => undefined}
      />,
    );
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('boom'));
  });

  it('shows a warning when no email was detected', async () => {
    mockSendMessage();
    render(
      <ModalApp
        extraction={{ ...extraction, email: null }}
        sourceUrl="https://x"
        onClose={() => undefined}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/No recipient email/i),
    );
  });

  it('shows the queue-failed toast when SW replies !ok', async () => {
    mockSendMessage(
      { type: 'LIST_PROFILES_FOR_SEND', ok: true, profiles },
      { type: 'ERROR', message: 'quota exceeded' },
    );
    render(
      <ModalApp extraction={extraction} sourceUrl="https://x" onClose={() => undefined} />,
    );
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Choose a profile')).toBeInTheDocument());
    await user.click(screen.getByTestId('profile-p1'));
    await user.click(screen.getByTestId('category-c1'));
    await user.click(screen.getByTestId('continue-to-preview'));
    await user.click(screen.getByTestId('send-button'));
    await waitFor(() =>
      expect(screen.getByTestId('ea-toast')).toHaveTextContent(/quota exceeded/i),
    );
  });
});
