import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { addDriveMember } from '@/lib/telegram';
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

    const body = (await request.json()) as { phone?: string };
    const rawPhone = body.phone?.trim();

    if (!rawPhone) {
      return NextResponse.json({ error: 'Phone number is required.' }, { status: 400 });
    }

    let phone = rawPhone;
    if (!phone.startsWith('+') && !phone.startsWith('00')) {
      phone = `+${phone}`;
    }

    await addDriveMember(userId, driveIdDecoded, phone);

    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error, 'Failed to add the drive member.');
  }
}