'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GSquadRobotIcon } from './GSquadLogo';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Shield,
  CheckCircle2,
} from 'lucide-react';

interface AuthFlatCardProps {
  initialMode?: 'login' | 'register';
}

export function AuthFlatCard({ initialMode = 'login' }: AuthFlatCardProps) {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Check if already authenticated; if so, redirect directly to dashboard
  useEffect(() => {
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
      .catch(() => {})
      .finally(() => {
        if (!ignore) setCheckingAuth(false);
      });
    return () => {
      ignore = true;
    };
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (mode === 'register') {
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setLoading(true);

    try {
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const token = typeof window !== 'undefined' ? localStorage.getItem('gsquad_session_token') : null;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `${mode === 'login' ? 'Sign In' : 'Registration'} failed.`);
        setLoading(false);
        return;
      }

      if (data.token && typeof window !== 'undefined') {
        localStorage.setItem('gsquad_session_token', data.token);
      }

      if (mode === 'register') {
        router.push('/auth/verify');
      } else {
        if (data.user && !data.user.isVerified) {
          router.push('/auth/verify');
        } else {
          router.push('/dashboard');
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Network error: ${message}`);
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <GSquadRobotIcon className="w-12 h-12 animate-pulse" />
          <span className="text-xs font-medium text-slate-500">Opening G-Squad...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/70 flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-[420px]">
        {/* Flat Card Container */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
          {/* Robot Mascot Header */}
          <div className="flex flex-col items-center text-center space-y-2">
            <GSquadRobotIcon className="w-16 h-16" />
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-none">
                G-SQUAD
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Autonomous Deriv Trading Terminal
              </p>
            </div>
          </div>

          {/* Flat Segmented Tab Switch */}
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl gap-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setSuccess(null);
              }}
              className={`py-2 rounded-lg transition-all ${
                mode === 'login'
                  ? 'bg-white text-slate-900 border border-slate-200/80 shadow-xs'
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
              className={`py-2 rounded-lg transition-all ${
                mode === 'register'
                  ? 'bg-white text-slate-900 border border-slate-200/80 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Feedback Alerts */}
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-700">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{success}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="trader@example.com"
                  className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-colors"
                />
                <Mail className="w-4 h-4 absolute right-3.5 top-3 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password {mode === 'register' ? '(minimum 8 characters)' : ''}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-colors"
                  />
                  <Lock className="w-4 h-4 absolute right-3.5 top-3 text-slate-400 pointer-events-none" />
                </div>
              </div>
            )}

            {mode === 'register' && (
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-[11px] text-slate-600 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                  <Shield className="w-3.5 h-3.5 text-blue-600" />
                  <span>Unique GSQ Account ID</span>
                </div>
                <p className="text-slate-500">
                  A unique ID (e.g. <span className="font-mono font-bold text-blue-600">GSQ-610063</span>) will be assigned to your trading profile upon creation.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {loading ? (
                <span>Processing...</span>
              ) : mode === 'login' ? (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  <span>Create Account & Verify</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Switch Text Link */}
          <div className="pt-2 text-center text-xs text-slate-500">
            {mode === 'login' ? (
              <span>
                New to G-Squad?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                  }}
                  className="font-semibold text-blue-600 hover:underline"
                >
                  Create an account
                </button>
              </span>
            ) : (
              <span>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  className="font-semibold text-blue-600 hover:underline"
                >
                  Sign in
                </button>
              </span>
            )}
          </div>
        </div>

        {/* Minimal Footer */}
        <div className="mt-6 text-center text-[11px] text-slate-400">
          <span>G-Squad Autonomous Engine · Deriv API Integration</span>
        </div>
      </div>
    </div>
  );
}
