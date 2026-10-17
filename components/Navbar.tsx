'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { GSquadLogo } from './GSquadLogo';
import { DerivLogoIcon } from './DerivLogo';
import {
  Activity,
  HelpCircle,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { SanitizedUser } from '@/lib/auth';

interface NavbarProps {
  user?: SanitizedUser | null;
  onRefreshBalance?: () => void;
  isRefreshing?: boolean;
}

export function Navbar({ user, onRefreshBalance, isRefreshing = false }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [oauthConnecting, setOauthConnecting] = useState(false);

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('gsquad_session_token');
      }
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/auth/login');
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  };

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
          'deriv_oauth_nav',
          `width=${width},height=${height},left=${left},top=${top}`
        );
        if (!popup || popup.closed) {
          window.location.href = data.url;
        }
      }
    } catch (e) {
      console.warn('OAuth trigger error:', e);
    } finally {
      setOauthConnecting(false);
    }
  };

  const navLinks = [
    { href: '/dashboard', label: 'Trading Terminal', icon: Activity },
    { href: '/support', label: 'Help & Safety', icon: HelpCircle },
  ];

  const derivConn = user?.derivConnection;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <Link href={user ? '/dashboard' : '/'} className="flex items-center hover:opacity-90 transition-opacity">
          <GSquadLogo />
        </Link>

        {/* Desktop Navigation Links */}
        {user && (
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl transition-colors ${
                    isActive
                      ? 'bg-red-50 text-red-600 font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-red-600' : 'text-slate-500'}`} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>
        )}

        {/* Right Action / User Profile Status */}
        <div className="flex items-center gap-3">
          {user ? (
            <>
              {/* Deriv Connection Status Chip */}
              {derivConn?.connected ? (
                <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5 font-bold text-slate-800">
                      <span>{derivConn.connectedAccountId}</span>
                      <span className="text-[10px] uppercase font-bold text-slate-400 px-1 py-0.2 bg-slate-200 rounded">
                        {derivConn.connectedAccountType}
                      </span>
                    </div>
                    <span className="font-extrabold text-red-600 font-mono">
                      ${derivConn.balance.toFixed(2)} {derivConn.connectedCurrency}
                    </span>
                  </div>
                  {onRefreshBalance && (
                    <button
                      onClick={onRefreshBalance}
                      disabled={isRefreshing}
                      title="Refresh live balance from Deriv"
                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-red-600' : ''}`} />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleConnectOAuth}
                  disabled={oauthConnecting}
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <DerivLogoIcon className="w-3.5 h-3.5" />
                  <span>Connect Deriv</span>
                </button>
              )}

              {/* G-Squad User Identifier */}
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200 text-xs">
                <div className="flex flex-col text-right">
                  <span className="font-bold text-slate-900 tracking-tight">{user.accountNumber}</span>
                  <span className="text-[10px] text-slate-500 truncate max-w-[120px]">{user.email}</span>
                </div>
                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  title="Sign Out"
                  className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleConnectOAuth}
                disabled={oauthConnecting}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <DerivLogoIcon className="w-4 h-4" />
                <span>{oauthConnecting ? 'Connecting...' : 'Login with Deriv'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
