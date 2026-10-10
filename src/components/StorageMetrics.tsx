'use client';

import { StorageStats } from '@/types/telegram';
import { formatBytes } from '@/lib/format';
import { BucketIcon } from './icons';

interface StorageMetricsProps {
  stats: StorageStats;
}

export default function StorageMetrics({ stats }: StorageMetricsProps) {
  return (
    <div className="rounded-2xl border border-gray-200/70 bg-white/80 p-4 backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/60">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-slate-200">
          <BucketIcon className="h-4 w-4 text-[#0088cc] dark:text-[#33b5e5]" /> Storage
        </h3>
        <span className="text-xs text-gray-400 dark:text-slate-500">
          {stats.fileCount} files · {stats.folderCount} folders
        </span>
      </div>
      <p className="text-2xl font-semibold text-gray-800 dark:text-white">
        {formatBytes(stats.usedBytes)}
      </p>
      <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
        stored in Telegram — storage is unlimited
      </p>
    </div>
  );
}