'use client';

import { useEffect, useRef, useState } from 'react';
import { Drive, DriveItem } from '@/types/telegram';
import { formatBytes, formatDate } from '@/lib/format';
import ShareButton from './ShareButton';
import DeleteButton from './DeleteButton';
import { BucketIcon, CheckIcon, CopyIcon, DownloadIcon, FolderIcon } from './icons';

interface FileItemProps {
  item: DriveItem;
  drives: Drive[];
  onOpen: (item: DriveItem) => void;
  onDownload: (item: DriveItem) => void;
  onDelete: (item: DriveItem) => void;
  onForward: (item: DriveItem, toDriveId: string) => void;
}

export default function FileItem({
  item,
  drives,
  onOpen,
  onDownload,
  onDelete,
  onForward,
}: FileItemProps) {
  const isFolder = item.type === 'folder';
  const [animate, setAnimate] = useState(false);

  const handleActivate = () => {
    if (isFolder) {
      onOpen(item);
    } else {
      onDownload(item);
    }
  };

  const handleForward = async (toDriveId: string) => {
    await onForward(item, toDriveId);
    setAnimate(true);
    setTimeout(() => setAnimate(false), 1200);
  };

  return (
    <div
      className={`group flex items-center gap-3 rounded-2xl border border-gray-200/70 bg-white/80 px-3 py-2 backdrop-blur transition-all dark:border-slate-700/60 dark:bg-slate-900/60 ${
        animate
          ? 'outline-2 outline-offset-2 outline-green-500'
          : 'hover:border-[#0088cc]/60 hover:shadow-lg hover:shadow-cyan-500/5 dark:hover:border-[#33b5e5]/50'
      }`}
    >
      <button
        type="button"
        onClick={handleActivate}
        className="flex flex-1 items-center gap-3 text-left focus:outline-none min-w-0"
        title={isFolder ? 'Open folder' : 'Download'}
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#0088cc]/10 to-[#22d3ee]/10 text-[#0088cc] dark:from-[#0088cc]/20 dark:to-[#22d3ee]/20 dark:text-[#33b5e5]">
          {isFolder ? <FolderIcon className="h-5 w-5" /> : getFileIcon(item.mimeType)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-gray-800 dark:text-slate-100">
            {item.name}
          </span>
          <span className="block truncate text-xs text-gray-500 dark:text-slate-400">
            {isFolder
              ? 'Folder'
              : item.chunkCount && item.chunkCount > 0
                ? `${item.chunkCount} parts · merged on download`
                : formatBytes(item.size)}{' '}
            · {formatDate(item.uploadedAt)}
          </span>
        </span>
      </button>

      <div className="flex items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {!isFolder && (
          <>
            <TitleButton title="Download" onClick={() => onDownload(item)}>
              <DownloadIcon className="h-[18px] w-[18px] text-[#0088cc] dark:text-[#33b5e5]" />
            </TitleButton>
            <CopyToDrive
              item={item}
              drives={drives}
              onCopy={handleForward}
            />
            <ShareButton item={item} />
          </>
        )}
        <DeleteButton onDelete={() => onDelete(item)} />
      </div>
    </div>
  );
}

function TitleButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="rounded-lg p-2 transition-colors hover:bg-[#0088cc]/10 dark:hover:bg-[#0088cc]/20"
    >
      {children}
    </button>
  );
}

interface CopyToDriveProps {
  item: DriveItem;
  drives: Drive[];
  onCopy: (toDriveId: string) => Promise<void>;
}

function CopyToDrive({ item, drives, onCopy }: CopyToDriveProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const targets = drives.filter((drive) => drive.id !== item.driveId);
  if (targets.length === 0) return null;

  const copy = async (driveId: string) => {
    await onCopy(driveId);
    const drive = drives.find((entry) => entry.id === driveId);
    setCopied(drive?.title ?? 'target');
    setOpen(false);
    setTimeout(() => setCopied(null), 1800);
  };

  return (
    <div ref={ref} className="relative">
      <TitleButton title="Copy to another drive" onClick={() => setOpen((v) => !v)}>
        <CopyIcon className="h-[18px] w-[18px] text-gray-500 dark:text-slate-400" />
      </TitleButton>

      {open && (
        <div className="absolute right-0 top-10 z-40 w-60 overflow-hidden rounded-2xl border border-gray-200/80 bg-white/95 shadow-2xl backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/95">
          <div className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
            Copy to drive
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {targets.map((drive) => (
              <button
                key={drive.id}
                type="button"
                onClick={() => void copy(drive.id)}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-[#0088cc]/10 dark:text-slate-200 dark:hover:bg-[#0088cc]/20"
              >
                <BucketIcon className="h-4 w-4 shrink-0 text-[#0088cc] dark:text-[#33b5e5]" />
                <span className="truncate">{drive.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {copied && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-green-200 bg-green-50/95 px-4 py-2 text-sm text-green-800 shadow-xl backdrop-blur dark:border-green-900/60 dark:bg-green-950/90 dark:text-green-300">
          <CheckIcon className="h-4 w-4" /> Copied to “{copied}”
        </div>
      )}
    </div>
  );
}

function getFileIcon(mimeType?: string): React.ReactNode {
  if (!mimeType) return <FileGlyph>txt</FileGlyph>;

  if (mimeType.includes('image')) return <FileGlyph>img</FileGlyph>;
  if (mimeType.includes('video')) return <FileGlyph>vid</FileGlyph>;
  if (mimeType.includes('audio')) return <FileGlyph>aud</FileGlyph>;
  if (mimeType.includes('pdf')) return <FileGlyph>pdf</FileGlyph>;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel'))
    return <FileGlyph>xls</FileGlyph>;
  if (mimeType.includes('word') || mimeType.includes('document'))
    return <FileGlyph>doc</FileGlyph>;
  if (mimeType.includes('text')) return <FileGlyph>txt</FileGlyph>;
  if (mimeType.includes('zip') || mimeType.includes('compressed'))
    return <FileGlyph>zip</FileGlyph>;

  return <FileGlyph>bin</FileGlyph>;
}

function FileGlyph({ children }: { children: string }) {
  return (
    <span className="px-1 text-[8px] font-bold tracking-tighter text-[#0088cc] dark:text-[#33b5e5]">
      {children}
    </span>
  );
}