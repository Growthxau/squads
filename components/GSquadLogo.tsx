import React from 'react';

interface GSquadLogoProps {
  className?: string;
  showText?: boolean;
  textClassName?: string;
  subtitle?: string;
}

export function GSquadRobotIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center shrink-0 ${className}`}>
      <svg
        viewBox="0 0 100 90"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-sm"
      >
        <defs>
          {/* Lavender/Purple Gradient for ears & antenna */}
          <linearGradient id="purpleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>

          {/* Chassis White/Silver Gradient */}
          <linearGradient id="chassisGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#e2e8f0" />
          </linearGradient>

          {/* Screen Dark Charcoal Gradient */}
          <linearGradient id="screenGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>

          {/* Cyan Glow Filter for Eyes & Smile */}
          <filter id="cyanGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor="#06b6d4" floodOpacity="0.8" />
          </filter>
        </defs>

        {/* Top Antenna / Head Node */}
        <rect x="42" y="8" width="16" height="10" rx="5" fill="url(#purpleGradient)" />

        {/* Left Ear Node */}
        <rect x="6" y="38" width="12" height="22" rx="6" fill="url(#purpleGradient)" />

        {/* Right Ear Node */}
        <rect x="82" y="38" width="12" height="22" rx="6" fill="url(#purpleGradient)" />

        {/* Outer Head Chassis (White squircle with soft border) */}
        <rect
          x="14"
          y="15"
          width="72"
          height="65"
          rx="22"
          fill="url(#chassisGradient)"
          stroke="#cbd5e1"
          strokeWidth="1.5"
        />

        {/* Inner Screen Faceplate (Charcoal squircle) */}
        <rect
          x="23"
          y="25"
          width="54"
          height="45"
          rx="15"
          fill="url(#screenGradient)"
        />

        {/* Glowing Cyan Eyes */}
        <circle cx="39" cy="45" r="5" fill="#00f5ff" filter="url(#cyanGlow)" />
        <circle cx="61" cy="45" r="5" fill="#00f5ff" filter="url(#cyanGlow)" />

        {/* Glowing Cyan Smile */}
        <path
          d="M 43 56 Q 50 62 57 56"
          stroke="#00f5ff"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          filter="url(#cyanGlow)"
        />
      </svg>
    </div>
  );
}

export function GSquadLogo({
  className = 'w-9 h-9',
  showText = true,
  textClassName = 'text-xl',
  subtitle = 'Deriv Auto-Trader',
}: GSquadLogoProps) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <GSquadRobotIcon className={className} />
      {showText && (
        <div className="flex flex-col">
          <span className={`font-bold tracking-tight text-slate-900 leading-none ${textClassName}`}>
            G-SQUAD
          </span>
          {subtitle && (
            <span className="text-[10px] uppercase font-semibold tracking-wider text-blue-600 leading-none mt-1">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
