'use client';

import { useEffect, useRef, useState } from 'react';
import { DownloadTask, DriveItem, StorageStats, UploadTask } from '@/types/telegram';
import type { Drive } from '@/types/telegram';
import FileItem from './FileItem';
import StorageMetrics from './StorageMetrics';
import ThemeToggle from './ThemeToggle';
import GuideTour from './GuideTour';
import {
  BucketIcon,
  CheckIcon,
  ChevronDownIcon,
  FolderPlusIcon,
  FolderUploadIcon,
  InfoIcon,
  LogoutIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  SparklesIcon,
  UploadIcon,
  UserPlusIcon,
  XIcon,
} from './icons';

interface DriveProps {
  items: DriveItem[];
  stats: StorageStats;
  breadcrumb: DriveItem[];
  uploading: UploadTask[];
  downloading: DownloadTask[];
  loading: boolean;
  user: string;
  drives: Drive[];
  activeDrive: Drive | null;
  notice: string | null;
  onNavigate: (folder: DriveItem | null) => void;
  onDownload: (item: DriveItem) => void;
  onDelete: (item: DriveItem) => void;
  onForward: (item: DriveItem, toDriveId: string) => void;
  onUploadFiles: (files: File[]) => void;
  onUploadFolder: (files: File[]) => void;
  onCreateFolder: (name: string) => void;
  onSearch: (query: string) => void;
  onSelectDrive: (driveId: string) => void;
  onCreateDrive: (title: string) => void;
  onAddMember: (driveId: string, phone: string) => void;
  onRescan: () => void;
  onLogout: () => void;
}

