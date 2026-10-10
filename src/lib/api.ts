import { NextResponse } from 'next/server';
import { TelegramApiError, TelegramAuthError, TelegramConfigError } from '@/lib/telegram';

export function jsonError(error: unknown, fallback: string, status = 500) {
  if (error instanceof TelegramConfigError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof TelegramAuthError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof TelegramApiError) {
    return NextResponse.json(
      { error: error.description || error.message },
      { status: error.status ?? 400 }
    );
  }
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status });
}
