'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Field, Input } from '@/components/ui';

export default function FirmLookupPage() {
  const router = useRouter();
  const [code, setCode] = useState('');

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const slug = code.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (slug) router.push(`/${slug}/login`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <h1 className="text-lg font-semibold text-slate-900">GSTFlow</h1>
          <p className="mt-1 text-sm text-slate-500">Enter your firm code to continue</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 px-6 py-6">
          <Field label="Firm code" hint="Provided by your GSTFlow administrator">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="acme-tax"
              required
            />
          </Field>
          <Button type="submit" className="w-full" disabled={!code.trim()}>
            Continue
          </Button>
        </form>
      </Card>
    </div>
  );
}