export default function Drive({
  items,
  stats,
  breadcrumb,
  uploading,
  downloading,
  loading,
  user,
  drives,
  activeDrive,
  notice,
  onNavigate,
  onDownload,
  onDelete,
  onForward,
  onUploadFiles,
  onUploadFolder,
  onCreateFolder,
  onSearch,
  onSelectDrive,
  onCreateDrive,
  onAddMember,
  onRescan,
  onLogout,
}: DriveProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);

  const search = (value: string) => {
    setQuery(value);
    onSearch(value.trim());
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const dropped = Array.from(event.dataTransfer.files);
    if (dropped.length) {
      onUploadFiles(dropped);
    }
  };

  const hasActiveDrive = activeDrive !== null;

  return (
    <div
      className="min-h-screen"
      onDragOver={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragActive(false);
      }}
      onDrop={handleDrop}
    >
      <header className="sticky top-0 z-30 border-b border-gray-200/70 bg-white/75 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#0088cc] to-[#22d3ee] text-white shadow-lg shadow-cyan-500/25">
            <BucketIcon className="h-6 w-6" />
          </div>

          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight text-gray-800 dark:text-white">
              Telegram Bucket
            </h1>
            <p className="truncate text-xs text-gray-500 dark:text-slate-400">
              shared drives on Telegram — every member can view and upload
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <DriveSelector
              drives={drives}
              activeDrive={activeDrive}
              open={selectorOpen}
              onToggle={() => setSelectorOpen((v) => !v)}
              onSelect={(id) => {
                onSelectDrive(id);
                setSelectorOpen(false);
              }}
              onCreate={() => {
                setSelectorOpen(false);
                setCreateOpen(true);
              }}
            />

            <button
              type="button"
              onClick={() => setTourOpen(true)}
              title="Take the tour"
              className="hidden h-9 items-center gap-1.5 rounded-full border border-gray-200/80 bg-white/70 px-3 text-sm text-gray-600 backdrop-blur transition-colors hover:bg-white hover:text-[#0088cc] sm:flex dark:border-slate-700/80 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <SparklesIcon className="h-4 w-4" /> Tour
            </button>
            <button
              type="button"
              onClick={() => setAboutOpen(true)}
              title="About Telegram Bucket"
              aria-label="About Telegram Bucket"
              className="grid h-9 w-9 place-items-center rounded-full border border-gray-200/80 bg-white/70 text-gray-500 backdrop-blur transition-colors hover:bg-white hover:text-[#0088cc] dark:border-slate-700/80 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <InfoIcon className="h-4 w-4" />
            </button>
            <ThemeToggle />

            <div className="mx-1 h-6 w-px bg-gray-200 dark:bg-slate-700" />

            <button
              type="button"
              onClick={() => {
                if (activeDrive) setMemberOpen(true);
              }}
              disabled={!activeDrive}
              title={activeDrive ? 'Add a member by phone number' : 'Create a drive first'}
              className="hidden h-9 items-center gap-1.5 rounded-full border border-gray-200/80 bg-white/70 px-3 text-sm text-gray-600 backdrop-blur transition-colors hover:bg-white hover:text-[#0088cc] disabled:opacity-40 md:flex dark:border-slate-700/80 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <UserPlusIcon className="h-4 w-4" /> Member
            </button>

            <button
              type="button"
              onClick={onLogout}
              title={`Signed in as ${user}`}
              className="grid h-9 w-9 place-items-center rounded-full border border-gray-200/80 bg-white/70 text-gray-500 backdrop-blur transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-slate-700/80 dark:bg-slate-800/70 dark:text-slate-400 dark:hover:border-red-900/60 dark:hover:bg-red-950/40 dark:hover:text-red-400"
            >
              <LogoutIcon className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {notice && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-green-200/80 bg-green-50/90 px-4 py-2.5 text-sm text-green-800 backdrop-blur dark:border-green-900/60 dark:bg-green-950/40 dark:text-green-300">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            {notice}
          </div>
        )}

        {!activeDrive ? (
          <EmptyDrives onCreate={() => setCreateOpen(true)} />
        ) : (
          <>
            <div className="mb-4 grid gap-4 md:grid-cols-[1fr_280px]">
              <Breadcrumb breadcrumb={breadcrumb} onNavigate={onNavigate} />
              <StorageMetrics stats={stats} />
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!!query}
                onClick={() => {
                  const name = window.prompt('Folder name');
                  if (name?.trim()) onCreateFolder(name.trim());
                }}
                title="New folder"
                className="grid h-9 w-9 place-items-center rounded-full border border-gray-300/80 bg-white/70 text-gray-700 backdrop-blur transition-colors hover:bg-white hover:border-[#0088cc] disabled:opacity-40 dark:border-slate-700/80 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <FolderPlusIcon className="h-4 w-4 text-[#0088cc]" />
              </button>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={!activeDrive}
                title="Upload files"
                className="grid h-9 w-9 place-items-center rounded-full border border-gray-300/80 bg-white/70 text-gray-700 backdrop-blur transition-colors hover:bg-white hover:border-[#0088cc] disabled:opacity-40 dark:border-slate-700/80 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <UploadIcon className="h-4 w-4 text-[#0088cc]" />
              </button>

              <button
                type="button"
                onClick={() => folderInput.current?.click()}
                disabled={!activeDrive}
                title="Upload a folder"
                className="grid h-9 w-9 place-items-center rounded-full border border-gray-300/80 bg-white/70 text-gray-700 backdrop-blur transition-colors hover:bg-white hover:border-[#0088cc] disabled:opacity-40 dark:border-slate-700/80 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <FolderUploadIcon className="h-4 w-4 text-[#0088cc]" />
              </button>

              <button
                type="button"
                onClick={onRescan}
                disabled={!activeDrive}
                title="Scan this drive for files added by other members"
                className="grid h-9 w-9 place-items-center rounded-full border border-gray-300/80 bg-white/70 text-gray-700 backdrop-blur transition-colors hover:bg-white hover:border-[#0088cc] disabled:opacity-40 dark:border-slate-700/80 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <RefreshIcon className="h-4 w-4 text-[#0088cc]" />
              </button>

              <button
                type="button"
                onClick={() => setMemberOpen(true)}
                title="Invite someone by phone number"
                className="grid h-9 w-9 place-items-center rounded-full border border-gray-300/80 bg-white/70 text-gray-700 backdrop-blur transition-colors hover:bg-white hover:border-[#0088cc] md:hidden dark:border-slate-700/80 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <UserPlusIcon className="h-4 w-4 text-[#0088cc]" />
              </button>

              <div className="relative ml-auto w-full sm:w-64">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => search(event.target.value)}
                  placeholder="Search this drive..."
                  className="w-full rounded-full border border-gray-300/80 bg-white/70 py-1.5 pl-9 pr-3 text-sm text-gray-700 backdrop-blur placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#0088cc] dark:border-slate-700/80 dark:bg-slate-800/60 dark:text-slate-200 dark:placeholder:text-slate-500"
                />
              </div>
            </div>

            {(uploading.length > 0 || downloading.length > 0) && (
              <div className="mb-4 space-y-2 rounded-2xl border border-cyan-200/70 bg-cyan-50/90 p-4 backdrop-blur dark:border-cyan-900/50 dark:bg-cyan-950/40">
                {uploading.map((task) => (
                  <TaskStatusRow key={task.id} direction="up" task={task} />
                ))}
                {downloading.map((task) => (
                  <TaskStatusRow key={task.id} direction="down" task={task} />
                ))}
              </div>
            )}

            {loading ? (
              <div className="grid place-items-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#0088cc] border-t-transparent" />
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-3xl border-2 border-dashed border-gray-300/80 bg-white/40 py-20 text-center backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/30">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#0088cc]/15 to-[#22d3ee]/15 text-[#0088cc]">
                  <BucketIcon className="h-7 w-7" />
                </div>
                <p className="mt-4 text-lg font-medium text-gray-700 dark:text-slate-200">
                  {query ? 'No matches found' : 'This drive is empty'}
                </p>
                <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                  {query
                    ? 'Try a different search term'
                    : 'Drag & drop files here, or use the Upload button'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <FileItem
                    key={item.id}
                    item={item}
                    drives={drives}
                    onOpen={onNavigate}
                    onDownload={onDownload}
                    onDelete={onDelete}
                    onForward={onForward}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) onUploadFiles(files);
          event.target.value = '';
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        className="hidden"
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) onUploadFolder(files);
          event.target.value = '';
        }}
      />

      {dragActive && hasActiveDrive && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-[#0088cc]/15 backdrop-blur-sm">
          <p className="flex items-center gap-3 rounded-2xl border border-white/30 bg-white/95 px-8 py-5 text-lg font-medium text-[#0088cc] shadow-2xl dark:border-slate-700/60 dark:bg-slate-900/95 dark:text-[#33b5e5]">
            <BucketIcon className="h-6 w-6" /> Drop files to upload
          </p>
        </div>
      )}

      {createOpen && (
        <Modal title="New drive" onClose={() => setCreateOpen(false)}>
          <CreateDriveForm
            onCancel={() => setCreateOpen(false)}
            onSubmit={async (title) => {
              await onCreateDrive(title);
              setCreateOpen(false);
            }}
          />
        </Modal>
      )}

      {memberOpen && activeDrive && (
        <Modal
          title={`Add member to "${activeDrive.title}"`}
          onClose={() => setMemberOpen(false)}
        >
          <AddMemberForm
            onCancel={() => setMemberOpen(false)}
            onSubmit={async (phone) => {
              onAddMember(activeDrive.id, phone);
            }}
          />
        </Modal>
      )}

      <GuideTour open={tourOpen} onClose={() => setTourOpen(false)} />

      {aboutOpen && (
        <Modal title="About Telegram Bucket" onClose={() => setAboutOpen(false)}>
          <AboutCard />
        </Modal>
      )}
    </div>
  );
}

interface EmptyDrivesProps {
  onCreate: () => void;
}

function EmptyDrives({ onCreate }: EmptyDrivesProps) {
  return (
    <div className="rounded-3xl border-2 border-dashed border-gray-300/80 bg-white/40 py-24 text-center backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/30">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-[#0088cc] to-[#22d3ee] text-white shadow-xl shadow-cyan-500/25">
        <BucketIcon className="h-8 w-8" />
      </div>
      <h2 className="mt-6 text-xl font-bold text-gray-800 dark:text-white">
        No drives yet
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-500 dark:text-slate-400">
        Each drive is a private Telegram group. Create one, add members by phone number, and
        everyone on the drive can view and upload files — like a Google Drive shared drive.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mx-auto mt-6 flex items-center gap-2 rounded-full bg-[#0088cc] px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-cyan-500/25 transition-colors hover:bg-[#0077b3]"
      >
        <PlusIcon className="h-4 w-4" /> Create your first drive
      </button>
    </div>
  );
}

interface DriveSelectorProps {
  drives: Drive[];
  activeDrive: Drive | null;
  open: boolean;
  onToggle: () => void;
  onSelect: (driveId: string) => void;
  onCreate: () => void;
}

function DriveSelector({
  drives,
  activeDrive,
  open,
  onToggle,
  onSelect,
  onCreate,
}: DriveSelectorProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onToggle();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onToggle]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="flex h-9 max-w-52 items-center gap-2 rounded-full border border-[#0088cc]/30 bg-[#0088cc]/10 px-3.5 text-sm font-medium text-[#0088cc] transition-colors hover:bg-[#0088cc]/15 dark:border-[#33b5e5]/30 dark:bg-[#0088cc]/15 dark:text-[#33b5e5]"
      >
        <BucketIcon className="h-4 w-4 shrink-0" />
        <span className="truncate">{activeDrive ? activeDrive.title : 'Select a drive'}</span>
        <ChevronDownIcon className="h-4 w-4 shrink-0" />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-72 overflow-hidden rounded-2xl border border-gray-200/80 bg-white/95 shadow-2xl backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/95">
          <div className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
            Drives
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {drives.length === 0 && (
              <p className="px-3 py-3 text-sm text-gray-500 dark:text-slate-400">
                None yet — create one below.
              </p>
            )}
            {drives.map((drive) => (
              <button
                key={drive.id}
                type="button"
                onClick={() => onSelect(drive.id)}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                  activeDrive?.id === drive.id
                    ? 'bg-[#0088cc]/10 font-medium text-[#0088cc] dark:bg-[#0088cc]/15 dark:text-[#33b5e5]'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <BucketIcon className="h-4 w-4 shrink-0" />
                <span className="truncate">{drive.title}</span>
              </button>
            ))}
          </div>
          <div className="border-t border-gray-200/80 p-1 dark:border-slate-700/80">
            <button
              type="button"
              onClick={onCreate}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <PlusIcon className="h-4 w-4 text-[#0088cc]" /> New drive
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface ModalProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}

function Modal({ title, children, onClose }: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-3xl border border-white/20 bg-white/95 shadow-2xl backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/95"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="h-1.5 bg-gradient-to-r from-[#0088cc] via-[#7c5cff] to-[#22d3ee]" />
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

interface CreateDriveFormProps {
  onCancel: () => void;
  onSubmit: (title: string) => Promise<void>;
}

function CreateDriveForm({ onCancel, onSubmit }: CreateDriveFormProps) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!title.trim()) {
      setError('Give the drive a name.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await onSubmit(title.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="mt-4 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300">
          Drive name
        </span>
        <input
          autoFocus
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Design assets"
          maxLength={120}
          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#0088cc] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </label>
      <p className="text-xs leading-relaxed text-gray-500 dark:text-slate-400">
        Creates a <b>private Telegram group</b>. Only members you add can see it, and every member
        can view and upload files — in the web app and Telegram.
      </p>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="flex items-center gap-1.5 rounded-xl bg-[#0088cc] px-4 py-2 text-sm font-medium text-white shadow-md shadow-cyan-500/25 transition-colors hover:bg-[#0077b3] disabled:opacity-60"
        >
          {busy ? 'Creating...' : 'Create drive'}
        </button>
      </div>
    </form>
  );
}

interface AddMemberFormProps {
  onCancel: () => void;
  onSubmit: (phone: string) => Promise<void>;
}

function AddMemberForm({ onCancel, onSubmit }: AddMemberFormProps) {
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const value = phone.trim();
    if (!value) {
      setError('Enter a phone number.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await onSubmit(value);
      onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the member.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="mt-4 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300">
          Phone number
        </span>
        <input
          autoFocus
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="+1234567890"
          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#0088cc] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </label>
      <p className="text-xs leading-relaxed text-gray-500 dark:text-slate-400">
        That person must use Telegram. They will be able to view and upload files in this drive,
        both here and directly in Telegram.
      </p>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="flex items-center gap-1.5 rounded-xl bg-[#0088cc] px-4 py-2 text-sm font-medium text-white shadow-md shadow-cyan-500/25 transition-colors hover:bg-[#0077b3] disabled:opacity-60"
        >
          <UserPlusIcon className="h-4 w-4" />
          {busy ? 'Adding...' : 'Add member'}
        </button>
      </div>
    </form>
  );
}

function AboutCard() {
  return (
    <div className="text-sm leading-relaxed text-gray-600 dark:text-slate-300">
      <p>
        <b>Telegram Bucket</b> turns your Telegram into a Google-Drive-style workspace. Every
        <b> drive</b> is a private Telegram group: upload a file and it is stored there as an
        ordinary document, so every member of the group can open it — right here, and directly in
        Telegram.
      </p>

      <ul className="mt-4 space-y-2">
        <li className="flex gap-2">
          <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#0088cc] dark:text-[#33b5e5]" />
          <span>
            <b>Shared with your team</b> — invite people by phone number; they can view and upload
            files in the drive.
          </span>
        </li>
        <li className="flex gap-2">
          <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#0088cc] dark:text-[#33b5e5]" />
          <span>
            <b>Big files, no limits</b> — anything over 100 MB is split into parts and stitched
            back together on download.
          </span>
        </li>
        <li className="flex gap-2">
          <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#0088cc] dark:text-[#33b5e5]" />
          <span>
            <b>Familiar Drive-style UI</b> — folders, breadcrumbs, search, drag &amp; drop, and
            copying files between drives.
          </span>
        </li>
        <li className="flex gap-2">
          <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#0088cc] dark:text-[#33b5e5]" />
          <span>
            <b>Your data stays yours</b> — files live inside your Telegram groups; the app is only
            the interface and the index.
          </span>
        </li>
      </ul>

      <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        No storage bills, no lock-in. Your files stay in the Telegram app you already use.
      </div>
    </div>
  );
}

interface BreadcrumbProps {
  breadcrumb: DriveItem[];
  onNavigate: (folder: DriveItem | null) => void;
}

interface TaskStatusRowProps {
  direction: 'up' | 'down';
  task: UploadTask | DownloadTask;
}

function TaskStatusRow({ direction, task }: TaskStatusRowProps) {
  const active = task.status === 'uploading' || task.status === 'downloading';
  const fraction = typeof task.progress === 'number' ? Math.max(0, Math.min(1, task.progress)) : 0;
  return (
    <div className="flex items-center gap-2">
      <span
        className={`w-14 shrink-0 text-xs font-semibold tracking-wide ${
          direction === 'up' ? 'text-[#0088cc]' : 'text-[#22d3ee]'
        }`}
      >
        {direction === 'up' ? 'UPLOAD' : 'DOWNLOAD'}
      </span>
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          task.status === 'done'
            ? 'bg-green-500'
            : task.status === 'error'
              ? 'bg-red-500'
              : 'animate-pulse bg-[#0088cc]'
        }`}
      />
      <span className="truncate text-sm text-gray-700 dark:text-slate-200">{task.name}</span>
      <span className="ml-auto shrink-0 text-right">
        {task.status === 'error'
          ? task.error && (
              <span className="text-xs text-red-600 dark:text-red-400">{task.error}</span>
            )
          : task.status === 'done'
            ? <span className="text-xs text-green-600 dark:text-green-400">Done</span>
            : (
                <span className="text-xs tabular-nums text-gray-500 dark:text-slate-400">
                  {Math.round(fraction * 100)}%
                </span>
              )}
      </span>
      {active && (
        <span className="h-1 w-24 shrink-0 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
          <span
            className="block h-full rounded-full bg-gradient-to-r from-[#0088cc] to-[#22d3ee] transition-all"
            style={{ width: `${Math.round(fraction * 100)}%` }}
          />
        </span>
      )}
    </div>
  );
}

function Breadcrumb({ breadcrumb, onNavigate }: BreadcrumbProps) {
  return (
    <nav className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
      <button
        type="button"
        onClick={() => onNavigate(null)}
        className="rounded-full bg-white/70 px-3 py-1.5 font-medium text-[#0088cc] backdrop-blur transition-colors hover:bg-white dark:bg-slate-800/60 dark:text-[#33b5e5]"
      >
        {breadcrumb.length === 0 ? 'All files' : 'Home'}
      </button>
      {breadcrumb.map((folder) => (
        <span key={folder.id} className="flex min-w-0 items-center gap-1.5">
          <span className="text-gray-400 dark:text-slate-500">/</span>
          <button
            type="button"
            onClick={() => onNavigate(folder)}
            className="max-w-40 truncate rounded-full bg-white/70 px-3 py-1.5 text-[#0088cc] backdrop-blur transition-colors hover:bg-white dark:bg-slate-800/60 dark:text-[#33b5e5]"
          >
            {folder.name}
          </button>
        </span>
      ))}
    </nav>
  );
}