'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Key, Wallet, HelpCircle } from 'lucide-react';

export function MobileNav() {
  const pathname = usePathname();

  const links = [
    { href: '/dashboard', label: 'Terminal', icon: Activity },
    { href: '/connect-deriv', label: 'Deriv PAT', icon: Key },
    { href: '/wallet', label: 'Wallet', icon: Wallet },
    { href: '/support', label: 'Support', icon: HelpCircle },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 px-2 py-1 shadow-lg">
      <div className="grid grid-cols-4 gap-1">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-[11px] font-medium transition-colors ${
                isActive ? 'text-blue-600 bg-blue-50/70' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'text-blue-600 stroke-[2.2]' : 'text-slate-400'}`} />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
