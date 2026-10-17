'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GSquadRobotIcon } from './GSquadLogo';
import { DerivLogoIcon } from './DerivLogo';
import {
  ArrowRight,
  AlertCircle,
  Shield,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Zap,
  TrendingUp,
  Lock,
} from 'lucide-react';

interface AuthFlatCardProps {
  initialMode?: 'login' | 'register';
}

const SPLASH_DURATION_MS = 8000; // Exact 8 seconds splash screen

export function AuthFlatCard({ initialMode = 'login' }: AuthFlatCardProps) {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const [splashProgress, setSplashProgress] = useState(0);
  const [splashStatus, setSplashStatus] = useState('Initializing G-Squad Engine...');
  const [oauthConfig, setOAuthConfig] = useState<{ clientId: string; redirectUri: string } | null>(null);

  // 8-second Splash Screen Timer with smooth progress
  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / SPLASH_DURATION_MS) * 100));
      setSplashProgress(pct);

      if (elapsed < 2500) {
        setSplashStatus('Initializing G-Squad Autonomous Engine...');
      } else if (elapsed < 5000) {
        setSplashStatus('Establishing Deriv OAuth 2.0 PKCE Handshake...');
      } else if (elapsed < 7200) {
        setSplashStatus('Calibrating Synthetic Volatility 5-Tick Algorithms...');
      } else {
        setSplashStatus('Terminal Ready.');
      }

      if (elapsed >= SPLASH_DURATION_MS) {
        clearInterval(interval);
        setShowSplash(false);
      }
    }, 50);

    return () => clearInterval(interval);
  }, []);

  // Listen for OAuth messages from the popup window
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      const isAllowedOrigin =
        !origin ||
        origin.endsWith('.run.app') ||
        origin.includes('localhost') ||
        origin.includes('vercel.app') ||
        origin === window.location.origin;

      if (!isAllowedOrigin) return;

      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setOauthLoading(false);
        setSuccess('Authenticated with Deriv! Loading your Terminal...');
        if (event.data.token && typeof window !== 'undefined') {
          localStorage.setItem('gsquad_session_token', event.data.token);
        }
        setTimeout(() => {
          router.replace('/dashboard');
        }, 600);
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        setOauthLoading(false);
        setError(event.data.error || 'Deriv OAuth authorization was cancelled or failed.');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [router]);

  // Fetch OAuth diagnostics
  useEffect(() => {
    fetch('/api/auth/deriv/config')
      .then((res) => res.json())
      .then((data) => setOAuthConfig(data))
      .catch(() => {});
  }, []);

  // Check if already authenticated; if so, redirect directly to dashboard
  useEffect(() => {
    if (showSplash) return;
    let ignore = false;
    const token = typeof window !== 'undefined' ? localStorage.getItem('gsquad_session_token') : null;
    fetch('/api/auth/me', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (!ignore && data?.authenticated) {
          router.replace('/dashboard');
        }
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [router, showSplash]);

  // Deriv OAuth 2.0 PKCE Flow Handler
  const handleDerivOAuth = async (targetMode: 'login' | 'register') => {
    setError(null);
    setSuccess(null);
    setOauthLoading(true);

    try {
      const res = await fetch(`/api/auth/deriv/init?mode=${targetMode}`);
      const data = await res.json();

      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Failed to initialize Deriv OAuth authorization.');
      }

      const width = 600;
      const height = 740;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2.5;

      const popup = window.open(
        data.url,
        'deriv_oauth_window',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,status=no`
      );

      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        window.location.href = data.url;
        return;
      }

      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer);
          setOauthLoading(false);
        }
      }, 1000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`OAuth Error: ${message}`);
      setOauthLoading(false);
    }
  };

  // 8-Second Animated Splash Screen
  if (showSplash) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 select-none relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-sm flex flex-col items-center text-center space-y-4 relative z-10">
          <div className="relative">
            <GSquadRobotIcon className="w-24 h-24 drop-shadow-xl animate-pulse" />
            <div className="absolute -inset-3 bg-red-500/15 rounded-full blur-xl animate-ping opacity-25" />
          </div>

          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">
              G-SQUAD
            </h1>
            <p className="text-xs uppercase font-bold tracking-widest text-red-600 mt-1">
              Autonomous Deriv Terminal
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 py-12 select-none">
      <div className="w-full max-w-[420px]">
        {/* Flat Card Container */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
          {/* Mascot & Header */}
          <div className="flex flex-col items-center text-center space-y-2">
            <GSquadRobotIcon className="w-16 h-16" />
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 leading-none">
                G-SQUAD
              </h1>
              <p className="text-xs text-red-600 font-bold uppercase tracking-wider mt-1">
                Autonomous Deriv Terminal
              </p>
            </div>
          </div>

          {/* Flat Segmented Tab Switch */}
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl gap-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setSuccess(null);
              }}
              className={`py-2.5 rounded-xl transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
                setSuccess(null);
              }}
              className={`py-2.5 rounded-xl transition-all cursor-pointer ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Feedback Alerts */}
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-2.5 text-xs text-emerald-700">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span className="leading-relaxed">{success}</span>
            </div>
          )}

          {/* Primary Deriv OAuth 2.0 PKCE Action */}
          <div className="space-y-4">
            {mode === 'login' ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => handleDerivOAuth('login')}
                  disabled={oauthLoading}
                  className="w-full flex items-center justify-between p-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl shadow-sm transition-all border border-red-500 cursor-pointer disabled:opacity-60 group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-white rounded-xl shrink-0">
                      <DerivLogoIcon className="w-5 h-5 group-hover:scale-105 transition-transform" />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-extrabold flex items-center gap-1.5 leading-tight">
                        <span>Continue with Deriv</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 bg-black/20 text-white rounded-md">
                          OAuth 2.0
                        </span>
                      </div>
                      <div className="text-[11px] text-red-100 mt-0.5">
                        Log in with your verified Deriv account
                      </div>
                    </div>
                  </div>
                  {oauthLoading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4 text-red-100 group-hover:translate-x-0.5 transition-transform" />
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => handleDerivOAuth('register')}
                  disabled={oauthLoading}
                  className="w-full flex items-center justify-between p-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl shadow-sm transition-all border border-red-500 cursor-pointer disabled:opacity-60 group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-white rounded-xl shrink-0">
                      <DerivLogoIcon className="w-5 h-5 group-hover:scale-105 transition-transform" />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-extrabold flex items-center gap-1.5 leading-tight">
                        <span>Register with Deriv</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 bg-black/20 text-white rounded-md">
                          Instant
                        </span>
                      </div>
                      <div className="text-[11px] text-red-100 mt-0.5">
                        Create and link a new Deriv account
                      </div>
                    </div>
                  </div>
                  {oauthLoading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4 text-red-100 group-hover:translate-x-0.5 transition-transform" />
                  )}
                </button>
              </div>
            )}

            {/* Institutional Security Highlights */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2.5 text-xs text-slate-600">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <ShieldCheck className="w-4 h-4 text-red-600 shrink-0" />
                <span>Institutional-Grade Security Highlights</span>
              </div>
              <ul className="space-y-1.5 text-[11px] text-slate-500 leading-relaxed">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                  <span>PKCE (Proof Key for Code Exchange) S256 verification</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                  <span>Direct Deriv authentication — passwords never shared</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                  <span>Server-enforced Stop Loss and Daily Profit targets</span>
                </li>
              </ul>
            </div>

            {/* Secure Protocol Badge */}
            <div className="pt-1 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5 text-slate-500 font-medium">
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                <span>Encrypted OAuth 2.0 Connection</span>
              </span>
              <a
                href="https://developers.deriv.com/docs/intro/oauth/"
                target="_blank"
                rel="noreferrer"
                className="hover:text-red-600 flex items-center gap-0.5 transition-colors font-medium text-slate-400 hover:underline"
              >
                <span>OAuth 2.0 Docs</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>

        {/* Minimal Footer */}
        <div className="mt-6 text-center text-[11px] text-slate-400">
          <span>G-Squad Autonomous Engine · Powered by Deriv OAuth 2.0</span>
        </div>
      </div>
    </div>
  );
}
