import { TelegramClient, Api } from 'teleproto';
import { StringSession } from 'teleproto/sessions';
import bigInt from 'big-integer';
import {
  createPendingLogin,
  deletePendingLogin,
  getPendingLogin,
  getSettingOrNull,
  setSetting,
  getUserById,
  upsertUser,
} from './db';
import { getDrive, getItemByManifest, listDrives as listRegisteredDrives, saveChunkedItem, upsertDrive } from './store';
import { AuthStatus, AuthUser, Drive } from '@/types/telegram';
import { newToken } from './auth';

export class TelegramConfigError extends Error {}
export class TelegramAuthError extends Error {}
export class TelegramApiError extends Error {
  constructor(
    message: string,
    public readonly description?: string,
    public readonly status?: number
  ) {
    super(message);
  }
}

const SETTING_KEYS = {
  apiId: 'api_id',
  apiHash: 'api_hash',
  ownerUserId: 'owner_user_id',
} as const;

export const MANIFEST_PREFIX = 'TB-BUCKET-MANIFEST:v1:';

interface MtState {
  clients: Map<string, TelegramClient>;
  pending: Map<string, TelegramClient>;
  /** Cached "drive ids this user is a member of", validated against Telegram dialogs. */
  memberCache: Map<string, { ids: Set<string>; at: number }>;
}

const MEMBER_TTL_MS = 60 * 1000;

const globalRef = globalThis as unknown as { __teleBucket?: MtState };

function state(): MtState {
  if (!globalRef.__teleBucket) {
    globalRef.__teleBucket = { clients: new Map(), pending: new Map(), memberCache: new Map() };
  }
  return globalRef.__teleBucket;
}

/**
 * Resolve the Telegram API credentials (env overrides first, then the global
 * settings table). These are the values the instance owner configured once.
 */
export async function getConfig(): Promise<{ apiId?: number; apiHash?: string }> {
  const envApiId = process.env.TELEGRAM_API_ID;
  const envApiHash = process.env.TELEGRAM_API_HASH;

  const apiId = envApiId ? Number(envApiId) : Number(await getSettingOrNull(SETTING_KEYS.apiId)) || undefined;
  const apiHash = envApiHash || (await getSettingOrNull(SETTING_KEYS.apiHash)) || undefined;

  return { apiId, apiHash };
}

export async function isConfigured(): Promise<boolean> {
  const cfg = await getConfig();
  return Boolean(cfg.apiId && cfg.apiHash);
}

/**
 * Owner-only: persist the Telegram app credentials in the local DB. Refuses to
 * run once configured so end users can never overwrite the owner's app.
 */
export async function saveCredentials(apiId: number, apiHash: string): Promise<void> {
  if (!apiId || !apiHash) {
    throw new TelegramConfigError('API ID and API hash are both required.');
  }
  if (await isConfigured()) {
    throw new TelegramApiError('Telegram API credentials are already configured.');
  }
  await setSetting(SETTING_KEYS.apiId, String(apiId));
  await setSetting(SETTING_KEYS.apiHash, apiHash);
}

export async function getOwnerUserId(): Promise<string | null> {
  return (await getSettingOrNull(SETTING_KEYS.ownerUserId)) ?? null;
}

async function setOwnerUserId(userId: string): Promise<void> {
  await setSetting(SETTING_KEYS.ownerUserId, userId);
}

export async function getUserInfo(userId: string): Promise<AuthUser> {
  const row = await getUserById(userId);
  return {
    id: userId,
    firstName: row?.first_name ?? undefined,
    lastName: row?.last_name ?? undefined,
    username: row?.username ?? undefined,
    phone: row?.phone ?? undefined,
  };
}

export async function getAuthStatus(userId: string | null): Promise<AuthStatus> {
  const configured = await isConfigured();
  if (!userId) {
    return { configured, authorized: false };
  }
  const row = await getUserById(userId);
  if (!row) {
    return { configured, authorized: false };
  }
  const owner = await getOwnerUserId();
  return {
    configured,
    authorized: true,
    isOwner: owner === userId,
    phone: row.phone ?? undefined,
    user: {
      id: userId,
      firstName: row.first_name ?? undefined,
      lastName: row.last_name ?? undefined,
      username: row.username ?? undefined,
      phone: row.phone ?? undefined,
    },
  };
}

