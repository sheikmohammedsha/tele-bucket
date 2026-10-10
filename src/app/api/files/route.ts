import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { requireDriveMember } from '@/lib/telegram';
import { listItems, searchItems, getStats } from '@/lib/store';
import { jsonError } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId(request);

    const { searchParams } = new URL(request.url);
    const driveId = searchParams.get('driveId');
    const query = searchParams.get('q');
    const rawParent = searchParams.get('parentId');
    const parentId = rawParent && rawParent !== 'root' ? rawParent : null;

    if (!driveId) {
      return NextResponse.json({ error: 'A drive id is required.' }, { status: 400 });
    }

    await requireDriveMember(userId, driveId);

    const items = query
      ? await searchItems(driveId, query)
      : await listItems(driveId, parentId);
    const stats = await getStats(driveId);

    return NextResponse.json({ items, stats });
  } catch (error) {
    return jsonError(error, 'Failed to list files.');
  }
}