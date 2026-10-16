'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { MobileNav } from '@/components/MobileNav';
import { SanitizedUser } from '@/lib/auth';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  ExternalLink,
  ShieldAlert,
  CreditCard,
  Building,
  Coins,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

export default function WalletPage() {
  const router = useRouter();
  const [user, setUser] = useState<SanitizedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');

  // Simulated gateway interaction states
  const [amount, setAmount] = useState('100');
  const [method, setMethod] = useState('card');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
          router.push('/auth/login');
          return;
        }
        const data = await res.json();
        if (!ignore && data.user) {
          setUser(data.user);
        }
      } catch {
        if (!ignore) router.push('/auth/login');
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [router]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/deriv/balance');
      if (res.ok) {
        const data = await res.json();
        if (user && user.derivConnection) {
          setUser({
            ...user,
            derivConnection: {
              ...user.derivConnection,
              balance: data.balance,
              connectedCurrency: data.currency || user.derivConnection.connectedCurrency,
            },
          });
        }
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handleSimulatedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(
      `Payment Provider Integration Notice: Direct external gateway processing requires configuration of PAYMENT_GATEWAY_API_KEY in .env. For real accounts, use the direct Deriv Cashier link below.`
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading Wallet...</div>
      </div>
    );
  }

  const derivConn = user?.derivConnection;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-16 md:pb-0">
      <Navbar user={user} onRefreshBalance={handleManualRefresh} isRefreshing={refreshing} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Wallet & Cashier
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Manage your balance, deposit trading funds, and request withdrawals.
            </p>
          </div>
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
            <span>Sync Deriv Balance</span>
          </button>
        </div>

        {/* Balance Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                Current Authenticated Balance
              </span>
              <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 font-mono mt-1">
                ${derivConn?.balance.toFixed(2) ?? '0.00'}{' '}
                <span className="text-sm font-semibold text-slate-500">
                  {derivConn?.connectedCurrency ?? 'USD'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {derivConn?.connected ? (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                  <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                    <span>Account: {derivConn.connectedAccountId}</span>
                    <span className="uppercase text-[10px] text-slate-500 font-bold">({derivConn.connectedAccountType})</span>
                  </div>
                  <div className="text-slate-500">
                    Settlements credit directly to this Deriv balance.
                  </div>
                </div>
              ) : (
                <Link
                  href="/connect-deriv"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm"
                >
                  Connect Deriv PAT
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Payment Gateway Credentials Status Banner */}
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-2">
          <div className="flex items-center gap-2 font-bold">
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
            <span>Payment Provider Integration Architecture</span>
          </div>
          <p className="leading-relaxed">
            External fiat and crypto payment gateways (Stripe, MoonPay, Crypto Gateway) can be integrated by supplying credentials in <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[11px]">.env</code>.
            Because your trading capital operates under your Deriv account, you can also fund and withdraw directly using the official Deriv Cashier.
          </p>
        </div>

        {/* Deriv Official Cashier Links */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Official Deriv Cashier Direct Access</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Instant deposit and withdrawal for your connected account ({derivConn?.connectedAccountId || 'None'}).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <a
              href="https://app.deriv.com/cashier/deposit"
              target="_blank"
              rel="noreferrer noopener"
              className="p-4 rounded-xl border border-slate-200 hover:border-blue-600 hover:bg-blue-50/30 transition-all flex items-center justify-between group"
            >
              <div className="space-y-0.5">
                <span className="font-bold text-slate-900 text-xs block group-hover:text-blue-600">
                  Deriv Deposit Cashier
                </span>
                <span className="text-[11px] text-slate-500">Credit cards, E-wallets, Crypto</span>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
            </a>

            <a
              href="https://app.deriv.com/cashier/withdrawal"
              target="_blank"
              rel="noreferrer noopener"
              className="p-4 rounded-xl border border-slate-200 hover:border-blue-600 hover:bg-blue-50/30 transition-all flex items-center justify-between group"
            >
              <div className="space-y-0.5">
                <span className="font-bold text-slate-900 text-xs block group-hover:text-blue-600">
                  Deriv Withdrawal Cashier
                </span>
                <span className="text-[11px] text-slate-500">Request payout directly</span>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
            </a>

            <a
              href="https://app.deriv.com/cashier/account-transfer"
              target="_blank"
              rel="noreferrer noopener"
              className="p-4 rounded-xl border border-slate-200 hover:border-blue-600 hover:bg-blue-50/30 transition-all flex items-center justify-between group"
            >
              <div className="space-y-0.5">
                <span className="font-bold text-slate-900 text-xs block group-hover:text-blue-600">
                  Account Transfer
                </span>
                <span className="text-[11px] text-slate-500">Move funds between accounts</span>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
            </a>
          </div>
        </div>

        {/* Tabbed In-App Payment Provider Interface */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <button
              onClick={() => setActiveTab('deposit')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
                activeTab === 'deposit'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Deposit Funds (In-App Gateway)
            </button>
            <button
              onClick={() => setActiveTab('withdraw')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
                activeTab === 'withdraw'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Withdrawal Request
            </button>
          </div>

          {statusMessage && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-2.5 text-xs text-blue-800">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
              <span>{statusMessage}</span>
            </div>
          )}

          <form onSubmit={handleSimulatedSubmit} className="space-y-4 max-w-lg">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {activeTab === 'deposit' ? 'Deposit Amount ($ USD)' : 'Withdrawal Amount ($ USD)'}
              </label>
              <input
                type="number"
                min="10"
                step="1"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Payment Channel
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setMethod('card')}
                  className={`p-3 rounded-xl border text-center text-xs font-semibold flex flex-col items-center justify-center gap-1.5 transition-all ${
                    method === 'card'
                      ? 'border-blue-600 bg-blue-50/50 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Card / Visa</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('crypto')}
                  className={`p-3 rounded-xl border text-center text-xs font-semibold flex flex-col items-center justify-center gap-1.5 transition-all ${
                    method === 'crypto'
                      ? 'border-blue-600 bg-blue-50/50 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <Coins className="w-4 h-4" />
                  <span>USDT / Crypto</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('wire')}
                  className={`p-3 rounded-xl border text-center text-xs font-semibold flex flex-col items-center justify-center gap-1.5 transition-all ${
                    method === 'wire'
                      ? 'border-blue-600 bg-blue-50/50 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <Building className="w-4 h-4" />
                  <span>Bank Wire</span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="py-2.5 px-5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors"
            >
              {activeTab === 'deposit' ? 'Proceed with In-App Deposit' : 'Submit Withdrawal Order'}
            </button>
          </form>
        </div>
      </main>

      <MobileNav />
    </div>
  );
}
