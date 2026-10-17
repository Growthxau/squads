'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { MobileNav } from '@/components/MobileNav';
import { TradingChart } from '@/components/TradingChart';
import { SanitizedUser } from '@/lib/auth';
import { GSquadRobotIcon } from '@/components/GSquadLogo';
import { DerivLogoIcon } from '@/components/DerivLogo';
import { TradeRecord } from '@/lib/db';
import { BotTelemetryLog, EngineState } from '@/lib/trading/engine';
import {
  Play,
  Square,
  Shield,
  Activity,
  Key,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Sliders,
  DollarSign,
  Clock,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Info,
} from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<SanitizedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingBalance, setRefreshingBalance] = useState(false);

  // Bot & Trading State
  const [engineStatus, setEngineStatus] = useState<EngineState['status']>('IDLE');
  const [recentTicks, setRecentTicks] = useState<EngineState['recentTicks']>([]);
  const [activeContract, setActiveContract] = useState<EngineState['activeContract']>(null);
  const [telemetryLogs, setTelemetryLogs] = useState<BotTelemetryLog[]>([]);
  const [trades, setTrades] = useState<TradeRecord[]>([]);

  // Config Form State
  const [stake, setStake] = useState<number>(5.0);
  const [maxDailyLoss, setMaxDailyLoss] = useState<number>(50.0);
  const [dailyProfitTarget, setDailyProfitTarget] = useState<number>(100.0);
  const [maxRun, setMaxRun] = useState<number>(5);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configNotice, setConfigNotice] = useState<string | null>(null);

  // Action status
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [oauthConnecting, setOauthConnecting] = useState(false);

  const handleConnectOAuth = async () => {
    try {
      setOauthConnecting(true);
      const res = await fetch('/api/auth/deriv/init?mode=login');
      const data = await res.json();
      if (data.url) {
        const width = 600;
        const height = 740;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2.5;
        const popup = window.open(
          data.url,
          'deriv_oauth_dash',
          `width=${width},height=${height},left=${left},top=${top}`
        );
        if (!popup || popup.closed) {
          window.location.href = data.url;
        }
      }
    } catch (e) {
      console.warn('OAuth error:', e);
    } finally {
      setOauthConnecting(false);
    }
  };


  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/history');
      if (res.ok) {
        const data = await res.json();
        setTrades(data.trades || []);
      }
    } catch (e) {
      console.warn('Failed to fetch trades:', e);
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    setRefreshingBalance(true);
    try {
      const res = await fetch('/api/deriv/balance');
      if (res.ok) {
        const data = await res.json();
        setUser((prev) => {
          if (!prev || !prev.derivConnection) return prev;
          return {
            ...prev,
            derivConnection: {
              ...prev.derivConnection,
              balance: data.balance,
              connectedCurrency: data.currency || prev.derivConnection.connectedCurrency,
            },
          };
        });
      }
    } catch (e) {
      console.warn('Balance refresh error:', e);
    } finally {
      setRefreshingBalance(false);
    }
  }, []);

  // 2. Poll engine status
  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/status');
      if (res.ok) {
        const data = await res.json();
        setEngineStatus(data.engineStatus);
        setRecentTicks(data.recentTicks || []);
        setActiveContract(data.activeContract || null);
        setTelemetryLogs(data.logs || []);

        if (data.dailyStats) {
          setUser((prev) => (prev ? { ...prev, dailyStats: data.dailyStats } : prev));
        }

        // If a trade completed, refresh history
        if (data.activeContract === null && data.engineStatus !== 'CONTRACT_ACTIVE') {
          fetchTrades();
          refreshBalance();
        }
      }
    } catch (e) {
      console.warn('Status poll failed:', e);
    }
  }, [fetchTrades, refreshBalance]);

  useEffect(() => {
    let ignore = false;
    const init = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
          setUser(null);
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (!ignore && data.user) {
          if (!data.user.isVerified) {
            router.push('/auth/verify');
            return;
          }
          setUser(data.user);
          setStake(data.user.botSettings.stake);
          setMaxDailyLoss(data.user.botSettings.maxDailyLoss);
          setDailyProfitTarget(data.user.botSettings.dailyProfitTarget);
          setMaxRun(data.user.botSettings.maxRun || 5);
          fetchTrades();
        }
      } catch {
        if (!ignore) {
          setUser(null);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    init().then(() => {
      if (!ignore) {
        pollStatus();
      }
    });

    pollIntervalRef.current = setInterval(() => {
      pollStatus();
    }, 1500);

    return () => {
      ignore = true;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [router, pollStatus, fetchTrades]);

  // Save Settings
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setConfigNotice(null);
    setActionError(null);

    try {
      const res = await fetch('/api/trading/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stake,
          maxDailyLoss,
          dailyProfitTarget,
          maxRun,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || 'Failed to update settings');
      } else {
        setConfigNotice('Risk & trading limits saved successfully.');
        if (data.user) setUser(data.user);
        setTimeout(() => setConfigNotice(null), 3000);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setActionError(`Error saving configuration: ${message}`);
    } finally {
      setSavingConfig(false);
    }
  };

  // Start Bot
  const handleStartBot = async () => {
    setActionError(null);
    setActionLoading(true);

    try {
      const res = await fetch('/api/trading/start', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || 'Failed to start bot');
      } else {
        pollStatus();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setActionError(`Start error: ${message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Stop Bot
  const handleStopBot = async () => {
    setActionError(null);
    setActionLoading(true);

    try {
      const res = await fetch('/api/trading/stop', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || 'Failed to stop bot');
      } else {
        pollStatus();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setActionError(`Stop error: ${message}`);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-2">
          <Activity className="w-8 h-8 animate-pulse text-blue-600 mx-auto" />
          <div className="text-sm font-semibold text-slate-700">Loading G-Squad Terminal...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col pb-16 md:pb-0">
        <Navbar user={null} />
        <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-16 flex flex-col items-center justify-center text-center space-y-6">
          <div className="p-4 bg-red-50 border border-red-100 rounded-3xl shadow-sm">
            <GSquadRobotIcon className="w-20 h-20 text-red-600 animate-pulse" />
          </div>
          <div className="space-y-2 max-w-lg">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              G-Squad Autonomous Deriv Terminal
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Connect your Deriv account securely via OAuth 2.0 PKCE to launch institutional-grade synthetic indices 5-tick automated trading with server-side risk limits.
            </p>
          </div>
          <div className="pt-2">
            <button
              onClick={handleConnectOAuth}
              disabled={oauthConnecting}
              className="inline-flex items-center gap-2.5 px-6 py-3.5 text-base font-bold text-white bg-red-600 hover:bg-red-700 rounded-2xl shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              <DerivLogoIcon className="w-5 h-5" />
              <span>{oauthConnecting ? 'Connecting to Deriv...' : 'Login with Deriv'}</span>
            </button>
          </div>
        </main>
      </div>
    );
  }

  const derivConn = user?.derivConnection;
  const isBotActive = engineStatus !== 'IDLE' && engineStatus !== 'HALTED_RISK';
  const dailyPnL = user?.dailyStats.dailyProfitLoss ?? 0;
  const totalTrades = user?.dailyStats.totalTrades ?? 0;
  const wins = user?.dailyStats.wins ?? 0;
  const losses = user?.dailyStats.losses ?? 0;
  const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0.0';

  // Risk limits status
  const hitStop = user?.dailyStats.hitStopLoss ?? false;
  const hitTarget = user?.dailyStats.hitTakeProfit ?? false;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-16 md:pb-0">
      <Navbar user={user} onRefreshBalance={refreshBalance} isRefreshing={refreshingBalance} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Top Status & Deriv Banner */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Account & Deriv Identifier */}
            <div className="flex items-center gap-4">
              <GSquadRobotIcon className="w-12 h-12" />
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-slate-900 text-lg tracking-tight">
                    {user?.accountNumber}
                  </span>
                  <span className="text-xs px-2 py-0.5 font-bold uppercase rounded bg-slate-100 text-slate-700">
                    G-Squad Terminal
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  {derivConn?.connected ? (
                    <>
                      <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span className="font-semibold text-slate-700">Deriv Account: {derivConn.connectedAccountId}</span>
                      <span className="uppercase text-[10px] font-bold text-slate-500">({derivConn.connectedAccountType})</span>
                      <span>·</span>
                      <Link href="/connect-deriv" className="text-blue-600 hover:underline">
                        Switch Account
                      </Link>
                    </>
                  ) : (
                    <span className="text-amber-600 font-medium flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      No Deriv Account Connected. Connect your account to enable live trading.
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Deriv Balance & Cashier Action */}
            <div className="flex items-center gap-4 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
              {derivConn?.connected ? (
                <div className="flex items-center gap-3">
                  <div className="text-left md:text-right">
                    <span className="text-xs text-slate-400 font-semibold uppercase">Account Balance</span>
                    <div className="text-xl font-extrabold text-slate-900 font-mono">
                      ${derivConn.balance.toFixed(2)}{' '}
                      <span className="text-xs font-semibold text-slate-500">{derivConn.connectedCurrency}</span>
                    </div>
                  </div>
                  <button
                    onClick={refreshBalance}
                    disabled={refreshingBalance}
                    title="Refresh Live Balance"
                    className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${refreshingBalance ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              ) : (
                <Link
                  href="/connect-deriv"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors"
                >
                  <Key className="w-4 h-4" />
                  <span>Connect Deriv PAT</span>
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Global Notifications / Error Banners */}
        {actionError && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-xs text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <div>
              <span className="font-bold block">Engine Alert</span>
              <span>{actionError}</span>
            </div>
          </div>
        )}

        {configNotice && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{configNotice}</span>
          </div>
        )}

        {/* Risk Stop Alerts */}
        {hitStop && (
          <div className="p-4 bg-rose-50 border border-rose-300 rounded-xl flex items-center gap-3 text-xs text-rose-800 font-medium">
            <Shield className="w-5 h-5 text-rose-600 shrink-0" />
            <span>
              <strong>Capital Protection Active:</strong> Maximum daily loss limit reached today. Trading is halted on the server until tomorrow.
            </span>
          </div>
        )}

        {hitTarget && (
          <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center gap-3 text-xs text-emerald-800 font-medium">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>
              <strong>Daily Target Reached:</strong> Target profit banked. Trading is halted on the server to preserve daily gains.
            </span>
          </div>
        )}

        {/* Performance Metrics Cards Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Daily P&L */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Daily Profit / Loss</span>
              {dailyPnL >= 0 ? (
                <ArrowUpRight className="w-4 h-4 text-emerald-600" />
              ) : (
                <ArrowDownRight className="w-4 h-4 text-rose-600" />
              )}
            </div>
            <div
              className={`text-2xl font-black font-mono tracking-tight ${
                dailyPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {dailyPnL >= 0 ? `+$${dailyPnL.toFixed(2)}` : `-$${Math.abs(dailyPnL).toFixed(2)}`}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Today&apos;s realized contracts</div>
          </div>

          {/* Win Rate */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Win Rate</span>
              <TrendingUp className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-black font-mono tracking-tight text-slate-900">
              {winRate}%
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {wins} Won · {losses} Lost ({totalTrades} total)
            </div>
          </div>

          {/* Profit Target Progress */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Target Progress</span>
              <span className="font-semibold text-slate-700">${dailyProfitTarget.toFixed(2)} Target</span>
            </div>
            <div className="text-2xl font-black font-mono tracking-tight text-blue-600">
              {Math.min(100, Math.max(0, (dailyPnL / dailyProfitTarget) * 100)).toFixed(0)}%
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, Math.max(0, (dailyPnL / dailyProfitTarget) * 100))}%`,
                }}
              ></div>
            </div>
          </div>

          {/* Stop Loss Safety Buffer */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Stop Loss Safety</span>
              <span className="font-semibold text-rose-600">${maxDailyLoss.toFixed(2)} Stop</span>
            </div>
            <div className="text-2xl font-black font-mono tracking-tight text-slate-900">
              ${Math.max(0, maxDailyLoss + (dailyPnL < 0 ? dailyPnL : 0)).toFixed(2)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Remaining capital loss buffer</div>
          </div>
        </div>

        {/* Main Control Center & Live Chart Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Bot Execution & Risk Controls */}
          <div className="lg:col-span-5 space-y-6">
            {/* Bot Master Control Box */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Bot Execution Center</h2>
                  <p className="text-xs text-slate-500 mt-0.5">5-Tick Autonomous Synthetic Execution</p>
                </div>
                {/* Engine Status Badge */}
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono uppercase ${
                      engineStatus === 'IDLE'
                        ? 'bg-slate-100 text-slate-600'
                        : engineStatus === 'ANALYZING_TICKS'
                        ? 'bg-blue-100 text-blue-700 animate-pulse'
                        : engineStatus === 'CONTRACT_ACTIVE'
                        ? 'bg-emerald-100 text-emerald-800'
                        : engineStatus === 'CALCULATING_PROPOSAL'
                        ? 'bg-amber-100 text-amber-800'
                        : engineStatus === 'HALTED_RISK'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-indigo-100 text-indigo-800'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-current"></span>
                    <span>{engineStatus.replace('_', ' ')}</span>
                  </span>
                </div>
              </div>

              {/* Bot Control Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleStartBot}
                  disabled={actionLoading || isBotActive || !derivConn?.connected || hitStop || hitTarget}
                  className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Start Bot</span>
                </button>
                <button
                  type="button"
                  onClick={handleStopBot}
                  disabled={actionLoading || !isBotActive}
                  className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Square className="w-4 h-4 fill-rose-600" />
                  <span>Stop Bot</span>
                </button>
              </div>

              {!derivConn?.connected && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-800">
                  <span>Connect your Deriv account to activate bot buttons.</span>
                  <button
                    type="button"
                    onClick={() => {
                      const width = 600;
                      const height = 740;
                      const left = window.screenX + (window.outerWidth - width) / 2;
                      const top = window.screenY + (window.outerHeight - height) / 2.5;
                      fetch('/api/auth/deriv/init?mode=login')
                        .then((res) => res.json())
                        .then((data) => {
                          if (data.url) {
                            window.open(data.url, 'deriv_oauth_dash_notice2', `width=${width},height=${height},left=${left},top=${top}`);
                          }
                        });
                    }}
                    className="font-bold underline text-amber-900 cursor-pointer"
                  >
                    Connect Now
                  </button>
                </div>
              )}
            </div>

            {/* Risk Management & Strategy Settings Form */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-900">Trading & Risk Parameters</h3>
                </div>
                <span className="text-[11px] font-semibold text-slate-400">Server-Side Enforced</span>
              </div>

              <form onSubmit={handleSaveConfig} className="space-y-4">
                {/* Fixed Strategy Info */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Market Asset
                    </label>
                    <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 text-center">
                      Volatility 100
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Duration / Engine
                    </label>
                    <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 text-center">
                      5 Ticks + Gemini AI
                    </div>
                  </div>
                </div>

                {/* Stake Amount */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Base Stake Amount ($ USD)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.35"
                    max="500"
                    value={stake}
                    onChange={(e) => setStake(parseFloat(e.target.value) || 0)}
                    disabled={isBotActive}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Martingale doubles stake after each loss.</p>
                </div>

                {/* Max Daily Loss & Daily Profit Target */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Max Daily Loss ($)
                    </label>
                    <input
                      type="number"
                      step="5"
                      min="1"
                      value={maxDailyLoss}
                      onChange={(e) => setMaxDailyLoss(parseFloat(e.target.value) || 0)}
                      disabled={isBotActive}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-semibold text-rose-600 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Daily Target ($)
                    </label>
                    <input
                      type="number"
                      step="5"
                      min="1"
                      value={dailyProfitTarget}
                      onChange={(e) => setDailyProfitTarget(parseFloat(e.target.value) || 0)}
                      disabled={isBotActive}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-semibold text-emerald-600 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
                    />
                  </div>
                </div>

                {/* Max Run */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Max Run (Max Consecutive Losses)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="20"
                    value={maxRun}
                    onChange={(e) => setMaxRun(parseInt(e.target.value) || 5)}
                    disabled={isBotActive}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Stops bot if consecutive losses reach this limit.</p>
                </div>

                <button
                  type="submit"
                  disabled={savingConfig || isBotActive}
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50"
                >
                  {savingConfig ? 'Saving...' : 'Save Risk & Trading Limits'}
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: Live Chart & Telemetry Event Log */}
          <div className="lg:col-span-7 space-y-6">
            {/* Real-time SVG Tick Chart */}
            <TradingChart
              symbol={symbol}
              ticks={recentTicks}
              activeContract={activeContract}
              botStatus={engineStatus}
            />

            {/* Operational Event Log & Strategy Telemetry */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-900">Engine Operational Stream</h3>
                </div>
                <span className="text-[11px] font-mono text-slate-400">Live Audit Trail</span>
              </div>

              <div className="h-44 overflow-y-auto bg-slate-950 text-slate-200 rounded-xl p-3 font-mono text-xs space-y-1.5 shadow-inner">
                {telemetryLogs.length === 0 ? (
                  <div className="text-slate-500 italic py-8 text-center">
                    Engine idle. Press &quot;Start Bot&quot; to initialize synthetic tick streaming.
                  </div>
                ) : (
                  telemetryLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                      <span className="text-slate-500 shrink-0 select-none">[{log.timestamp}]</span>
                      <span
                        className={
                          log.type === 'trade'
                            ? 'text-emerald-400 font-semibold'
                            : log.type === 'risk'
                            ? 'text-rose-400 font-bold'
                            : log.type === 'warning'
                            ? 'text-amber-400'
                            : log.type === 'error'
                            ? 'text-rose-500'
                            : 'text-slate-300'
                        }
                      >
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Trade History Section */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Executed Contracts & Performance History</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Full chronological ledger of 5-tick Rise/Fall contracts on your Deriv account.
              </p>
            </div>
            <button
              onClick={fetchTrades}
              className="text-xs text-blue-600 hover:underline font-semibold flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Ledger</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Contract ID</th>
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3">Market</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Stake</th>
                  <th className="py-2.5 px-3">Payout</th>
                  <th className="py-2.5 px-3">Net Profit</th>
                  <th className="py-2.5 px-3 text-right">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {trades.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 font-sans">
                      No trades recorded yet. Start the autonomous bot to execute 5-tick contracts.
                    </td>
                  </tr>
                ) : (
                  trades.map((t) => {
                    const isWin = t.status === 'won';
                    return (
                      <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-slate-800">#{t.contractId}</td>
                        <td className="py-2.5 px-3 text-slate-500 font-sans">
                          {new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td className="py-2.5 px-3 font-sans text-slate-700">{t.symbol}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              t.contractType === 'CALL'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {t.contractType === 'CALL' ? 'RISE' : 'FALL'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">${t.stake.toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-slate-700">${t.payout.toFixed(2)}</td>
                        <td className="py-2.5 px-3 font-bold">
                          <span className={isWin ? 'text-emerald-600' : 'text-rose-600'}>
                            {t.profit >= 0 ? `+$${t.profit.toFixed(2)}` : `-$${Math.abs(t.profit).toFixed(2)}`}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              isWin ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {isWin ? 'WON' : 'LOST'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <MobileNav />
    </div>
  );
}
