import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center">
      <h2 className="text-2xl font-bold text-slate-900 mb-2">404 - Page Not Found</h2>
      <p className="text-sm text-slate-500 mb-6">The requested page could not be found.</p>
      <Link
        href="/"
        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl shadow-sm transition-colors"
      >
        Return to Home
      </Link>
    </div>
  );
}
