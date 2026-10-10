'use client';

import { useState } from 'react';
import {
  BucketIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FolderUploadIcon,
  LogoutIcon,
  SearchIcon,
  ShareIcon,
  UploadIcon,
  XIcon,
} from './icons';

interface GuideTourProps {
  open: boolean;
  onClose: () => void;
}

interface TourStep {
  icon: typeof BucketIcon;
  title: string;
  body: React.ReactNode;
}

const STEPS: TourStep[] = [
  {
    icon: BucketIcon,
    title: 'Welcome to Telegram Bucket',
    body: (
      <>
        Your own <b>drives</b> built on Telegram. Files you upload are stored as documents
        inside private Telegram groups — this app gives them a Drive-style interface with
        folders, search, sharing and forwarding.
      </>
    ),
  },
  {
    icon: ShareIcon,
    title: 'Where files live',
    body: (
      <>
        Every drive is a <b>private Telegram group</b>. Files you upload are sent there as
        documents, so every member of the group can open them and upload their own — no third
        party ever stores your data.
      </>
    ),
  },
  {
    icon: BucketIcon,
    title: 'Multiple drives',
    body: (
      <>
        Like Google Drive&apos;s shared drives, you can have as many as you want — each one is its
        own group. Use the dropdown in the header to switch, and <b>＋ Add member</b> to invite
        people by phone number.
      </>
    ),
  },
  {
    icon: UploadIcon,
    title: 'Uploading',
    body: (
      <>
        Use the <b>Upload</b> button, drag &amp; drop anywhere on the page, or upload a whole
        folder to keep its structure. Single files up to 2&nbsp;GB.
      </>
    ),
  },
  {
    icon: SearchIcon,
    title: 'Organise & find',
    body: (
      <>
        Create folders with <b>New folder</b>, navigate with the breadcrumb, and use the search box
        to instantly filter everything inside the active drive.
      </>
    ),
  },
  {
    icon: FolderUploadIcon,
    title: 'Copy between drives',
    body: (
      <>
        Hover a file and press the <b>copy icon</b> to forward it into any other drive. Members of the
        target group see it immediately.
      </>
    ),
  },
  {
    icon: LogoutIcon,
    title: 'Delete & logout',
    body: (
      <>
        The bin on a file removes both the index entry and the message from the Telegram drive.
        <b> Logout</b> clears the local session; your files stay safe in Telegram.
      </>
    ),
  },
];

export default function GuideTour({ open, onClose }: GuideTourProps) {
  const [index, setIndex] = useState(0);

  if (!open) return null;

  const step = STEPS[index];
  const StepIcon = step.icon;
  const isLast = index === STEPS.length - 1;

  const next = () => {
    if (isLast) {
      onClose();
      setIndex(0);
    } else {
      setIndex((i) => i + 1);
    }
  };

  const close = () => {
    onClose();
    setIndex(0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/20 bg-white/95 shadow-2xl backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/95">
        <div className="h-1.5 bg-gradient-to-r from-[#0088cc] via-[#7c5cff] to-[#22d3ee]" />

        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#0088cc] to-[#22d3ee] text-white shadow-lg shadow-cyan-500/20">
              <StepIcon className="h-7 w-7" />
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close tour"
              className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>

          <h2 className="mt-5 text-2xl font-bold text-gray-900 dark:text-white">{step.title}</h2>
          <div className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-slate-300">
            {step.body}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {STEPS.map((entry, i) => (
                <span
                  key={entry.title}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === index
                      ? 'w-5 bg-[#0088cc]'
                      : i < index
                        ? 'w-1.5 bg-[#0088cc]/40'
                        : 'w-1.5 bg-gray-300 dark:bg-slate-600'
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
                className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <ChevronLeftIcon className="h-4 w-4" /> Back
              </button>
              <button
                type="button"
                onClick={next}
                className={`flex items-center gap-1.5 rounded-lg bg-[#0088cc] px-4 py-2 text-sm font-semibold text-white shadow-md shadow-cyan-500/25 transition-colors hover:bg-[#0077b3] ${
                  isLast ? 'bg-green-600 hover:bg-green-700 shadow-green-500/25' : ''
                }`}
              >
                {isLast ? (
                  <>
                    <CheckIcon className="h-4 w-4" /> Done
                  </>
                ) : (
                  <>
                    Next <ChevronRightIcon className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>

          <p className="mt-4 text-xs text-gray-400 dark:text-slate-500">
            Step {index + 1} of {STEPS.length}
          </p>
        </div>
      </div>
    </div>
  );
}