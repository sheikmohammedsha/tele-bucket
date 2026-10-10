import { DriveItem, StorageStats } from '@/types/telegram';

export interface Backend {
  fetchItems(
    driveId: string,
    parentId: string | null,
    query?: string
  ): Promise<{ items: DriveItem[]; stats: StorageStats }>;
  uploadFile(
    driveId: string,
    file: File,
    parentId: string | null,
    onProgress?: (fraction: number) => void
  ): Promise<DriveItem>;
  createFolder(
    driveId: string,
    name: string,
    parentId: string | null
  ): Promise<DriveItem>;
  deleteItem(id: string): Promise<void>;
  download(item: DriveItem, onProgress?: (fraction: number) => void): Promise<void>;
  forwardItem(item: DriveItem, toDriveId: string): Promise<DriveItem>;
}

export async function parseResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}