import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { requireDriveMember } from '@/lib/telegram';
import { getItem, saveChunkedItem, type ChunkPart } from '@/lib/store';
import { jsonError } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface PartInput {
  seq: number;
  messageId: number;
  size: number;
}

// Finalizes a client-side split upload: the browser has already uploaded every
// ~100 MB part to /api/upload/part, and reports their message ids here so the
// shared index can record the assembled file — no manifest message needed.
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);

    const body = (await request.json()) as {
      driveId?: string;
      parentId?: string | null;
      name?: string;
      mime?: string;
      size?: number;
      parts?: PartInput[];
    };

    const driveId = body.driveId;
    const name = body.name?.trim();
    const size = Number(body.size);

    if (!driveId || !name) {
      return NextResponse.json({ error: 'Drive id and file name are required.' }, { status: 400 });
    }
    if (!body.parts || body.parts.length === 0) {
      return NextResponse.json({ error: 'No parts were uploaded.' }, { status: 400 });
    }
    if (!Number.isInteger(size) || size <= 0) {
      return NextResponse.json({ error: 'Invalid file size.' }, { status: 400 });
    }

    const sorted = [...body.parts].sort((a, b) => a.seq - b.seq);
    for (let i = 0; i < sorted.length; i += 1) {
      const part = sorted[i];
      if (
        !Number.isInteger(part.seq) ||
        part.seq !== i ||
        !Number.isInteger(part.messageId) ||
        part.messageId <= 0 ||
        !Number.isInteger(part.size) ||
        part.size <= 0
      ) {
        return NextResponse.json(
          { error: 'Parts are missing or out of order.' },
          { status: 400 }
        );
      }
    }
    if (sorted.reduce((sum, part) => sum + part.size, 0) !== size) {
      return NextResponse.json(
        { error: 'Part sizes do not add up to the file size.' },
        { status: 400 }
      );
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

    const chunks: ChunkPart[] = sorted.map((part) => ({
      seq: part.seq,
      messageId: part.messageId,
      size: part.size,
    }));

    const item = await saveChunkedItem(
      {
        name,
        type: 'file',
        size,
        mimeType: body.mime || undefined,
        uploadedAt: new Date().toISOString(),
        parentId,
        driveId,
        chunkCount: chunks.length,
      },
      chunks
    );

    return NextResponse.json({ success: true, item });
  } catch (error) {
    return jsonError(error, 'Failed to finalize upload.');
  }
}