import { NextResponse } from 'next/server';
import { getEnvironmentStatus } from '@/lib/env';

export async function GET() {
  const status = getEnvironmentStatus();
  return NextResponse.json(status);
}
