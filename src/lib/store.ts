import { randomUUID } from 'crypto';
import { Drive, DriveItem, StorageStats } from '@/types/telegram';
import { getDb } from './db';

interface ItemRow {
  id: string;
  name: string;
  type: string;
  size: number;
  mime_type: string | null;
  uploaded_at: string;
  parent_id: string | null;
  message_id: number | null;
  drive_id: string;
  user_id: string;
  chunk_count: number;
  sha256: string | null;
  manifest_id: number | null;
}

interface ChunkRow {
  id: string;
  item_id: string;
  seq: number;
  message_id: number;
  size: number;
  drive_id: string;
}

interface DriveRow {
  id: string;
  access_hash: string;
  title: string;
  created_at: string;
}

function toItem(row: ItemRow): DriveItem {
  return {
    id: row.id,
    name: row.name,
    type: row.type === 'folder' ? 'folder' : 'file',
    size: row.size,
    mimeType: row.mime_type ?? undefined,
    uploadedAt: row.uploaded_at,
    parentId: row.parent_id,
    messageId: row.message_id ?? undefined,
    driveId: row.drive_id,
    chunkCount: row.chunk_count > 0 ? row.chunk_count : undefined,
    sha256: row.sha256 ?? undefined,
  };
}

function toDrive(row: DriveRow): Drive {
  return {
    id: row.id,
    title: row.title,
    addedAt: row.created_at,
    accessHash: row.access_hash,
  };
}

export async function listDrives(): Promise<Drive[]> {
  const db = await getDb();
  const rows = db
    .prepare('SELECT * FROM drives ORDER BY created_at ASC')
    .all() as unknown as DriveRow[];
  return rows.map(toDrive);
}

export async function getDrive(id: string): Promise<Drive | undefined> {
  const db = await getDb();
  const row = db.prepare('SELECT * FROM drives WHERE id = ?').get(id) as DriveRow | undefined;
  return row ? toDrive(row) : undefined;
}

export async function upsertDrive(drive: Omit<Drive, 'addedAt'>): Promise<Drive> {
  const db = await getDb();
  const existing = db.prepare('SELECT created_at FROM drives WHERE id = ?').get(drive.id) as
    | { created_at: string }
    | undefined;
  const created = existing?.created_at ?? new Date().toISOString();
  db.prepare(
    `INSERT INTO drives (id, access_hash, title, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET access_hash = excluded.access_hash, title = excluded.title`
  ).run(drive.id, drive.accessHash, drive.title, created);
  return { ...drive, addedAt: created };
}

/**
 * The item index is shared per drive: any member of a drive sees the exact same
 * files and folder tree from any client of this app. Privacy is enforced by the
 * API layer, which only ever hands back items whose drive the caller is a
 * member of (see requireDriveMember in lib/telegram.ts).
 */
export async function listItems(driveId: string, parentId: string | null): Promise<DriveItem[]> {
  const db = await getDb();
  const rows = parentId
    ? (db
        .prepare(
          'SELECT * FROM items WHERE drive_id = ? AND parent_id = ? ORDER BY type DESC, name COLLATE NOCASE'
        )
        .all(driveId, parentId) as unknown as ItemRow[])
    : (db
        .prepare(
          'SELECT * FROM items WHERE drive_id = ? AND parent_id IS NULL ORDER BY type DESC, name COLLATE NOCASE'
        )
        .all(driveId) as unknown as ItemRow[]);
  return rows.map(toItem);
}

export async function searchItems(driveId: string, query: string): Promise<DriveItem[]> {
  const db = await getDb();
  const rows = db
    .prepare(
      'SELECT * FROM items WHERE drive_id = ? AND name LIKE ? COLLATE NOCASE ORDER BY type DESC, name COLLATE NOCASE'
    )
    .all(driveId, `%${query}%`) as unknown as ItemRow[];
  return rows.map(toItem);
}

export async function getItem(id: string): Promise<DriveItem | undefined> {
  const db = await getDb();
  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow | undefined;
  return row ? toItem(row) : undefined;
}

export async function addItem(item: Omit<DriveItem, 'id'>): Promise<DriveItem> {
  const db = await getDb();
  const newItem: DriveItem = { ...item, id: randomUUID() };
  db.prepare(
    `INSERT INTO items (id, name, type, size, mime_type, uploaded_at, parent_id, message_id, drive_id, user_id, chunk_count, sha256, manifest_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, NULL)`
  ).run(
    newItem.id,
    newItem.name,
    newItem.type,
    newItem.size,
    newItem.mimeType ?? null,
    newItem.uploadedAt,
    newItem.parentId,
    newItem.messageId ?? null,
    newItem.driveId,
    newItem.chunkCount ?? 0,
    newItem.sha256 ?? null
  );
  return newItem;
}

export interface ChunkPart {
  seq: number;
  messageId: number;
  size: number;
}

