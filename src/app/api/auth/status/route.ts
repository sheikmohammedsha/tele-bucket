import { NextRequest, NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth';
import { getAuthStatus } from '@/lib/telegram';
import { jsonError } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const userId = await currentUserId(request);
    const status = await getAuthStatus(userId);
    return NextResponse.json(status);
  } catch (error) {
    return jsonError(error, 'Failed to read authentication status.');
  }
}