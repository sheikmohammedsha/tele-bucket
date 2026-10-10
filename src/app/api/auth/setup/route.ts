import { NextRequest, NextResponse } from 'next/server';
import { saveCredentials } from '@/lib/telegram';
import { jsonError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * One-time owner setup: stores the Telegram app credentials in the local DB.
 * Refused once configured, so end users can never overwrite the owner's app.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { apiId?: number; apiHash?: string };
    const apiId = Number(body.apiId);
    const apiHash = body.apiHash?.trim() ?? '';

    await saveCredentials(apiId, apiHash);

    return NextResponse.json({ success: true, configured: true });
  } catch (error) {
    return jsonError(error, 'Could not save the Telegram API credentials.');
  }
}