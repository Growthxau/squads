'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { MobileNav } from '@/components/MobileNav';
import { SanitizedUser } from '@/lib/auth';
import { GSquadRobotIcon } from '@/components/GSquadLogo';
import {
  Key,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  CheckCircle2,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  RefreshCw,
  Trash2,
  Layers,
  Radio,
  Sliders,
} from 'lucide-react';

export default function ConnectDerivPage() {
  const router = useRouter();
  const [user, setUser] = useState<SanitizedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [pat, setPat] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
          if (!data.user.isVerified) {
            router.push('/auth/verify');
            return;
          }
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

  const refreshUser = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.user) setUser(data.user);
      }
    } catch {}
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setConnecting(true);

    try {
      const res = await fetch('/api/deriv/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pat }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to authenticate Personal Access Token.');
        setConnecting(false);
        return;
      }

      setSuccess(`Deriv account successfully connected (${data.connectedAccountId}).`);
      setPat('');
      if (data.user) {
        setUser(data.user);
      } else {
        await refreshUser();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Connection error: ${message}`);
    } finally {
      setConnecting(false);
    }
  };

  const handleSelectAccount = async (accountId: string) => {
    setError(null);
    setSuccess(null);
    setSwitching(true);

    try {
      const res = await fetch('/api/deriv/select-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to switch account.');
        setSwitching(false);
        return;
      }

      setSuccess(`Active account switched to ${accountId}.`);
      if (data.user) {
        setUser(data.user);
      } else {
        await refreshUser();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Switch error: ${message}`);
    } finally {
      setSwitching(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your Deriv account? This will halt any running bots and erase tokens from the server.')) {
      return;
    }

    setDisconnecting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/deriv/disconnect', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to disconnect account.');
        setDisconnecting(false);
        return;
      }

      setSuccess('Deriv account successfully disconnected.');
      if (data.user) {
        setUser(data.user);
      } else {
        await refreshUser();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Disconnect error: ${message}`);
    } finally {
      setDisconnecting(false);
    }
  };

  const derivConn = user?.derivConnection;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-16 md:pb-0">
      <Navbar user={user} onRefreshBalance={refreshUser} isRefreshing={loading} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Page Title & Breadcrumb */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Deriv Authentication (PAT Only)
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Securely authenticate your Deriv account using a Personal Access Token with Trade permission.
            </p>
          </div>
          {derivConn?.connected && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-lg">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Connected: {derivConn.connectedAccountId}</span>
              </span>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            </div>
          )}
        </div>

        {/* Feedback Notifications */}
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-sm text-rose-700 shadow-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
            <div className="space-y-1">
              <span className="font-semibold block">Authentication Error</span>
              <span>{error}</span>
            </div>
          </div>
        )}

        {success && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3 text-sm text-emerald-700 shadow-sm">
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
            <div className="space-y-1">
              <span className="font-semibold block">Success</span>
              <span>{success}</span>
            </div>
          </div>
        )}

        {/* Connected Accounts Manager (If connected) */}
        {derivConn?.connected ? (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Authorized Accounts Selection</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Select which authorized account you want the autonomous bot to trade with.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400">PAT Security</span>
                  <div className="font-mono text-xs text-slate-600 font-semibold">{derivConn.tokenMask}</div>
                </div>
              </div>

              {/* Accounts List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {derivConn.accounts.map((acc) => {
                  const isActive = acc.id === derivConn.connectedAccountId;
                  return (
                    <div
                      key={acc.id}
                      onClick={() => !isActive && !switching && handleSelectAccount(acc.id)}
                      className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                        isActive
                          ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">{acc.id}</span>
                            <span
                              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                                acc.type === 'demo'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {acc.type}
                            </span>
                          </div>
                          <span className="text-xs text-slate-500">{acc.isVirtual ? 'Virtual Practice' : 'Real Money Account'}</span>
                        </div>
                        {isActive ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-100 px-2.5 py-1 rounded-full">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Active
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={switching}
                            className="text-xs font-semibold text-slate-600 hover:text-blue-600 px-2 py-1 rounded hover:bg-slate-100"
                          >
                            Switch to this
                          </button>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="text-slate-500">Balance</span>
                        <span className="font-bold font-mono text-slate-900 text-sm">
                          ${acc.balance.toFixed(2)} {acc.currency}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action: Proceed to Terminal */}
              <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                <span className="text-xs text-slate-500">
                  Account is ready for 5-tick autonomous trading.
                </span>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors"
                >
                  <span>Go to Trading Terminal</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Connect PAT Form Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex items-start gap-4">
            <GSquadRobotIcon className="w-12 h-12" />
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-slate-900">
                {derivConn?.connected ? 'Update or Replace Personal Access Token' : 'Enter Your Deriv Personal Access Token (PAT)'}
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                G-Squad communicates directly with Deriv using your private token. We do not use OAuth redirects.
                Tokens are encrypted server-side using AES-256-GCM and never exposed to browser storage or JavaScript.
              </p>
            </div>
          </div>

          {/* Deriv Official Token Link Guidance */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
              <span>How to generate your token in 30 seconds:</span>
              <a
                href="https://home.deriv.com/dashboard/profile"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline font-bold"
              >
                <span>Open Deriv Profile</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside leading-relaxed">
              <li>Log in to Deriv and navigate to <strong>Profile &gt; API Token</strong> (or click the link above).</li>
              <li>Provide a token name (for example, <code className="bg-slate-200/60 px-1 py-0.5 rounded font-mono text-[11px]">G-Squad-Trader</code>).</li>
              <li>
                <strong className="text-slate-900">CRITICAL:</strong> Check the <strong>&quot;Trade&quot;</strong> and <strong>&quot;Read&quot;</strong> permission boxes. The token must have trade execution authority.
              </li>
              <li>Click &quot;Create&quot;, copy your token string, and paste it below.</li>
            </ol>
          </div>

          {/* Input Form */}
          <form onSubmit={handleConnect} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Deriv Personal Access Token (PAT)
              </label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  required
                  value={pat}
                  onChange={(e) => setPat(e.target.value)}
                  placeholder="Paste your Deriv PAT here (e.g. a1b2c3d4e5f6...)"
                  className="w-full pl-3.5 pr-10 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Security Guarantee Box */}
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Lock className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Zero password storage. Token is tested for the trade scope and encrypted immediately with AES-256-GCM.
              </span>
            </div>

            <button
              type="submit"
              disabled={connecting || pat.trim().length < 5}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-500/20 transition-all disabled:opacity-50"
            >
              {connecting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Validating & Connecting with Deriv...</span>
                </>
              ) : (
                <>
                  <span>Validate & Connect Deriv Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* API Architecture Reference Card */}
        <div className="bg-slate-100/70 border border-slate-200 rounded-2xl p-5 text-xs text-slate-600 space-y-2">
          <div className="flex items-center gap-2 font-bold text-slate-800">
            <Layers className="w-4 h-4 text-slate-600" />
            <span>Deriv Official API Conformance</span>
          </div>
          <p className="leading-relaxed">
            REST authentication utilizes <code className="bg-white px-1.5 py-0.5 rounded font-mono text-[11px] border border-slate-200">Authorization: Bearer &lt;PAT&gt;</code> and header <code className="bg-white px-1.5 py-0.5 rounded font-mono text-[11px] border border-slate-200">Deriv-App-ID: 1089</code>.
            WebSocket sessions subscribe through the documented secure handshake. No real-money trading ever starts automatically without an explicit user command.
          </p>
        </div>
      </main>

      <MobileNav />
    </div>
  );
}
