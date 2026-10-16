'use client';

import { useEffect } from 'react';

export function AuthInterceptor() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const originalFetch = window.fetch;
    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
      try {
        const token = localStorage.getItem('gsquad_session_token');
        if (token) {
          const urlStr =
            typeof input === 'string'
              ? input
              : input instanceof URL
              ? input.toString()
              : (input as Request).url;

          // Check if request is to this origin or API
          if (
            urlStr.startsWith('/') ||
            urlStr.startsWith(window.location.origin) ||
            urlStr.includes('/api/')
          ) {
            const newInit: RequestInit = { ...init };
            const headers = new Headers(newInit.headers || {});
            if (!headers.has('Authorization')) {
              headers.set('Authorization', `Bearer ${token}`);
              newInit.headers = headers;
            }
            return originalFetch.call(this, input, newInit);
          }
        }
      } catch {
        // Fallback to original fetch if anything fails
      }
      return originalFetch.call(this, input, init);
    };
  }, []);

  return null;
}
