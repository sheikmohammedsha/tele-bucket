import { DriveItem } from '@/types/telegram';
import { Backend, parseResponse } from './types';
import { CHUNK_SIZE } from '@/lib/chunking';

export const serverBackend: Backend = {
  async fetchItems(driveId, parentId, query) {
    const params = new URLSearchParams({ driveId });
    if (query) {
      params.set('q', query);
    } else {
      params.set('parentId', parentId ?? 'root');
    }
    const response = await fetch(`/api/files?${params.toString()}`, {
      cache: 'no-store',
    });
    return parseResponse(response);
  },

  async uploadFile(driveId, file, parentId, onProgress) {
    // Files up to CHUNK_SIZE go up in one request.
    if (file.size <= CHUNK_SIZE) {
      const formData = new FormData();
      formData.append('driveId', driveId);
      formData.append('file', file);
      if (parentId) {
        formData.append('parentId', parentId);
      }
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await parseResponse<{ item: DriveItem }>(response);
      onProgress?.(1);
      return data.item;
    }

    // Larger files are split in the browser: each ~100 MB part is uploaded and
    // finalized by the server, keeping the server memory bounded and loadless.
    const totalParts = Math.ceil(file.size / CHUNK_SIZE);
    const parts: { seq: number; messageId: number; size: number }[] = [];
    for (let i = 0; i < totalParts; i += 1) {
      const start = i * CHUNK_SIZE;
      const chunk = file.slice(start, Math.min(file.size, start + CHUNK_SIZE));
      const partName = `${file.name}.part-${String(i + 1).padStart(3, '0')}-of-${totalParts}`;

      const formData = new FormData();
      formData.append('driveId', driveId);
      formData.append('file', chunk, partName);
      formData.append('name', file.name);
      formData.append('mime', file.type || '');
      formData.append('seq', String(i));
      formData.append('totalParts', String(totalParts));
      formData.append('size', String(file.size));

      const response = await fetch('/api/upload/part', {
        method: 'POST',
        body: formData,
      });
      const data = await parseResponse<{
        part: { seq: number; messageId: number; size: number };
      }>(response);
      parts.push(data.part);
      onProgress?.((i + 1) / totalParts);
    }

    const response = await fetch('/api/upload/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        driveId,
        parentId,
        name: file.name,
        mime: file.type || undefined,
        size: file.size,
        parts,
      }),
    });
    const data = await parseResponse<{ item: DriveItem }>(response);
    return data.item;
  },

  async createFolder(driveId, name, parentId) {
    const response = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driveId, name, parentId }),
    });
    const data = await parseResponse<{ item: DriveItem }>(response);
    return data.item;
  },

  async deleteItem(id) {
    const response = await fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await parseResponse(response);
  },

  async download(item, onProgress) {
    // Plain files download straight from Telegram, exactly like before.
    if (!item.chunkCount || item.chunkCount <= 0) {
      triggerDownload(`/api/download?id=${encodeURIComponent(item.id)}`, item.name);
      onProgress?.(1);
      return;
    }

    // Chunked files are fetched part-by-part in the browser and merged into a
    // Blob, reporting progress as each part arrives.
    const totalParts = item.chunkCount;
    const parts: Blob[] = [];
    for (let seq = 0; seq < totalParts; seq += 1) {
      const response = await fetch(
        `/api/download?id=${encodeURIComponent(item.id)}&seq=${seq}`,
        { cache: 'no-store' }
      );
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error || `Failed to download part ${seq + 1}.`);
      }
      parts.push(await response.blob());
      onProgress?.((seq + 1) / totalParts);
    }

    const merged = new Blob(parts, { type: item.mimeType || 'application/octet-stream' });
    const url = URL.createObjectURL(merged);
    triggerBlobDownload(url, item.name);
    URL.revokeObjectURL(url);
    onProgress?.(1);
  },

  async forwardItem(item, toDriveId) {
    const response = await fetch('/api/forward', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, toDriveId }),
    });
    const data = await parseResponse<{ item: DriveItem }>(response);
    return data.item;
  },
};

export function triggerDownload(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function triggerBlobDownload(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}