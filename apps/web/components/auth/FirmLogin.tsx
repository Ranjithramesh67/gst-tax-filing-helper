'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useFirmBranding } from '@/lib/firm';
import { Button, Card, Field, Input } from '@/components/ui';

export function FirmLogin() {
  const { login } = useAuth();
  const branding = useFirmBranding();
  const router = useRouter();
  const params = useParams<{ firm: string }>();
  const slug = params?.firm ?? '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const accent = branding?.brandColor ?? undefined;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password, slug);
      router.replace(`/${slug}/dashboard`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <div
          className="flex flex-col items-center gap-2 border-b border-slate-200 px-6 py-6 text-center"
          style={accent ? { borderTop: `3px solid ${accent}` } : undefined}
        >
          {branding?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={branding.name} className="h-12 w-auto object-contain" />
          ) : (
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white"
              style={{ backgroundColor: accent ?? '#2563eb' }}
            >
              {(branding?.name ?? 'G').charAt(0)}
            </span>
          )}
          <h1 className="text-lg font-semibold text-slate-900">{branding?.name ?? 'Firm console'}</h1>
          <p className="text-sm text-slate-500">Sign in to your workspace</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 px-6 py-6">
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button
            type="submit"
            className="w-full"
            disabled={submitting}
            style={accent ? { backgroundColor: accent } : undefined}
          >
            {submitting ? 'Signing in...' : 'Sign in'}
          </Button>
          {branding?.supportEmail || branding?.supportPhone ? (
            <p className="text-center text-xs text-slate-400">
              Need help? {branding.supportEmail ?? ''} {branding.supportPhone ?? ''}
            </p>
          ) : null}
        </form>
      </Card>
    </div>
  );
}
