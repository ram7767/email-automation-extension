import { useSignals } from '@preact/signals-react/runtime';
import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  FileText,
  FolderPlus,
  Plus,
  Star,
  StarOff,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { AppDialog } from '@/components/AppDialog';
import { AppEmptyState } from '@/components/AppEmptyState';
import { AppErrorState } from '@/components/AppErrorState';
import { AppInput } from '@/components/AppInput';
import { send } from '@/lib/messages';
import { profiles$ } from '@/lib/state';
import type { Category, Profile } from '@/lib/types';

type LoadState = 'loading' | 'data' | 'error';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export function App() {
  useSignals();
  const [load, setLoad] = useState<LoadState>('loading');
  const [bootError, setBootError] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const reply = await send({ type: 'BOOTSTRAP_DRIVE' });
        if (reply.type === 'BOOTSTRAP_DRIVE') {
          profiles$.value = reply.profiles;
          setLoad('data');
        } else if (reply.type === 'ERROR') {
          setBootError(reply.message);
          setLoad('error');
        }
      } catch (e) {
        setBootError(e instanceof Error ? e.message : String(e));
        setLoad('error');
      }
    })();
  }, []);

  const index = profiles$.value;
  const profiles = useMemo(() => index?.profiles ?? [], [index]);
  const selectedProfile = useMemo<Profile | null>(
    () => profiles.find((p) => p.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );
  const selectedCategory = useMemo<Category | null>(
    () =>
      selectedProfile?.categories.find((c) => c.id === selectedCategoryId) ?? null,
    [selectedProfile, selectedCategoryId],
  );

  async function refresh() {
    const reply = await send({ type: 'REFRESH_PROFILES' });
    if (reply.type === 'REFRESH_PROFILES') profiles$.value = reply.profiles;
  }

  async function handleCreateProfile(name: string) {
    setActionError(null);
    try {
      const reply = await send({ type: 'CREATE_PROFILE', payload: { name } });
      if (reply.type === 'CREATE_PROFILE') {
        await refresh();
        setSelectedProfileId(reply.profile.id);
        setShowProfileDialog(false);
      } else if (reply.type === 'ERROR') {
        setActionError(reply.message);
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleCreateCategory(name: string) {
    if (!selectedProfile) return;
    setActionError(null);
    try {
      const reply = await send({
        type: 'CREATE_CATEGORY',
        payload: { profileId: selectedProfile.id, name },
      });
      if (reply.type === 'CREATE_CATEGORY') {
        await refresh();
        setSelectedCategoryId(reply.category.id);
        setShowCategoryDialog(false);
      } else if (reply.type === 'ERROR') {
        setActionError(reply.message);
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  if (load === 'loading') {
    return (
      <main className="mx-auto max-w-[1024px] p-6 md:p-8">
        <div className="flex flex-col gap-4" aria-busy="true" data-testid="opt-loading">
          <div className="h-6 w-48 bg-surface-2 rounded animate-pulse" />
          <div className="h-32 w-full bg-surface-2 rounded animate-pulse" />
          <div className="h-32 w-full bg-surface-2 rounded animate-pulse" />
        </div>
      </main>
    );
  }

  if (load === 'error') {
    return (
      <main className="mx-auto max-w-[1024px] p-6 md:p-8">
        <AppErrorState
          message={bootError ?? "Couldn't load your Drive. Check your connection and retry."}
          onRetry={() => {
            setLoad('loading');
            setBootError(null);
            setTimeout(() => window.location.reload(), 50);
          }}
        />
      </main>
    );
  }

  const showSidebarOnSmall = !selectedProfile;

  return (
    <main className="mx-auto max-w-[1024px] p-4 md:p-6 lg:p-8 flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Settings</h1>
        <p className="text-xs text-text-muted">
          Manage profiles, categories, and resumes. View history in the mobile app.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <aside
          className={`md:col-span-4 lg:col-span-3 flex flex-col gap-3 ${showSidebarOnSmall ? '' : 'hidden md:flex'}`}
        >
          <AppCard>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-text">Profiles</h2>
              <AppButton
                variant="ghost"
                onClick={() => setShowProfileDialog(true)}
                aria-label="Add profile"
              >
                <UserPlus className="w-4 h-4" aria-hidden />
                Profile
              </AppButton>
            </div>
            {profiles.length === 0 ? (
              <AppEmptyState
                title="Add your first profile"
                description="Profiles group categories like Flutter, Swift, or Backend."
                action={
                  <AppButton onClick={() => setShowProfileDialog(true)}>
                    <Plus className="w-4 h-4" aria-hidden /> New profile
                  </AppButton>
                }
              />
            ) : (
              <ul className="flex flex-col gap-1" data-testid="profile-list">
                {profiles.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProfileId(p.id);
                        setSelectedCategoryId(null);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        p.id === selectedProfileId
                          ? 'bg-surface-2 text-text'
                          : 'text-text-muted hover:bg-surface-2 hover:text-text'
                      }`}
                    >
                      {p.name}
                      <span className="ml-2 text-xs text-text-muted">
                        {p.categories.length}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </AppCard>
        </aside>

        <section
          className={`md:col-span-8 lg:col-span-9 flex flex-col gap-4 ${showSidebarOnSmall ? 'hidden md:flex' : ''}`}
        >
          {!selectedProfile && (
            <AppEmptyState
              title="Pick a profile to manage"
              description="Choose a profile on the left to view its categories."
            />
          )}

          {selectedProfile && !selectedCategory && (
            <ProfileView
              profile={selectedProfile}
              onBack={() => setSelectedProfileId(null)}
              onAddCategory={() => setShowCategoryDialog(true)}
              onSelectCategory={(id) => setSelectedCategoryId(id)}
            />
          )}

          {selectedProfile && selectedCategory && (
            <CategoryView
              category={selectedCategory}
              onBack={() => setSelectedCategoryId(null)}
              onChange={refresh}
            />
          )}

          {actionError && (
            <p role="alert" className="text-sm text-danger">
              {actionError}
            </p>
          )}
        </section>
      </div>

      <NewProfileDialog
        open={showProfileDialog}
        onClose={() => setShowProfileDialog(false)}
        onSubmit={handleCreateProfile}
      />
      <NewCategoryDialog
        open={showCategoryDialog}
        onClose={() => setShowCategoryDialog(false)}
        onSubmit={handleCreateCategory}
      />
    </main>
  );
}

interface ProfileViewProps {
  profile: Profile;
  onBack: () => void;
  onAddCategory: () => void;
  onSelectCategory: (id: string) => void;
}

function ProfileView({ profile, onBack, onAddCategory, onSelectCategory }: ProfileViewProps) {
  return (
    <AppCard>
      <header className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="md:hidden text-text-muted hover:text-text"
            aria-label="Back to profiles"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden />
          </button>
          <h2 className="text-base font-medium text-text">{profile.name}</h2>
        </div>
        <AppButton onClick={onAddCategory} aria-label="Add category">
          <FolderPlus className="w-4 h-4" aria-hidden /> Category
        </AppButton>
      </header>

      {profile.categories.length === 0 ? (
        <AppEmptyState
          title="Add your first category"
          description="A category bundles a description, an email template, and resumes."
          action={
            <AppButton onClick={onAddCategory}>
              <Plus className="w-4 h-4" aria-hidden /> New category
            </AppButton>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2" data-testid="category-list">
          {profile.categories.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelectCategory(c.id)}
                className="w-full text-left px-3 py-3 rounded-md bg-surface-2 hover:bg-[var(--color-border)] text-sm text-text"
              >
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-text-muted mt-1">
                  {c.resumes.length} resume{c.resumes.length === 1 ? '' : 's'}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </AppCard>
  );
}

interface CategoryViewProps {
  category: Category;
  onBack: () => void;
  onChange: () => Promise<void>;
}

function CategoryView({ category, onBack, onChange }: CategoryViewProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [template, setTemplate] = useState('');
  const [descDirty, setDescDirty] = useState(false);
  const [tmplDirty, setTmplDirty] = useState(false);

  useEffect(() => {
    setDescription('');
    setTemplate('');
    setDescDirty(false);
    setTmplDirty(false);
  }, [category.id]);

  async function handleUpload(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const dataBase64 = await fileToBase64(file);
      const reply = await send({
        type: 'UPLOAD_RESUME',
        payload: {
          categoryId: category.id,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          dataBase64,
        },
      });
      if (reply.type === 'ERROR') setErr(reply.message);
      else await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(resumeId: string) {
    setBusy(true);
    setErr(null);
    try {
      const reply = await send({
        type: 'DELETE_RESUME',
        payload: { categoryId: category.id, resumeId },
      });
      if (reply.type === 'ERROR') setErr(reply.message);
      else await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSetDefault(resumeId: string) {
    setBusy(true);
    setErr(null);
    try {
      const reply = await send({
        type: 'SET_DEFAULT_RESUME',
        payload: { categoryId: category.id, resumeId },
      });
      if (reply.type === 'ERROR') setErr(reply.message);
      else await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveDescription() {
    setBusy(true);
    setErr(null);
    try {
      const reply = await send({
        type: 'UPDATE_DESCRIPTION',
        payload: { categoryId: category.id, body: description },
      });
      if (reply.type === 'ERROR') setErr(reply.message);
      else {
        setDescDirty(false);
        await onChange();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveTemplate() {
    setBusy(true);
    setErr(null);
    try {
      const reply = await send({
        type: 'UPDATE_TEMPLATE',
        payload: { categoryId: category.id, body: template },
      });
      if (reply.type === 'ERROR') setErr(reply.message);
      else {
        setTmplDirty(false);
        await onChange();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <AppCard>
        <header className="flex items-center justify-between mb-3 gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="text-text-muted hover:text-text"
              aria-label="Back to categories"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden />
            </button>
            <h2 className="text-base font-medium text-text">{category.name}</h2>
          </div>
          <label className="inline-flex items-center gap-2 px-3 h-9 rounded-md bg-primary text-white text-sm cursor-pointer hover:bg-primary-hover">
            <Upload className="w-4 h-4" aria-hidden />
            Upload resume
            <input
              type="file"
              className="hidden"
              data-testid="resume-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUpload(f);
                e.target.value = '';
              }}
              disabled={busy}
            />
          </label>
        </header>

        {category.resumes.length === 0 ? (
          <AppEmptyState
            title="Upload your first resume"
            description="PDF, DOCX, or TXT files up to 10 MB."
          />
        ) : (
          <ul className="flex flex-col gap-2" data-testid="resume-list">
            {category.resumes.map((r) => {
              const isDefault = category.defaultResumeId === r.id;
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-surface-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-text-muted" aria-hidden />
                    <span className="text-sm text-text truncate">{r.name}</span>
                    {isDefault && (
                      <span className="text-xs uppercase px-2 py-0.5 rounded bg-primary/20 text-primary">
                        Default
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleSetDefault(r.id)}
                      disabled={busy || isDefault}
                      aria-label={isDefault ? 'Already default' : 'Set as default'}
                      className="p-2 rounded-md text-text-muted hover:text-text disabled:opacity-50"
                    >
                      {isDefault ? (
                        <Star className="w-4 h-4" aria-hidden />
                      ) : (
                        <StarOff className="w-4 h-4" aria-hidden />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(r.id)}
                      disabled={busy}
                      aria-label={`Delete ${r.name}`}
                      className="p-2 rounded-md text-text-muted hover:text-danger disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </AppCard>

      <AppCard>
        <h3 className="text-sm font-medium text-text mb-2">Description</h3>
        <textarea
          aria-label="Description"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setDescDirty(true);
          }}
          rows={5}
          className="w-full bg-surface-2 border border-border rounded-md p-2 text-sm text-text outline-none focus:border-primary"
          placeholder="What this category is about"
        />
        <div className="mt-2 flex justify-end">
          <AppButton onClick={saveDescription} disabled={!descDirty} loading={busy}>
            Save description
          </AppButton>
        </div>
      </AppCard>

      <AppCard>
        <h3 className="text-sm font-medium text-text mb-2">Email template</h3>
        <textarea
          aria-label="Email template"
          value={template}
          onChange={(e) => {
            setTemplate(e.target.value);
            setTmplDirty(true);
          }}
          rows={8}
          className="w-full bg-surface-2 border border-border rounded-md p-2 text-sm text-text font-mono outline-none focus:border-primary"
          placeholder="Subject: …\nBody…"
        />
        <p className="text-xs text-text-muted mt-1">
          Allowed placeholders: {'{{recipientName}}'}, {'{{role}}'}, {'{{company}}'},{' '}
          {'{{myName}}'}, {'{{myLink}}'}.
        </p>
        <div className="mt-2 flex justify-end">
          <AppButton onClick={saveTemplate} disabled={!tmplDirty} loading={busy}>
            Save template
          </AppButton>
        </div>
      </AppCard>

      {err && (
        <p role="alert" className="text-sm text-danger">
          {err}
        </p>
      )}
    </div>
  );
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void> | void;
}

function NewProfileDialog({ open, onClose, onSubmit }: DialogProps) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) {
      setName('');
      setBusy(false);
    }
  }, [open]);
  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="New profile"
      footer={
        <>
          <AppButton variant="ghost" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton
            onClick={async () => {
              if (!name.trim()) return;
              setBusy(true);
              await onSubmit(name.trim());
              setBusy(false);
            }}
            loading={busy}
            disabled={!name.trim()}
          >
            Create
          </AppButton>
        </>
      }
    >
      <AppInput
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Flutter"
        autoFocus
      />
    </AppDialog>
  );
}

function NewCategoryDialog({ open, onClose, onSubmit }: DialogProps) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) {
      setName('');
      setBusy(false);
    }
  }, [open]);
  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="New category"
      footer={
        <>
          <AppButton variant="ghost" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton
            onClick={async () => {
              if (!name.trim()) return;
              setBusy(true);
              await onSubmit(name.trim());
              setBusy(false);
            }}
            loading={busy}
            disabled={!name.trim()}
          >
            Create
          </AppButton>
        </>
      }
    >
      <AppInput
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Senior Developer"
        autoFocus
      />
    </AppDialog>
  );
}
