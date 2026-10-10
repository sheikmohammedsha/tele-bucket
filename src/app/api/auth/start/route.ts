import { NextRequest, NextResponse } from 'next/server';
import { startLogin } from '@/lib/telegram';
import { jsonError } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { phone?: string };
    const phone = body.phone?.trim() ?? '';

    if (!phone) {
      return NextResponse.json(
        { error: 'Your phone number is required to sign in.' },
        { status: 400 }
      );
    }

    let normalized = phone;
    if (!normalized.startsWith('+') && !normalized.startsWith('00')) {
      normalized = `+${normalized}`;
    }

    const result = await startLogin(normalized);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return jsonError(error, 'Could not send the login code.');
  }
}