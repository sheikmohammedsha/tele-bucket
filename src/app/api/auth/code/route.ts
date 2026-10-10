import { NextRequest, NextResponse } from 'next/server';
import { submitLoginCode } from '@/lib/telegram';
import { attachWebSession, issueWebSession } from '@/lib/auth';
import { jsonError } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { token?: string; code?: string };
    const token = body.token ?? '';
    const code = body.code?.trim() ?? '';

    if (!token || !code) {
      return NextResponse.json(
        { error: 'Both the login token and the code are required.' },
        { status: 400 }
      );
    }

    const result = await submitLoginCode(token, code);
    if ('needsPassword' in result) {
      return NextResponse.json(result);
    }

    // The web-session token maps the browser to the Telegram user; the
    // MTProto session itself stays server-side in the users table.
    const webToken = await issueWebSession(result.user.id);
    const response = NextResponse.json(result);
    return attachWebSession(response, webToken);
  } catch (error) {
    return jsonError(error, 'Could not verify the login code.');
  }
}