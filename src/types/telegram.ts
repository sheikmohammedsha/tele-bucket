export type ItemType = 'file' | 'folder';

export interface Drive {
  id: string;
  title: string;
  addedAt: string;
  /** Telegram channel access hash (stays server-side, never exposed except to Telegram). */
  accessHash: string;
}

export interface DriveItem {
  id: string;
  name: string;
  type: ItemType;
  size: number;
  mimeType?: string;
  uploadedAt: string;
  parentId: string | null;
  /** Message id for single-message files. Chunked files use `chunkCount` instead. */
  messageId?: number;
  /** The drive (Telegram group) this item belongs to. */
  driveId: string;
  /** How many parts this file was split into (0 = single message). */
  chunkCount?: number;
  /** SHA-256 of the reassembled file (set for chunked files). */
  sha256?: string;
}

export interface AuthUser {
  id: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  phone?: string;
}

export interface AuthStatus {
  /** Whether the instance owner has stored Telegram API credentials in the DB. */
  configured: boolean;
  /** Whether the current browser is signed in as a Telegram user. */
  authorized: boolean;
  /** Whether the signed-in user is the instance owner. */
  isOwner?: boolean;
  /** The signed-in user's phone number. */
  phone?: string;
  user?: AuthUser;
}

export interface StorageStats {
  usedBytes: number;
  fileCount: number;
  folderCount: number;
}

export interface UploadResult {
  success: true;
  item: DriveItem;
}

export interface UploadTask {
  id: string;
  name: string;
  status: 'uploading' | 'done' | 'error';
  error?: string;
  /** 0..1 progress while splitting/uploading in the browser. */
  progress?: number;
}

export interface DownloadTask {
  id: string;
  name: string;
  status: 'downloading' | 'done' | 'error';
  /** 0..1 progress while fetching/merging parts in the browser. */
  progress: number;
  error?: string;
}