function toTelegramError(error: unknown, fallback: string): TelegramApiError {
  const candidate = error as { errorMessage?: string; message?: string };
  const description = candidate?.errorMessage || candidate?.message;
  return new TelegramApiError(fallback, description);
}

/* ---------------------------------------------------------------------------
 * Login flow
 *
 * The owner configures the Telegram app credentials once (global settings).
 * Every user — including the owner — then signs in with their phone number;
 * the resulting MTProto session is stored per user in the `users` table. The
 * first successful sign-in becomes the owner, and the instance is a hosted
 * multi-user service.
 * ------------------------------------------------------------------------ */

async function connectLoginClient(): Promise<TelegramClient> {
  const cfg = await getConfig();
  if (!cfg.apiId || !cfg.apiHash) {
    throw new TelegramConfigError('Telegram API credentials are not configured yet.');
  }
  const client = new TelegramClient(new StringSession(''), cfg.apiId, cfg.apiHash, {
    connectionRetries: 5,
  });
  await client.connect();
  return client;
}

export async function startLogin(phone: string): Promise<{ token: string; isCodeViaApp: boolean }> {
  const client = await connectLoginClient();
  const cfg = await getConfig();
  if (!cfg.apiId || !cfg.apiHash) {
    throw new TelegramConfigError('Telegram API credentials are not configured yet.');
  }
  const result = await client.sendCode({ apiId: cfg.apiId, apiHash: cfg.apiHash }, phone);

  if (result.emailRequired || result.emailCodeSent) {
    throw new TelegramApiError(
      'Telegram is asking for email verification, which this app does not support yet.'
    );
  }

  const token = newToken();
  state().pending.set(token, client);
  await createPendingLogin(token, phone, result.phoneCodeHash, 15 * 60 * 1000);
  return { token, isCodeViaApp: result.isCodeViaApp };
}

function isPasswordNeeded(error: unknown): boolean {
  const candidate = error as { errorMessage?: string; message?: string };
  const text = `${candidate?.errorMessage ?? ''} ${candidate?.message ?? ''}`;
  return text.includes('SESSION_PASSWORD_NEEDED') || text.includes('PASSWORD_NEEDED');
}

export async function submitLoginCode(
  token: string,
  code: string
): Promise<{ authorized: true; user: AuthUser; isOwner: boolean } | { needsPassword: true }> {
  const pending = await getPendingLogin(token);
  if (!pending) {
    throw new TelegramApiError('This login has expired. Request a new code.');
  }
  const client = state().pending.get(token);
  if (!client) {
    throw new TelegramApiError('This login is no longer in progress. Request a new code.');
  }

  try {
    await client.invoke(
      new Api.auth.SignIn({
        phoneNumber: pending.phone,
        phoneCodeHash: pending.phone_code_hash,
        phoneCode: code,
      })
    );
  } catch (error) {
    if (isPasswordNeeded(error)) {
      return { needsPassword: true };
    }
    throw toTelegramError(error, 'Could not verify the login code.');
  }

  const result = await finalizeLogin(token, client, pending.phone);
  return { authorized: true, user: result.user, isOwner: result.isOwner };
}

export async function submitLoginPassword(
  token: string,
  password: string
): Promise<{ authorized: true; user: AuthUser; isOwner: boolean }> {
  const pending = await getPendingLogin(token);
  if (!pending) {
    throw new TelegramApiError('This login has expired. Request a new code.');
  }
  const client = state().pending.get(token);
  if (!client) {
    throw new TelegramApiError('This login is no longer in progress. Request a new code.');
  }

  const cfg = await getConfig();
  if (!cfg.apiId || !cfg.apiHash) {
    throw new TelegramConfigError('Telegram API credentials are not configured yet.');
  }

  try {
    await client.signInWithPassword(
      { apiId: cfg.apiId, apiHash: cfg.apiHash },
      { password: async () => password, onError: () => undefined }
    );
  } catch (error) {
    throw toTelegramError(error, 'Two-factor password was rejected.');
  }

  const result = await finalizeLogin(token, client, pending.phone);
  return { authorized: true, user: result.user, isOwner: result.isOwner };
}

