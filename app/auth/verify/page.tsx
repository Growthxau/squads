'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GSquadLogo } from '@/components/GSquadLogo';
import {
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Mail,
  Key,
  ShieldAlert,
  RefreshCw,
  Send,
  Info,
} from 'lucide-react';

export default function VerifyPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [missingVars, setMissingVars] = useState<string[]>([]);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const checkStatus = React.useCallback(() => {
    fetch('/api/auth/verify')
      .then((res) => {
        if (!res.ok) {
          router.push('/auth/login');
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) {
          if (data.isVerified) {
            router.push('/dashboard');
            return;
          }
          setEmail(data.email);
          setAccountNumber(data.accountNumber);
          setSmtpConfigured(Boolean(data.smtpConfigured));
          if (data.missingSmtpVariables) {
            setMissingVars(data.missingSmtpVariables);
          }
          if (data.devVerificationCode) {
            setDevCode(data.devVerificationCode);
          } else {
            setDevCode(null);
          }
        }
      })
      .catch(() => {
        router.push('/auth/login');
      })
      .finally(() => setInitialLoading(false));
  }, [router]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Verification failed');
        setLoading(false);
        return;
      }

      setSuccess('Account verified successfully! Redirecting to Terminal...');
      setTimeout(() => {
        router.push('/dashboard');
      }, 1200);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Network error: ${message}`);
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setSuccess(null);
    setResending(true);

    try {
      const res = await fetch('/api/auth/verify/resend', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to resend code');
      } else {
        setSuccess(data.message || 'Verification code resent successfully.');
        if (data.emailResult?.codeForDev) {
          setDevCode(data.emailResult.codeForDev);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Resend error: ${message}`);
    } finally {
      setResending(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center text-slate-500 text-sm">Checking verification status...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center">
        <Link href="/" className="mb-6 hover:opacity-90 transition-opacity">
          <GSquadLogo className="w-10 h-10" textClassName="text-2xl" />
        </Link>
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900">
          Verify Your Email
        </h2>
        <p className="mt-1 text-center text-sm text-slate-500">
          Account {accountNumber ? <span className="font-semibold text-blue-600">{accountNumber}</span> : ''} · Security confirmation
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 rounded-2xl sm:px-10">
          {error && (
            <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-700">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{success}</span>
            </div>
          )}

          {/* Email Service Status Banner */}
          {!smtpConfigured ? (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-amber-900">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Email Delivery Service Diagnostic</span>
              </div>
              <p className="leading-relaxed">
                The running application server has not detected the following required environment variables:
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {missingVars.length > 0 ? (
                  missingVars.map((v) => (
                    <span
                      key={v}
                      className="px-2 py-0.5 bg-amber-100/80 border border-amber-300 rounded font-mono font-bold text-[10px] text-amber-900"
                    >
                      {v}
                    </span>
                  ))
                ) : (
                  <span className="font-mono text-[10px]">SMTP_HOST, SMTP_USER, SMTP_PASS</span>
                )}
              </div>
              <p className="text-[11px] text-amber-700/90 pt-1">
                Note: In Node.js / AI Studio, if environment variables were entered after the server started, restart the dev server to refresh the process runtime.
              </p>
              {devCode && (
                <div className="mt-2 pt-2 border-t border-amber-200 flex items-center justify-between">
                  <span>Development Verification Code:</span>
                  <button
                    type="button"
                    onClick={() => setCode(devCode)}
                    className="font-mono font-bold text-sm bg-white px-2.5 py-1 border border-amber-300 rounded text-amber-900 hover:bg-amber-100 cursor-pointer transition-colors"
                  >
                    {devCode} (Click to fill)
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="mb-6 p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 space-y-1">
              <div className="flex items-center gap-2 font-semibold">
                <Mail className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Verification email dispatched</span>
              </div>
              <p className="text-[11px] text-blue-700">
                A 6-digit code was transmitted via your configured SMTP server to <strong>{email}</strong>.
              </p>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Enter 6-Digit Verification Code
              </label>
              <input
                type="text"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-full text-center tracking-widest text-2xl font-mono py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent font-bold"
              />
            </div>

            <button
              type="submit"
              disabled={loading || code.length < 6}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all disabled:opacity-50"
            >
              {loading ? (
                <span>Validating Code...</span>
              ) : (
                <>
                  <span>Confirm Email & Enter Terminal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Resend Code & Switch Account Footer */}
          <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col gap-2.5 text-xs text-slate-500">
            <div className="flex items-center justify-between">
              <span>Didn&apos;t receive code?</span>
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="font-semibold text-blue-600 hover:underline flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${resending ? 'animate-spin' : ''}`} />
                <span>Resend Email</span>
              </button>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span>Wrong account?</span>
              <Link href="/auth/login" className="font-semibold text-slate-700 hover:underline">
                Sign In With Another Email
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
