import { NextRequest, NextResponse } from 'next/server';
import { clearWebSession } from '@/lib/auth';
import { disconnectUser } from '@/lib/telegram';
import { getWebSession } from '@/lib/db';
import { jsonError } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const response = NextResponse.json({ success: true });
    const token = request.cookies.get('tb_session')?.value;
    if (token) {
      const session = await getWebSession(token);
      if (session) {
        await disconnectUser(session.user_id);
      }
    }
    await clearWebSession(request, response);
    return response;
  } catch (error) {
    return jsonError(error, 'Could not sign out.');
  }
}