async function finalizeLogin(
  token: string,
  client: TelegramClient,
  phone: string
): Promise<{ user: AuthUser; isOwner: boolean }> {
  const session = client.session.save();
  const me = (await client.getMe()) as Api.User;
  const userId = String(me.id);

  const row = await upsertUser({
    id: userId,
    phone,
    firstName: me.firstName || undefined,
    lastName: me.lastName || undefined,
    username: me.username || undefined,
    session: typeof session === 'string' ? session : undefined,
  });

  // Keep this client warm for the freshly logged-in user.
  state().pending.delete(token);
  state().clients.set(userId, client);
  await deletePendingLogin(token);

  let isOwner = false;
  const existingOwner = await getOwnerUserId();
  if (!existingOwner) {
    await setOwnerUserId(userId);
    isOwner = true;
  } else {
    isOwner = existingOwner === userId;
  }

  return { user: publicUser(row), isOwner };
}

function publicUser(row: {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  phone: string | null;
}): AuthUser {
  return {
    id: row.id,
    firstName: row.first_name ?? undefined,
    lastName: row.last_name ?? undefined,
    username: row.username ?? undefined,
    phone: row.phone ?? undefined,
  };
}

/* ---------------------------------------------------------------------------
 * Authenticated per-user clients
 * ------------------------------------------------------------------------ */

async function getClientForUser(userId: string): Promise<TelegramClient> {
  const s = state();
  const cfg = await getConfig();
  if (!cfg.apiId || !cfg.apiHash) {
    throw new TelegramConfigError('Telegram API credentials are not configured yet.');
  }

  const cached = s.clients.get(userId);
  if (cached) return cached;

  const row = await getUserById(userId);
  if (!row?.session) {
    throw new TelegramAuthError('This account is not signed in. Sign in again.');
  }

  const client = new TelegramClient(new StringSession(row.session), cfg.apiId, cfg.apiHash, {
    connectionRetries: 5,
  });
  await client.connect();
  const authorized = await client.isUserAuthorized();
  if (!authorized) {
    await client.disconnect();
    throw new TelegramAuthError('This Telegram session expired. Sign in again.');
  }

  s.clients.set(userId, client);
  return client;
}

export async function disconnectUser(userId: string): Promise<void> {
  const s = state();
  s.memberCache.delete(userId);
  const client = s.clients.get(userId);
  if (client) {
    try {
      await client.disconnect();
    } catch {
      // ignore
    }
    s.clients.delete(userId);
  }
}

function channelInput(drive: Pick<Drive, 'id' | 'accessHash'>): Api.InputChannel {
  return new Api.InputChannel({
    channelId: bigInt(drive.id),
    accessHash: bigInt(drive.accessHash),
  });
}

/* ---------------------------------------------------------------------------
 * Drives
 * ------------------------------------------------------------------------ */

async function listChannels(userId: string): Promise<Api.Channel[]> {
  const client = await getClientForUser(userId);
  const dialogs = await client.getDialogs({ limit: 300 });
  const channels: Api.Channel[] = [];

  for (const dialog of dialogs) {
    if (!dialog.isChannel) continue;
    const entity = dialog.entity;
    if (!entity || entity.className !== 'Channel') continue;
    const channel = entity as unknown as Api.Channel;
    if (channel.min || channel.left || !channel.accessHash || channel.accessHash.isZero()) continue;
    // A "drive" is a private channel/group this account belongs to. Public
    // communities the account merely follows must not show up as drives.
    if (channel.username) continue;
    channels.push(channel);
  }

  return channels;
}

export async function listDrives(userId: string): Promise<Drive[]> {
  const registered = await listRegisteredDrives();
  if (registered.length === 0) return [];

  // Only drives created through the app are listed; each drive is a channel
  // recorded in the local registry. We still intersect with the account's own
  // channels so a drive only appears for members who can actually access it.
  let memberIds = new Set<string>();
  try {
    const channels = await listChannels(userId);
    memberIds = new Set(channels.map((channel) => channel.id.toString()));
  } catch {
    // If the dialog list is temporarily unavailable, fall back to the
    // registry so existing members are not locked out.
    return registered;
  }

  return registered.filter((drive) => memberIds.has(drive.id));
}

