import { NextRequest, NextResponse } from 'next/server';
import { submitLoginPassword } from '@/lib/telegram';
import { attachWebSession, issueWebSession } from '@/lib/auth';
import { jsonError } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { token?: string; password?: string };
    const token = body.token ?? '';
    const password = body.password ?? '';

    if (!token || !password) {
      return NextResponse.json(
        { error: 'Both the login token and the two-factor password are required.' },
        { status: 400 }
      );
    }

    const result = await submitLoginPassword(token, password);
    const webToken = await issueWebSession(result.user.id);
    const response = NextResponse.json(result);
    return attachWebSession(response, webToken);
  } catch (error) {
    return jsonError(error, 'Could not complete the two-factor sign in.');
  }
}