'use client';

import { useState } from 'react';
import { AuthStatus } from '@/types/telegram';
import {
  setupCredentials,
  startLogin,
  submitLoginCode,
  submitLoginPassword,
} from '@/lib/client';
import ThemeToggle from './ThemeToggle';
import { BucketIcon, CheckIcon } from './icons';

interface TelegramSetupProps {
  status: AuthStatus | null;
  onAuthorized: (status: AuthStatus) => void;
}

type Step = 'configure' | 'phone' | 'code' | 'password';

export default function TelegramSetup({ status, onAuthorized }: TelegramSetupProps) {
  const [step, setStep] = useState<Step>(status?.configured ? 'phone' : 'configure');
  const [token, setToken] = useState('');
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleConfigure = async () => {
    setError('');
    const id = Number(apiId.trim());
    const hash = apiHash.trim();
    if (!id || !hash) {
      setError('Both the API ID and API hash are required.');
      return;
    }
    setBusy(true);
    try {
      // Credentials persist in the server's SQLite DB — never in this browser.
      await setupCredentials(id, hash);
      setApiId('');
      setApiHash('');
      setStep('phone');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the API credentials.');
    } finally {
      setBusy(false);
    }
  };

  const handleSendCode = async () => {
    setError('');
    const value = phone.trim();
    if (!value) {
      setError('Enter your phone number.');
      return;
    }
    setBusy(true);
    try {
      const result = await startLogin(value);
      setToken(result.token);
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the login code.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyCode = async () => {
    setError('');
    if (!code.trim()) {
      setError('Enter the code you received.');
      return;
    }
    setBusy(true);
    try {
      const result = await submitLoginCode(token, code.trim());
      if ('needsPassword' in result) {
        setStep('password');
      } else if ('authorized' in result && result.authorized) {
        onAuthorized({
          configured: true,
          authorized: true,
          isOwner: result.isOwner,
          phone,
          user: result.user,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify the code.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyPassword = async () => {
    setError('');
    if (!password) {
      setError('Enter your two-factor password.');
      return;
    }
    setBusy(true);
    try {
      const result = await submitLoginPassword(token, password);
      onAuthorized({
        configured: true,
        authorized: true,
        isOwner: result.isOwner,
        phone,
        user: result.user,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete sign in.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setError('');
    setToken('');
    setStep(status?.configured ? 'phone' : 'configure');
  };

  return (
    <div className="relative min-h-screen px-4 py-10">
      <div className="mx-auto mb-6 flex max-w-5xl justify-end">
        <ThemeToggle />
      </div>

      <div className="mx-auto grid max-w-5xl items-start gap-6 lg:grid-cols-2">
        <GuidePanel configured={Boolean(status?.configured)} />

        <div className="rounded-3xl border border-white/20 bg-white/85 p-7 shadow-2xl backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/85">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[#0088cc] to-[#22d3ee] text-white shadow-lg shadow-cyan-500/25">
              <BucketIcon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {step === 'configure' ? 'Welcome, owner' : 'Sign in with Telegram'}
              </h1>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                {step === 'configure'
                  ? 'One-time setup — configure the Telegram app once.'
                  : 'Your phone number is all you need — no API keys.'}
              </p>
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-400">
              {error}
            </p>
          )}

          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (step === 'configure') void handleConfigure();
              if (step === 'phone') void handleSendCode();
              if (step === 'code') void handleVerifyCode();
              if (step === 'password') void handleVerifyPassword();
            }}
          >
            {step === 'configure' && (
              <>
                <Field
                  id="apiId"
                  label="API ID"
                  value={apiId}
                  onChange={setApiId}
                  placeholder="1234567"
                  hint="From https://my.telegram.org — the app you registered."
                  required
                />
                <Field
                  id="apiHash"
                  label="API Hash"
                  value={apiHash}
                  onChange={setApiHash}
                  placeholder="0123456789abcdef0123456789abcdef"
                  hint="Stored in the server database. End users never see or enter this."
                  required
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-[#0088cc] py-2.5 px-4 font-medium text-white transition-colors hover:bg-[#0077b3] disabled:opacity-60"
                >
                  {busy ? 'Saving…' : 'Save credentials'}
                </button>
              </>
            )}

            {step === 'phone' && (
              <>
                <Field
                  id="phone"
                  label="Phone Number"
                  value={phone}
                  onChange={setPhone}
                  placeholder="+1234567890"
                  hint="Telegram sends the login code here."
                  type="tel"
                  required
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-[#0088cc] py-2.5 px-4 font-medium text-white transition-colors hover:bg-[#0077b3] disabled:opacity-60"
                >
                  {busy ? 'Sending code...' : 'Send login code'}
                </button>
              </>
            )}

            {step === 'code' && (
              <>
                <Field
                  id="code"
                  label="Login code"
                  value={code}
                  onChange={setCode}
                  placeholder="12345"
                  hint="The code Telegram just sent you."
                  inputMode="numeric"
                  required
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-[#0088cc] py-2.5 px-4 font-medium text-white transition-colors hover:bg-[#0077b3] disabled:opacity-60"
                >
                  {busy ? 'Signing in...' : "I've entered the code"}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="w-full text-center text-sm text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  Change phone number
                </button>
              </>
            )}

            {step === 'password' && (
              <>
                <Field
                  id="password"
                  label="Two-factor password"
                  value={password}
                  onChange={setPassword}
                  placeholder="••••••••"
                  hint="This account has two-step verification enabled."
                  type="password"
                  required
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-[#0088cc] py-2.5 px-4 font-medium text-white transition-colors hover:bg-[#0077b3] disabled:opacity-60"
                >
                  {busy ? 'Verifying...' : 'Finish sign in'}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="w-full text-center text-sm text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  Restart
                </button>
              </>
            )}
          </form>

          <p className="mt-4 text-center text-xs text-gray-400 dark:text-slate-500">
            API credentials and sessions live on the server — nothing is stored in your browser.
          </p>
        </div>
      </div>
    </div>
  );
}

function GuidePanel({ configured }: { configured: boolean }) {
  const items = configured
    ? [
        'Sign in with your Telegram phone number — no API keys needed.',
        'Each sign-in gets its own account: drives, folders and uploads are per user.',
        'Members of a drive can view and upload files right from the web app.',
        'Large files are split into 100 MB parts and reassembled on download.',
      ]
    : [
        'The instance owner configures the Telegram app credentials once.',
        'Those credentials stay in the server database, never in any browser.',
        'Every other person signs in with just their phone number.',
        'Each user gets their own drives, folders and uploads on top of Telegram.',
      ];

  return (
    <div className="rounded-3xl border border-white/20 bg-white/85 p-7 shadow-2xl backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/85">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#0088cc] to-[#22d3ee] text-white shadow-lg shadow-cyan-500/25">
          <BucketIcon className="h-7 w-7" />
        </span>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Telegram Bucket
        </h2>
      </div>
      <p className="mt-4 text-sm text-gray-600 dark:text-slate-300">
        Turn Telegram into drives everyone on your team can use.
      </p>
      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-sm text-gray-600 dark:text-slate-300">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#0088cc]/15 text-[#0088cc] dark:bg-[#0088cc]/25 dark:text-[#33b5e5]">
              <CheckIcon className="h-3 w-3" />
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        Privacy-first: files stay in Telegram; the index and credentials live only on this server.
      </div>
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  type?: string;
  inputMode?: 'text' | 'numeric' | 'tel' | 'email';
  required?: boolean;
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  type = 'text',
  inputMode,
  required,
}: FieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        inputMode={inputMode}
        autoComplete="off"
        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-gray-800 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#0088cc] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      />
      {hint && <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">{hint}</p>}
    </div>
  );
}