export async function createDrive(userId: string, title: string): Promise<Drive> {
  const client = await getClientForUser(userId);
  const group = await client.createChannel({
    title,
    about: 'Drive created by Telegram Bucket — all members can view and upload files here.',
    megagroup: true,
  });

  let accessHash = group.accessHash?.toString();
  if (!accessHash || accessHash === '0') {
    // The create response may only carry a minimal entity; resolve the full
    // entity through the account's dialog list instead.
    const channels = await listChannels(userId);
    const full = channels.find((entry) => entry.id.toString() === group.id.toString());
    accessHash = full?.accessHash?.toString();
  }
  if (!accessHash || accessHash === '0') {
    throw new TelegramApiError('Could not resolve the new drive.');
  }

  // A freshly created drive is not in the cached dialog list yet.
  state().memberCache.delete(userId);

  return upsertDrive({
    id: group.id.toString(),
    accessHash,
    title,
  });
}

export async function requireDrive(driveId: string): Promise<Drive> {
  const drive = await getDrive(driveId);
  if (!drive) {
    throw new TelegramApiError('This drive is not available anymore.');
  }
  return drive;
}

/**
 * Whether the signed-in user is a member of a (registered) drive. The dialog
 * list is cached briefly so item reads do not hit Telegram on every request.
 */
export async function isDriveMember(userId: string, driveId: string): Promise<boolean> {
  const s = state();
  const cached = s.memberCache.get(userId);
  if (cached && Date.now() - cached.at < MEMBER_TTL_MS) {
    return cached.ids.has(driveId);
  }

  try {
    const channels = await listChannels(userId);
    const ids = new Set(channels.map((channel) => channel.id.toString()));
    s.memberCache.set(userId, { ids, at: Date.now() });
    return ids.has(driveId);
  } catch {
    // If the dialog list is temporarily unavailable, deny rather than leak.
    return false;
  }
}

/**
 * The shared-drive equivalent of requireDrive: the caller must both know the
 * drive (registered) and actually be a member of it. Every item/upload call
 * goes through this so a user can only ever reach data of drives they belong
 * to.
 */
export async function requireDriveMember(userId: string, driveId: string): Promise<Drive> {
  const drive = await requireDrive(driveId);
  if (!(await isDriveMember(userId, driveId))) {
    throw new TelegramApiError('You are not a member of this drive.', undefined, 403);
  }
  return drive;
}

export async function addDriveMember(userId: string, driveId: string, phone: string): Promise<void> {
  const client = await getClientForUser(userId);
  const drive = await requireDrive(driveId);

  const imported = await client.importContacts([
    {
      phone,
      firstName: 'Bucket',
      lastName: 'Member',
      clientId: Date.now(),
    },
  ]);

  const user = imported.users[0] as Api.User | undefined;
  if (!user) {
    throw new TelegramApiError(
      'No Telegram account found for that phone number. Check the number (include the country code) and try again.'
    );
  }

  try {
    await client.invoke(
      new Api.channels.InviteToChannel({
        channel: channelInput(drive),
        users: [user],
      })
    );
  } catch (error) {
    throw toTelegramError(
      error,
      'Could not add the member. Telegram only allows invites when their "who can add me to channels" privacy permits it.'
    );
  } finally {
    // Do not leave a permanent contact entry behind.
    try {
      await client.deleteContacts([user]);
    } catch {
      // best-effort cleanup
    }
  }
}

/* ---------------------------------------------------------------------------
 * Files
 * ------------------------------------------------------------------------ */

export interface UploadedDocument {
  messageId: number;
  size: number;
  mimeType?: string;
}

export async function uploadDocument(
  userId: string,
  drive: Drive,
  fileName: string,
  buffer: Buffer,
  mimeType?: string
): Promise<UploadedDocument> {
  const client = await getClientForUser(userId);
  // Pass a real File (named Blob): teleproto treats it as an in-memory buffer
  // for any size, whereas a CustomFile with an empty path breaks its >20 MB
  // disk-path branch (the "Either one of `buffer` or `filePath`" error).
  const view = new Uint8Array(buffer.buffer as ArrayBuffer, buffer.byteOffset, buffer.byteLength);
  const file = new File([view], fileName);

  const message = await client.sendFile(channelInput(drive), {
    file,
    forceDocument: true,
    attributes: [new Api.DocumentAttributeFilename({ fileName })],
  });

  const sent = message as Api.Message;
  return {
    messageId: sent.id,
    size: buffer.length,
    mimeType: mimeType || undefined,
  };
}