export async function saveChunkedItem(
  item: Omit<DriveItem, 'id'> & { chunkCount: number; sha256?: string },
  chunks: ChunkPart[]
): Promise<DriveItem> {
  const db = await getDb();
  const id = randomUUID();
  const dbItem = { ...item, id };

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO items (id, name, type, size, mime_type, uploaded_at, parent_id, message_id, drive_id, user_id, chunk_count, sha256, manifest_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, '', ?, ?, NULL)`
    ).run(
      id,
      item.name,
      item.type,
      item.size,
      item.mimeType ?? null,
      item.uploadedAt,
      item.parentId,
      item.driveId,
      item.chunkCount,
      item.sha256 ?? null
    );

    const insert = db.prepare(
      'INSERT INTO chunks (id, item_id, seq, message_id, size, drive_id) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const chunk of chunks) {
      insert.run(randomUUID(), id, chunk.seq, chunk.messageId, chunk.size, item.driveId);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return dbItem;
}

export async function listChunks(itemId: string): Promise<ChunkPart[]> {
  const db = await getDb();
  const rows = db
    .prepare('SELECT * FROM chunks WHERE item_id = ? ORDER BY seq ASC')
    .all(itemId) as unknown as ChunkRow[];
  return rows.map((row) => ({ seq: row.seq, messageId: row.message_id, size: row.size }));
}

/** Legacy dedupe: chunked files previously announced themselves with a manifest message. */
export async function getItemByManifest(
  driveId: string,
  manifestId: number
): Promise<DriveItem | undefined> {
  const db = await getDb();
  const row = db
    .prepare('SELECT * FROM items WHERE drive_id = ? AND manifest_id = ?')
    .get(driveId, manifestId) as ItemRow | undefined;
  return row ? toItem(row) : undefined;
}

export async function createFolder(
  driveId: string,
  name: string,
  parentId: string | null
): Promise<DriveItem> {
  return addItem({
    name,
    type: 'folder',
    size: 0,
    parentId,
    driveId,
    uploadedAt: new Date().toISOString(),
  });
}

export async function deleteItem(id: string): Promise<DriveItem[]> {
  const db = await getDb();
  const toDelete = new Set<string>([id]);
  let changed = true;
  const all = db.prepare('SELECT * FROM items').all() as unknown as ItemRow[];
  while (changed) {
    changed = false;
    for (const row of all) {
      if (row.parent_id && toDelete.has(row.parent_id) && !toDelete.has(row.id)) {
        toDelete.add(row.id);
        changed = true;
      }
    }
  }
  if (toDelete.size === 1 && !all.some((row) => row.id === id)) {
    return [];
  }

  const removed: DriveItem[] = [];
  const remove = db.prepare('DELETE FROM items WHERE id = ?');
  for (const itemId of toDelete) {
    const row = all.find((entry) => entry.id === itemId);
    if (row) {
      removed.push(toItem(row));
      remove.run(itemId);
    }
  }

  return removed;
}

/**
 * Every Telegram message that implements an item (and its children): the
 * single document for plain files, or the chunk documents (+ legacy manifest
 * message) for chunked files. Used by the delete path.
 */
export async function getItemMessageIds(
  id: string
): Promise<{ messageIds: number[]; manifestId?: number }> {
  const db = await getDb();
  const row = db
    .prepare('SELECT message_id, chunk_count, manifest_id FROM items WHERE id = ?')
    .get(id) as
    | { message_id: number | null; chunk_count: number; manifest_id: number | null }
    | undefined;
  if (!row) return { messageIds: [] };

  const messageIds: number[] = [];
  if (row.message_id) messageIds.push(row.message_id);

  if (row.chunk_count > 0) {
    const chunkRows = db
      .prepare('SELECT message_id FROM chunks WHERE item_id = ? ORDER BY seq ASC')
      .all(id) as { message_id: number }[];
    for (const chunk of chunkRows) {
      messageIds.push(chunk.message_id);
    }
    return { messageIds, manifestId: row.manifest_id ?? undefined };
  }

  return { messageIds };
}

/** The full subtree underneath an item (including itself), via the drive tree. */
export async function collectSubtree(id: string): Promise<DriveItem[]> {
  const found: DriveItem[] = [];
  const queue = [id];
  let guard = 0;
  while (queue.length && guard < 10_000) {
    guard += 1;
    const current = queue.shift() as string;
    const item = await getItem(current);
    if (!item) continue;
    found.push(item);
    if (item.type === 'folder') {
      const children = await listItems(item.driveId, item.id);
      queue.push(...children.map((child) => child.id));
    }
  }
  return found;
}

export async function getStats(driveId: string): Promise<StorageStats> {
  const db = await getDb();
  const fileRow = db
    .prepare(
      "SELECT COUNT(*) AS count, COALESCE(SUM(size), 0) AS bytes FROM items WHERE drive_id = ? AND type = 'file'"
    )
    .get(driveId) as { count: number; bytes: number };
  const folderRow = db
    .prepare("SELECT COUNT(*) AS count FROM items WHERE drive_id = ? AND type = 'folder'")
    .get(driveId) as { count: number };

  return {
    usedBytes: Number(fileRow.bytes) || 0,
    fileCount: Number(fileRow.count) || 0,
    folderCount: Number(folderRow.count) || 0,
  };
}