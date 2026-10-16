'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { MobileNav } from '@/components/MobileNav';
import { SanitizedUser } from '@/lib/auth';
import { SupportTicket } from '@/lib/db';
import {
  HelpCircle,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Send,
  ExternalLink,
  ShieldCheck,
  Clock,
  Layers,
} from 'lucide-react';

export default function SupportPage() {
  const router = useRouter();
  const [user, setUser] = useState<SanitizedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);

  // Ticket Form
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('Deriv Connection');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // FAQ Accordion State
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const fetchUserData = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.user) setUser(data.user);
      }
    } catch {}
    finally {
      setLoading(false);
    }
  };

  const fetchTickets = async () => {
    try {
      const res = await fetch('/api/support/tickets');
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      }
    } catch (e) {
      console.warn('Failed to load tickets:', e);
    }
  };

  useEffect(() => {
    let ignore = false;
    const init = async () => {
      try {
        const [meRes, ticketRes] = await Promise.all([
          fetch('/api/auth/me'),
          fetch('/api/support/tickets'),
        ]);
        if (!ignore && meRes.ok) {
          const data = await meRes.json();
          if (data.user) setUser(data.user);
        }
        if (!ignore && ticketRes.ok) {
          const tData = await ticketRes.json();
          setTickets(tData.tickets || []);
        }
      } catch {}
      finally {
        if (!ignore) setLoading(false);
      }
    };
    init();
    return () => {
      ignore = true;
    };
  }, []);

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, category, message }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to submit ticket');
      } else {
        setSuccess('Your support ticket has been logged. Our technical desk will investigate.');
        setSubject('');
        setMessage('');
        fetchTickets();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Submission error: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const faqs = [
    {
      q: 'How do I create a Deriv Personal Access Token (PAT) with trade scope?',
      a: 'Log in to your Deriv account at https://home.deriv.com/dashboard/profile. Under "API Token", enter a token name, check the "Trade" permission box (this is mandatory for the autonomous bot), and generate the token. Copy and paste it securely into G-Squad.',
    },
    {
      q: 'Does G-Squad ever start real trading automatically?',
      a: 'Never. Connecting your Deriv account does not start any trading activity. The trading bot runs strictly upon your manual command via the "Start Bot" button on the terminal.',
    },
    {
      q: 'How does the 5-Tick Rise/Fall contract work on Volatility 100?',
      a: 'Each trade enters a contract lasting exactly five price ticks on the Volatility 100 Index. The quantitative engine scans for directional momentum surges and filters out stagnant spreads before submitting the proposal to Deriv.',
    },
    {
      q: 'How are the Stop Loss and Daily Profit Target limits enforced?',
      a: 'Limits are checked and enforced on the server during each tick and before every order. If your daily loss hits your Max Daily Loss, or your profit reaches your Daily Target, the bot immediately ceases trading to protect your account balance.',
    },
    {
      q: 'Are my Deriv passwords or tokens stored in plaintext?',
      a: 'No. G-Squad never requests or stores your Deriv login passwords. Personal Access Tokens are encrypted at rest on the server with AES-256-GCM. Frontend JavaScript never has access to the raw token string.',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-16 md:pb-0">
      <Navbar user={user} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Title */}
        <div className="pb-2 border-b border-slate-200">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Customer Support & Documentation
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Technical guidance for Deriv PAT connectivity, 5-tick execution rules, and risk safety.
          </p>
        </div>

        {/* FAQ Accordion */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">Frequently Answered Questions</h2>
          </div>

          <div className="divide-y divide-slate-100">
            {faqs.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={idx} className="py-3.5">
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between text-left text-xs sm:text-sm font-semibold text-slate-800 hover:text-blue-600 transition-colors"
                  >
                    <span>{faq.q}</span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <p className="mt-2 text-xs text-slate-600 leading-relaxed pl-1">
                      {faq.a}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Submit Ticket Form and Ticket History Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Support Ticket Submission */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-bold text-slate-900">Open a Support Ticket</h2>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-700">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-700">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handleSubmitTicket} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Issue Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="Deriv Connection">Deriv PAT & WebSocket Authentication</option>
                  <option value="Trading Engine">5-Tick Trading Strategy & Execution</option>
                  <option value="Risk Limits">Stop Loss & Profit Target Limits</option>
                  <option value="Wallet / Cashier">Deposits, Withdrawals, & Balances</option>
                  <option value="Account">Email Verification & User Profile</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Subject Line
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g., Question about Volatility 100 tick latency"
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Detailed Explanation
                </label>
                <textarea
                  rows={4}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your inquiry or issue in detail..."
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                ></textarea>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm transition-colors disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{submitting ? 'Submitting...' : 'Submit Support Ticket'}</span>
              </button>
            </form>
          </div>

          {/* Ticket History */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Your Support Tickets</h3>
              <span className="text-[11px] text-slate-400 font-mono">{tickets.length} total</span>
            </div>

            <div className="space-y-3">
              {tickets.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  No previous support tickets recorded.
                </div>
              ) : (
                tickets.map((t) => (
                  <div key={t.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">{t.id}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-50 text-blue-700">
                        {t.status}
                      </span>
                    </div>
                    <div className="font-semibold text-slate-900">{t.subject}</div>
                    <p className="text-slate-600 text-[11px] line-clamp-2">{t.message}</p>
                    <div className="text-[10px] text-slate-400 pt-1">
                      {new Date(t.createdAt).toLocaleDateString()} · {t.category}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      <MobileNav />
    </div>
  );
}