export async function downloadDocument(
  userId: string,
  drive: Drive,
  messageId: number
): Promise<Buffer | null> {
  const client = await getClientForUser(userId);

  const messages = await client.getMessages(channelInput(drive), { ids: messageId });
  const message = messages[0] as Api.Message | undefined;
  if (!message || !message.media) return null;

  const data = await client.downloadMedia(message, {});
  if (!data) return null;
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

export async function deleteDocuments(
  userId: string,
  drive: Drive,
  messageIds: number[]
): Promise<void> {
  if (!messageIds.length) return;
  const client = await getClientForUser(userId);
  await client.deleteMessages(channelInput(drive), messageIds, { revoke: true });
}

export async function forwardMessages(
  userId: string,
  fromDrive: Drive,
  toDrive: Drive,
  messageIds: number[]
): Promise<number[]> {
  if (!messageIds.length) return [];
  const client = await getClientForUser(userId);

  const messages = await client.getMessages(channelInput(fromDrive), { ids: messageIds });
  const valid = messages.filter((message) => Boolean(message.media));
  if (valid.length === 0) {
    throw new TelegramApiError('The source file is no longer available on Telegram.');
  }

  const forwarded = await client.forwardMessages(channelInput(toDrive), {
    messages: valid.map((message) => message.id),
    fromPeer: channelInput(fromDrive),
  });

  const created = forwarded.filter((message) => Boolean(message?.id)).map((message) => message.id);
  if (created.length === 0) {
    throw new TelegramApiError(
      'Telegram did not confirm the forward. You may not have posting rights in the target drive.'
    );
  }
  return created;
}

export async function forwardDocument(
  userId: string,
  fromDrive: Drive,
  toDrive: Drive,
  messageId: number
): Promise<number> {
  const ids = await forwardMessages(userId, fromDrive, toDrive, [messageId]);
  return ids[0];
}

/* ---------------------------------------------------------------------------
 * Chunked uploads, manifests and shared recovery
 * ------------------------------------------------------------------------ */

export interface ChunkRef {
  seq: number;
  messageId: number;
  size: number;
}

export interface FileManifest {
  v: 1;
  name: string;
  mime?: string;
  size: number;
  sha256?: string;
  chunks: ChunkRef[];
}

export function parseManifest(text: string): FileManifest | null {
  if (!text.startsWith(MANIFEST_PREFIX)) return null;
  try {
    const parsed = JSON.parse(text.slice(MANIFEST_PREFIX.length)) as FileManifest;
    if (
      parsed.v === 1 &&
      typeof parsed.name === 'string' &&
      typeof parsed.size === 'number' &&
      Array.isArray(parsed.chunks)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function scanDriveManifests(
  userId: string,
  drive: Drive,
  limit = 500
): Promise<{ manifest: FileManifest; manifestMessageId: number }[]> {
  const client = await getClientForUser(userId);
  const found: { manifest: FileManifest; manifestMessageId: number }[] = [];

  for await (const message of client.iterMessages(channelInput(drive), { limit })) {
    const text = (message as Api.Message).message;
    if (!text) continue;
    const manifest = parseManifest(text);
    if (manifest) {
      found.push({ manifest, manifestMessageId: message.id });
    }
  }

  return found;
}

/**
 * Rebuild the local index from legacy manifest messages posted in a drive's
 * channel. New uploads no longer write manifests — the shared DB index is the
 * source of truth — but old chunked files (and files uploaded directly to
 * Telegram outside the app) can still be imported this way.
 */
export async function rescanDrive(userId: string, driveId: string): Promise<number> {
  const drive = await requireDriveMember(userId, driveId);
  const found = await scanDriveManifests(userId, drive);
  let added = 0;

  for (const { manifest, manifestMessageId } of found) {
    const existing = await getItemByManifest(driveId, manifestMessageId);
    if (existing) continue;

    await saveChunkedItem(
      {
        name: manifest.name,
        type: 'file',
        size: manifest.size,
        mimeType: manifest.mime,
        uploadedAt: new Date().toISOString(),
        parentId: null,
        driveId,
        chunkCount: manifest.chunks.length,
        sha256: manifest.sha256,
      },
      manifest.chunks.map((chunk) => ({
        seq: chunk.seq,
        messageId: chunk.messageId,
        size: chunk.size,
      }))
    );
    added += 1;
  }

  return added;
}