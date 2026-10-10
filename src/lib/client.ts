import { AuthStatus, Drive } from '@/types/telegram';
import { Backend, parseResponse } from './backends/types';
import { serverBackend } from './backends/server';

export const {
  fetchItems,
  uploadFile,
  createFolder,
  deleteItem,
  download: downloadItem,
  forwardItem,
} = serverBackend as Backend;

export async function getAuthStatus(): Promise<AuthStatus> {
  const response = await fetch('/api/auth/status', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Could not read authentication status.');
  }
  return (await response.json()) as AuthStatus;
}

export async function listDrives(): Promise<Drive[]> {
  const response = await fetch('/api/drives', { cache: 'no-store' });
  const data = await parseResponse<{ drives: Drive[] }>(response);
  return data.drives;
}

export async function createDrive(title: string): Promise<Drive> {
  const response = await fetch('/api/drives', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  const data = await parseResponse<{ drive: Drive }>(response);
  return data.drive;
}

export async function addDriveMemberApi(driveId: string, phone: string): Promise<void> {
  const response = await fetch(`/api/drives/${encodeURIComponent(driveId)}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  await parseResponse(response);
}

export async function rescanDriveApi(driveId: string): Promise<number> {
  const response = await fetch(`/api/drives/${encodeURIComponent(driveId)}/rescan`, {
    method: 'POST',
  });
  const data = await parseResponse<{ added: number }>(response);
  return data.added;
}

/** Owner-only, one-time: store the Telegram app credentials in the DB. */
export async function setupCredentials(apiId: number, apiHash: string): Promise<void> {
  const response = await fetch('/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiId, apiHash }),
  });
  await parseResponse(response);
}

/** Everyone signs in with just their phone number. */
export async function startLogin(phone: string): Promise<{ token: string; isCodeViaApp: boolean }> {
  const response = await fetch('/api/auth/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  return parseResponse(response);
}

export async function submitLoginCode(
  token: string,
  code: string
): Promise<{ authorized: true; user: AuthStatus['user']; isOwner: boolean } | { needsPassword: true }> {
  const response = await fetch('/api/auth/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, code }),
  });
  return parseResponse(response);
}

export async function submitLoginPassword(
  token: string,
  password: string
): Promise<{ authorized: true; user: AuthStatus['user']; isOwner: boolean }> {
  const response = await fetch('/api/auth/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });
  return parseResponse(response);
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
}