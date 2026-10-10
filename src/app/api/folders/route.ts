import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { requireDriveMember } from '@/lib/telegram';
import { createFolder, getItem } from '@/lib/store';
import { jsonError } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);

    const body = (await request.json()) as {
      driveId?: string;
      name?: string;
      parentId?: string | null;
    };
    const driveId = body.driveId;
    const name = body.name?.trim();

    if (!driveId) {
      return NextResponse.json({ error: 'A drive id is required.' }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: 'Folder name is required.' }, { status: 400 });
    }

    await requireDriveMember(userId, driveId);

    const parentId = body.parentId ?? null;
    if (parentId) {
      const parent = await getItem(parentId);
      if (!parent || parent.type !== 'folder' || parent.driveId !== driveId) {
        return NextResponse.json(
          { error: 'The parent folder does not exist in this drive.' },
          { status: 400 }
        );
      }
    }

    const folder = await createFolder(driveId, name, parentId);

    return NextResponse.json({ success: true, item: folder });
  } catch (error) {
    return jsonError(error, 'Failed to create folder.');
  }
}