'use client';

import { useState } from 'react';
import { DriveItem } from '@/types/telegram';
import { CheckIcon, CopyIcon, ShareIcon } from './icons';

interface ShareButtonProps {
  item: DriveItem;
}

export default function ShareButton({ item }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!item.messageId) return null;

  const handleOpen = () => {
    setOpen((value) => !value);
    setCopied(false);
  };

  const handleCopy = async () => {
    const absolute = `${window.location.origin}/api/download?id=${item.id}`;
    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error('Copy failed', error);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleOpen}
        title="Share a download link"
        className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-[#0088cc]/10 dark:text-slate-400 dark:hover:bg-[#0088cc]/20"
      >
        <ShareIcon className="h-[18px] w-[18px]" />
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-40 w-72 rounded-2xl border border-gray-200/80 bg-white/95 p-3 shadow-2xl backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/95">
          <p className="mb-2 truncate text-xs text-gray-500 dark:text-slate-400" title={item.name}>
            {item.name}
          </p>
          <p className="mb-2 text-xs text-gray-500 dark:text-slate-400">
            Anyone with this link can download the file while this app stays connected to the
            account that owns it.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium text-white transition-colors ${
                copied
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-[#0088cc] hover:bg-[#0077b3]'
              }`}
            >
              {copied ? (
                <>
                  <CheckIcon className="h-4 w-4" /> Copied!
                </>
              ) : (
                <>
                  <CopyIcon className="h-4 w-4" /> Copy link
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl bg-gray-100 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}