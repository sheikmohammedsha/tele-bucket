import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { rescanDrive } from '@/lib/telegram';
import { jsonError } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ driveId: string }> }
) {
  try {
    const userId = await requireUserId(request);
    const { driveId } = await context.params;
    const driveIdDecoded = decodeURIComponent(driveId);

    const added = await rescanDrive(userId, driveIdDecoded);

    return NextResponse.json({ success: true, added });
  } catch (error) {
    return jsonError(error, 'Failed to scan the drive.');
  }
}