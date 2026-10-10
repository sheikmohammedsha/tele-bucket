import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { createDrive, listDrives } from '@/lib/telegram';
import { jsonError } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    const drives = await listDrives(userId);
    return NextResponse.json({ drives });
  } catch (error) {
    return jsonError(error, 'Failed to list drives.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    const body = (await request.json()) as { title?: string };
    const title = body.title?.trim();

    if (!title) {
      return NextResponse.json({ error: 'Drive name is required.' }, { status: 400 });
    }
    if (title.length > 120) {
      return NextResponse.json({ error: 'Drive name is too long (max 120 characters).' }, { status: 400 });
    }

    const drive = await createDrive(userId, title);
    return NextResponse.json({ success: true, drive });
  } catch (error) {
    return jsonError(error, 'Failed to create the drive.');
  }
}