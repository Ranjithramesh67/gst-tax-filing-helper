import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md rounded-lg border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Firm not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          We could not find a firm for this address. Check the link or enter your firm code.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline"
        >
          Enter a firm code
        </Link>
      </div>
    </div>
  );
}
