import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { forwardDocument, forwardMessages, requireDriveMember } from '@/lib/telegram';
import { addItem, getItem, listChunks, saveChunkedItem } from '@/lib/store';
import { jsonError } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);

    const body = (await request.json()) as {
      id?: string;
      toDriveId?: string;
      parentId?: string | null;
    };
    const id = body.id;
    const toDriveId = body.toDriveId;

    if (!id || !toDriveId) {
      return NextResponse.json(
        { error: 'Both the source file and target drive are required.' },
        { status: 400 }
      );
    }

    const source = await getItem(id);
    if (!source || source.type !== 'file') {
      return NextResponse.json({ error: 'Source file not found.' }, { status: 404 });
    }
    if (source.driveId === toDriveId) {
      return NextResponse.json(
        { error: 'The file is already in this drive.' },
        { status: 400 }
      );
    }

    // The caller must be a member of BOTH drives: the source to read it, the
    // target to leave a copy behind.
    const fromDrive = await requireDriveMember(userId, source.driveId);
    const toDrive = await requireDriveMember(userId, toDriveId);

    const parentId = body.parentId ?? null;
    if (parentId) {
      const parent = await getItem(parentId);
      if (!parent || parent.type !== 'folder' || parent.driveId !== toDriveId) {
        return NextResponse.json(
          { error: 'The target folder does not exist in the target drive.' },
          { status: 400 }
        );
      }
    }

    const now = new Date().toISOString();

    // Chunked files: forward every part in order, then index the copy in the
    // shared DB — the target drive's index is shared with its members, so no
    // manifest message is needed in the channel.
    if (source.chunkCount && source.chunkCount > 0) {
      const chunks = await listChunks(source.id);
      if (chunks.length === 0) {
        return NextResponse.json(
          { error: 'The chunk index for this file is missing.' },
          { status: 500 }
        );
      }

      const forwarded = await forwardMessages(
        userId,
        fromDrive,
        toDrive,
        chunks.map((chunk) => chunk.messageId)
      );
      if (forwarded.length !== chunks.length) {
        return NextResponse.json(
          { error: 'Telegram did not forward every part of this file.' },
          { status: 502 }
        );
      }

      const newChunks = chunks.map((chunk, index) => ({
        seq: chunk.seq,
        messageId: forwarded[index],
        size: chunk.size,
      }));

      const item = await saveChunkedItem(
        {
          name: source.name,
          type: 'file',
          size: source.size,
          mimeType: source.mimeType,
          uploadedAt: now,
          parentId,
          driveId: toDriveId,
          chunkCount: source.chunkCount,
          sha256: source.sha256,
        },
        newChunks
      );

      return NextResponse.json({ success: true, item });
    }

    // Plain single-document files forward as before.
    if (!source.messageId) {
      return NextResponse.json({ error: 'Source file not found.' }, { status: 404 });
    }
    const messageId = await forwardDocument(userId, fromDrive, toDrive, source.messageId);

    const item = await addItem({
      name: source.name,
      type: 'file',
      size: source.size,
      mimeType: source.mimeType,
      uploadedAt: now,
      parentId,
      messageId,
      driveId: toDriveId,
    });

    return NextResponse.json({ success: true, item });
  } catch (error) {
    return jsonError(error, 'Failed to forward the file.');
  }
}