import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { downloadDocument, requireDriveMember } from '@/lib/telegram';
import { getItem, listChunks } from '@/lib/store';
import { jsonError } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId(request);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const rawSeq = searchParams.get('seq');

    const seq = rawSeq !== null ? Number(rawSeq) : null;
    if (rawSeq !== null && !Number.isInteger(seq)) {
      return NextResponse.json({ error: 'Invalid part sequence.' }, { status: 400 });
    }

    if (!id) {
      return NextResponse.json({ error: 'File id is required.' }, { status: 400 });
    }

    const item = await getItem(id);

    if (!item || item.type !== 'file') {
      return NextResponse.json({ error: 'File not found.' }, { status: 404 });
    }

    // Membership is checked against the drive the item lives in, so any member
    // of the drive may fetch it — and nobody else can.
    const drive = await requireDriveMember(userId, item.driveId);

    // Chunked files are fetched one part at a time; the browser merges them
    // and reports download progress. Request a specific part with ?seq=N.
    if (item.chunkCount && item.chunkCount > 0) {
      const chunks = await listChunks(item.id);
      if (chunks.length === 0) {
        return NextResponse.json(
          { error: 'The chunk index for this file is missing.' },
          { status: 500 }
        );
      }

      const chunkIndex = seq ?? null;
      if (chunkIndex === null || chunkIndex < 0 || chunkIndex >= chunks.length) {
        return NextResponse.json(
          { error: 'A valid part sequence is required for this file.' },
          { status: 400 }
        );
      }

      const chunk = chunks[chunkIndex];
      const buffer = await downloadDocument(userId, drive, chunk.messageId);
      if (!buffer) {
        return NextResponse.json(
          { error: `Part ${chunk.seq + 1} of this file is no longer available on Telegram.` },
          { status: 502 }
        );
      }

      const partName = `${item.name}.part-${String(chunk.seq + 1).padStart(3, '0')}-of-${chunks.length}`;
      const body = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      ) as ArrayBuffer;
      return new NextResponse(body, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(chunk.size),
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(partName)}`,
          'Cache-Control': 'no-store',
        },
      });
    }

    // Single-document files download straight to a buffer.
    if (item.messageId) {
      const buffer = await downloadDocument(userId, drive, item.messageId);
      if (!buffer) {
        return NextResponse.json(
          { error: 'The file could not be fetched from Telegram.' },
          { status: 502 }
        );
      }
      const body = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      ) as ArrayBuffer;
      return new NextResponse(body, {
        headers: {
          'Content-Type': item.mimeType || 'application/octet-stream',
          'Content-Length': String(item.size),
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(item.name)}`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  } catch (error) {
    return jsonError(error, 'Failed to download file.');
  }
}