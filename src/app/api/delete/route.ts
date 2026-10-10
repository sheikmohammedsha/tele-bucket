import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { deleteDocuments, requireDriveMember } from '@/lib/telegram';
import { getItem, collectSubtree, deleteItem, getItemMessageIds } from '@/lib/store';
import { jsonError } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);

    const body = (await request.json()) as { id?: string };
    const id = body.id;

    if (!id) {
      return NextResponse.json({ error: 'Item id is required.' }, { status: 400 });
    }

    const target = await getItem(id);
    if (!target) {
      return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
    }

    await requireDriveMember(userId, target.driveId);

    // Collect every Telegram message this item (and its children) owns BEFORE
    // the rows are removed, so chunk/manifest messages can be revoked too.
    const subtree = await collectSubtree(id);
    const messageIdsByDrive = new Map<string, number[]>();
    for (const item of subtree) {
      if (item.type !== 'file') continue;
      const { messageIds, manifestId } = await getItemMessageIds(item.id);
      const driveIds = messageIdsByDrive.get(item.driveId) ?? [];
      driveIds.push(...messageIds, ...(manifestId ? [manifestId] : []));
      messageIdsByDrive.set(item.driveId, driveIds);
    }

    const removed = await deleteItem(id);

    for (const [driveId, messageIds] of messageIdsByDrive) {
      if (!messageIds.length) continue;
      const drive = await requireDriveMember(userId, driveId);
      await deleteDocuments(userId, drive, messageIds);
    }

    return NextResponse.json({ success: true, removed });
  } catch (error) {
    return jsonError(error, 'Failed to delete item.');
  }
}