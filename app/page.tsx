'use client';

import React, { useState, useEffect } from 'react';
import { GSquadRobotIcon } from '@/components/GSquadLogo';
import { DerivLogoIcon } from '@/components/DerivLogo';
import {
  ArrowRight,
  AlertCircle,
  ShieldCheck,
  Lock,
  ExternalLink,
} from 'lucide-react';
import DashboardPage from './dashboard/page';

const SPLASH_DURATION_MS = 8000; // Exact 8 seconds splash screen

export default function RootPage() {
  const [showSplash, setShowSplash] = useState(true);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // 8-second Splash Screen Timer
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
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
          window.location.reload();
        }, 600);
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        setOauthLoading(false);
        setError(event.data.error || 'Deriv OAuth authorization was cancelled or failed.');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

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

  // 8-Second Animated Splash Screen (App background bg-slate-50 with app name & logo)
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

  // After splash screen, render Dashboard directly
  return <DashboardPage />;
}
