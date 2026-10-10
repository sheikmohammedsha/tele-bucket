import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { CHUNK_SIZE } from '@/lib/chunking';
import { requireDriveMember, uploadDocument } from '@/lib/telegram';
import { jsonError } from '@/lib/api';

export const dynamic = 'force-dynamic';

// One ~100 MB chunk of a client-side split upload. The browser slices the
// file, uploads each part here, and finally calls /api/upload/complete.
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);

    const formData = await request.formData();
    const file = formData.get('file');
    const driveId = formData.get('driveId') as string | null;
    const name = (formData.get('name') as string) || '';
    const mimeType = (formData.get('mime') as string) || undefined;
    const seq = Number(formData.get('seq'));
    const totalParts = Number(formData.get('totalParts'));
    const totalSize = Number(formData.get('size'));

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No part uploaded.' }, { status: 400 });
    }
    if (!driveId || !name) {
      return NextResponse.json({ error: 'Drive id and file name are required.' }, { status: 400 });
    }
    if (
      !Number.isInteger(seq) ||
      seq < 0 ||
      !Number.isInteger(totalParts) ||
      totalParts < 1 ||
      seq >= totalParts
    ) {
      return NextResponse.json({ error: 'Invalid part sequence.' }, { status: 400 });
    }
    if (!Number.isInteger(totalSize) || totalSize <= 0) {
      return NextResponse.json({ error: 'Invalid file size.' }, { status: 400 });
    }
    if (file.size > CHUNK_SIZE) {
      return NextResponse.json({ error: 'A part may not exceed 100 MB.' }, { status: 400 });
    }

    const drive = await requireDriveMember(userId, driveId);
    const partName = `${name}.part-${String(seq + 1).padStart(3, '0')}-of-${totalParts}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadDocument(userId, drive, partName, buffer, mimeType);

    return NextResponse.json({
      success: true,
      part: { seq, messageId: uploaded.messageId, size: buffer.length },
    });
  } catch (error) {
    return jsonError(error, 'Failed to upload file part.');
  }
}