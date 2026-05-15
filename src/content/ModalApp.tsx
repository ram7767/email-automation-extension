import { useEffect, useMemo, useRef, useState } from 'react';
import { interpolate } from '@/lib/template';
import { sendMessage, type QueueSendPayload } from '@/lib/messages';
import { defaultResumeFor } from '@/lib/profiles-repository';
import type { ProfileIndex, Profile, Category, Resume } from '@/lib/types';
import type { PageExtraction } from './selectors';

export interface ModalAppProps {
  extraction: PageExtraction;
  sourceUrl: string;
  onClose: () => void;
}

type Step = 'pick-profile' | 'pick-category-resume' | 'preview-send';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function defaultSubject(role: string | null, company: string | null): string {
  if (role && company) return `Application: ${role} at ${company}`;
  if (role) return `Application: ${role}`;
  if (company) return `Application at ${company}`;
  return 'Application';
}

function defaultBody(): string {
  return [
    'Hi {{recipientName}},',
    '',
    "I came across your post for {{role}} at {{company}} and wanted to reach out.",
    "I've attached my resume for your review.",
    '',
    'Best,',
    '{{myName}}',
  ].join('\n');
}

export function ModalApp({ extraction, sourceUrl, onClose }: ModalAppProps) {
  const [step, setStep] = useState<Step>('pick-profile');
  const [profilesIndex, setProfilesIndex] = useState<ProfileIndex | null>(null);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [profileId, setProfileId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);

  const [subject, setSubject] = useState<string>(defaultSubject(extraction.role, extraction.company));
  const [body, setBody] = useState<string>(defaultBody());
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLButtonElement | HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingProfiles(true);
      setLoadError(null);
      try {
        const reply = await sendMessage({ type: 'LIST_PROFILES_FOR_SEND' });
        if (cancelled) return;
        if (reply.type === 'ERROR') {
          setLoadError(reply.message);
        } else if (reply.type === 'LIST_PROFILES_FOR_SEND') {
          setProfilesIndex(reply.profiles);
        }
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load profiles.');
      } finally {
        if (!cancelled) setLoadingProfiles(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        onClose();
        return;
      }
      if (ev.key === 'Tab' && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
        ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        const active = document.activeElement as HTMLElement | null;
        if (ev.shiftKey && active === first) {
          ev.preventDefault();
          last.focus();
        } else if (!ev.shiftKey && active === last) {
          ev.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, [step]);

  const profile: Profile | null = useMemo(
    () => profilesIndex?.profiles.find((p) => p.id === profileId) ?? null,
    [profilesIndex, profileId],
  );
  const category: Category | null = useMemo(
    () => profile?.categories.find((c) => c.id === categoryId) ?? null,
    [profile, categoryId],
  );
  const resume: Resume | null = useMemo(
    () => category?.resumes.find((r) => r.id === resumeId) ?? null,
    [category, resumeId],
  );

  const previewSubject = useMemo(
    () =>
      interpolate(subject, {
        recipientName: extraction.recipientName ?? '',
        role: extraction.role ?? '',
        company: extraction.company ?? '',
        myName: profile?.name ?? '',
      }),
    [subject, extraction, profile],
  );

  const previewBody = useMemo(
    () =>
      interpolate(body, {
        recipientName: extraction.recipientName ?? '',
        role: extraction.role ?? '',
        company: extraction.company ?? '',
        myName: profile?.name ?? '',
      }),
    [body, extraction, profile],
  );

  function pickProfile(id: string) {
    setProfileId(id);
    setCategoryId(null);
    setResumeId(null);
    setStep('pick-category-resume');
  }

  function pickCategory(id: string) {
    setCategoryId(id);
    if (profilesIndex && profileId) {
      const def = defaultResumeFor(profilesIndex, profileId, id);
      setResumeId(def?.id ?? null);
    }
  }

  function goPreview() {
    if (!profileId || !categoryId) return;
    setStep('preview-send');
  }

  async function send() {
    if (!profileId || !categoryId || !extraction.email) return;
    setSending(true);
    try {
      const resumeName = resumeId
        ? (category?.resumes.find((r) => r.id === resumeId)?.name ?? null)
        : null;
      const payload: QueueSendPayload = {
        to: extraction.email,
        subject: previewSubject,
        bodyText: previewBody,
        profileName: profile?.name ?? '',
        categoryName: category?.name ?? '',
        resumeName,
        profileId,
        categoryId,
        ...(resumeId ? { attachmentResumeId: resumeId } : {}),
        ...(sourceUrl ? { sourceUrl } : {}),
      };
      const reply = await sendMessage({ type: 'QUEUE_SEND', payload });
      if (reply.type === 'QUEUE_SEND') {
        setToast(`Queued (${reply.jobId}).`);
        setTimeout(() => onClose(), 600);
      } else {
        const msg = reply.type === 'ERROR' ? reply.message : "Couldn't queue send.";
        setToast(msg);
        setSending(false);
      }
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Send failed.');
      setSending(false);
    }
  }

  function onPrimaryEnter(ev: React.KeyboardEvent) {
    if (ev.key !== 'Enter' || ev.shiftKey) return;
    const target = ev.target as HTMLElement;
    if (target.tagName === 'TEXTAREA') return;
    ev.preventDefault();
    if (step === 'pick-profile' && profileId) pickProfile(profileId);
    else if (step === 'pick-category-resume' && categoryId) goPreview();
    else if (step === 'preview-send') void send();
  }

  return (
    <div
      className="ea-backdrop"
      role="presentation"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ea-title"
        className="ea-modal"
        onKeyDown={onPrimaryEnter}
      >
        <header className="ea-modal-header">
          <h2 id="ea-title" className="ea-title">
            Send via EmailAutomation
          </h2>
          <button
            type="button"
            aria-label="Close"
            className="ea-close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="ea-stepper" aria-hidden>
          <span className={`ea-step${step === 'pick-profile' ? ' is-active' : ''}`}>1</span>
          <span className={`ea-step${step === 'pick-category-resume' ? ' is-active' : ''}`}>2</span>
          <span className={`ea-step${step === 'preview-send' ? ' is-active' : ''}`}>3</span>
        </div>

        {!extraction.email && (
          <p className="ea-warning" role="alert">
            No recipient email detected on this page.
          </p>
        )}

        {loadingProfiles && (
          <div className="ea-skeleton" aria-busy="true">
            <div className="ea-skeleton-row" />
            <div className="ea-skeleton-row" />
          </div>
        )}

        {!loadingProfiles && loadError && (
          <p className="ea-error" role="alert">
            {loadError}
          </p>
        )}

        {!loadingProfiles && !loadError && step === 'pick-profile' && (
          <section aria-labelledby="ea-pick-profile">
            <h3 id="ea-pick-profile" className="ea-h3">
              Choose a profile
            </h3>
            {profilesIndex && profilesIndex.profiles.length > 0 ? (
              <ul className="ea-list">
                {profilesIndex.profiles.map((p, idx) => (
                  <li key={p.id}>
                    <button
                      ref={idx === 0 ? (el) => (firstFieldRef.current = el) : undefined}
                      type="button"
                      className={`ea-row${profileId === p.id ? ' is-selected' : ''}`}
                      onClick={() => pickProfile(p.id)}
                      data-testid={`profile-${p.id}`}
                    >
                      <span className="ea-row-title">{p.name}</span>
                      <span className="ea-row-meta">
                        {p.categories.length} categor{p.categories.length === 1 ? 'y' : 'ies'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ea-empty">Add a profile from the popup to start sending.</p>
            )}
          </section>
        )}

        {!loadingProfiles && !loadError && step === 'pick-category-resume' && profile && (
          <section aria-labelledby="ea-pick-cat">
            <h3 id="ea-pick-cat" className="ea-h3">
              {profile.name} &middot; pick category &amp; resume
            </h3>
            <ul className="ea-list">
              {profile.categories.map((c, idx) => {
                const def = defaultResumeFor(profilesIndex, profile.id, c.id);
                return (
                  <li key={c.id}>
                    <button
                      ref={idx === 0 ? (el) => (firstFieldRef.current = el) : undefined}
                      type="button"
                      className={`ea-row${categoryId === c.id ? ' is-selected' : ''}`}
                      onClick={() => pickCategory(c.id)}
                      data-testid={`category-${c.id}`}
                    >
                      <span className="ea-row-title">{c.name}</span>
                      <span className="ea-row-meta">
                        {c.resumes.length} resume{c.resumes.length === 1 ? '' : 's'}
                      </span>
                      {def && <span className="ea-badge">default: {def.name}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>

            {category && category.resumes.length > 0 && (
              <fieldset className="ea-fieldset">
                <legend className="ea-legend">Resume</legend>
                {category.resumes.map((r) => (
                  <label key={r.id} className="ea-radio">
                    <input
                      type="radio"
                      name="ea-resume"
                      value={r.id}
                      checked={resumeId === r.id}
                      onChange={() => setResumeId(r.id)}
                      data-testid={`resume-${r.id}`}
                    />
                    <span>{r.name}</span>
                    {category.defaultResumeId === r.id && (
                      <span className="ea-badge">default</span>
                    )}
                  </label>
                ))}
              </fieldset>
            )}

            {category && (
              <p className="ea-meta">
                {category.descriptionFileId
                  ? 'Description will be appended from your Drive template.'
                  : 'No description template configured for this category.'}
              </p>
            )}

            <div className="ea-actions">
              <button type="button" className="ea-btn ea-btn-ghost" onClick={() => setStep('pick-profile')}>
                Back
              </button>
              <button
                type="button"
                className="ea-btn ea-btn-primary"
                disabled={!categoryId}
                onClick={goPreview}
                data-testid="continue-to-preview"
              >
                Continue
              </button>
            </div>
          </section>
        )}

        {!loadingProfiles && !loadError && step === 'preview-send' && (
          <section aria-labelledby="ea-preview">
            <h3 id="ea-preview" className="ea-h3">
              Preview &amp; send
            </h3>
            <label className="ea-field">
              <span className="ea-label">To</span>
              <input
                className="ea-input"
                type="email"
                value={extraction.email ?? ''}
                readOnly
                data-testid="preview-to"
              />
            </label>
            <label className="ea-field">
              <span className="ea-label">Subject</span>
              <input
                ref={(el) => (firstFieldRef.current = el)}
                className="ea-input"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                data-testid="preview-subject"
              />
            </label>
            <label className="ea-field">
              <span className="ea-label">Body</span>
              <textarea
                className="ea-textarea"
                rows={10}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                data-testid="preview-body"
              />
            </label>

            <details className="ea-details">
              <summary>Rendered preview</summary>
              <p className="ea-meta">
                <strong>Subject:</strong> {previewSubject}
              </p>
              <pre className="ea-pre">{previewBody}</pre>
            </details>

            {resume && <p className="ea-meta">Attachment: {resume.name}</p>}

            <div className="ea-actions">
              <button
                type="button"
                className="ea-btn ea-btn-ghost"
                onClick={() => setStep('pick-category-resume')}
                disabled={sending}
              >
                Back
              </button>
              <button
                type="button"
                className="ea-btn ea-btn-primary"
                disabled={sending || !extraction.email}
                onClick={send}
                data-testid="send-button"
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </section>
        )}

        {toast && (
          <div className="ea-toast" role="status" data-testid="ea-toast">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
