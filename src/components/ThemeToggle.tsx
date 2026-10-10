'use client';

import { useTheme } from './ThemeProvider';
import { MoonIcon, SunIcon } from './icons';

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle dark mode"
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-gray-200/80 bg-white/70 text-gray-600 backdrop-blur transition-colors hover:bg-white hover:text-[#0088cc] dark:border-slate-700/80 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-[#33b5e5]"
    >
      {theme === 'dark' ? (
        <SunIcon className="h-[18px] w-[18px]" />
      ) : (
        <MoonIcon className="h-[18px] w-[18px]" />
      )}
    </button>
  );
}