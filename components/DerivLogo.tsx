import React from 'react';

export function DerivLogoIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="24" height="24" rx="6" fill="#FF444F" />
      <path
        d="M6.5 7.5H12C14.7614 7.5 17 9.73858 17 12.5C17 15.2614 14.7614 17.5 12 17.5H6.5V7.5Z"
        fill="white"
      />
      <circle cx="11.8" cy="12.5" r="2.4" fill="#FF444F" />
    </svg>
  );
}
