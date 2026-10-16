import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { findUserById, createTicket, getTicketsByUserId, SupportTicket } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tickets = getTicketsByUserId(userId);
    return NextResponse.json({ tickets });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = findUserById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await req.json();
    const { subject, category, message } = body;

    if (!subject || !message) {
      return NextResponse.json({ error: 'Subject and message are required.' }, { status: 400 });
    }

    const newTicket: SupportTicket = {
      id: `TCK-${Date.now().toString(36).toUpperCase()}`,
      userId: user.id,
      accountNumber: user.accountNumber,
      subject: subject.trim(),
      category: category || 'General Inquiry',
      message: message.trim(),
      status: 'open',
      createdAt: new Date().toISOString(),
    };

    createTicket(newTicket);

    return NextResponse.json({
      success: true,
      ticket: newTicket,
      message: 'Support ticket submitted. A specialist will review your request.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
