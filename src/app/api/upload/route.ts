import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { CHUNK_SIZE } from '@/lib/chunking';
import { requireDriveMember, uploadDocument } from '@/lib/telegram';
import { addItem } from '@/lib/store';
import { jsonError } from '@/lib/api';

export const dynamic = 'force-dynamic';

// Uploads up to 100 MB in a single request. Larger files are split in the
// browser and sent part-by-part to /api/upload/part, then finalized via
// /api/upload/complete — the server never assembles the whole file.
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);

    const formData = await request.formData();
    const file = formData.get('file');
    const driveId = formData.get('driveId') as string | null;
    const parentId = (formData.get('parentId') as string) || null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
    }
    if (!driveId) {
      return NextResponse.json({ error: 'A drive id is required.' }, { status: 400 });
    }
    if (file.size > CHUNK_SIZE) {
      return NextResponse.json(
        { error: 'Files over 100 MB are split in the browser before upload.' },
        { status: 400 }
      );
    }

    const drive = await requireDriveMember(userId, driveId);
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadDocument(userId, drive, file.name, buffer, file.type || undefined);

    const item = await addItem({
      name: file.name,
      type: 'file',
      size: file.size,
      mimeType: uploaded.mimeType ?? (file.type || undefined),
      uploadedAt: new Date().toISOString(),
      parentId,
      driveId,
      messageId: uploaded.messageId,
    });

    return NextResponse.json({ success: true, item });
  } catch (error) {
    return jsonError(error, 'Failed to upload file.');
  }
}