'use client';

import { useState } from 'react';
import { TrashIcon } from './icons';

interface DeleteButtonProps {
  onDelete: () => void | Promise<void>;
}

export default function DeleteButton({ onDelete }: DeleteButtonProps) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        title="Delete from this drive and Telegram"
        className="rounded-lg p-2 text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/50"
      >
        <TrashIcon className="h-[18px] w-[18px]" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-2 py-1 dark:border-red-900/60 dark:bg-red-950/50">
      <button
        type="button"
        onClick={async () => {
          setConfirming(false);
          await onDelete();
        }}
        className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700"
      >
        Delete
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-lg bg-white px-2.5 py-1 text-xs text-gray-700 transition-colors hover:bg-gray-100 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        Cancel
      </button>
    </div>
  );
}