'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateFirmBody } from '@gstflow/types';
import { api } from '@/lib/api';
import { Button, Card, CardHeader, Field, Input } from '@/components/ui';

const EMPTY = {
  name: '',
  slug: '',
  gstin: '',
  email: '',
  phone: '',
  logoUrl: '',
  brandColor: '',
  supportEmail: '',
  supportPhone: '',
  address: '',
  defaultFilingFee: '',
};

export function FirmForm() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY });
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const createFirm = useMutation({
    mutationFn: (body: CreateFirmBody) => api.admin.firms.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'firms'] });
      setForm({ ...EMPTY });
      setError(null);
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) {
      setError('Firm name is required.');
      return;
    }
    setError(null);
    createFirm.mutate({
      name: form.name.trim(),
      slug: form.slug.trim() || undefined,
      gstin: form.gstin.trim() || undefined,
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      logoUrl: form.logoUrl.trim() || undefined,
      brandColor: form.brandColor.trim() || undefined,
      supportEmail: form.supportEmail.trim() || undefined,
      supportPhone: form.supportPhone.trim() || undefined,
      address: form.address.trim() || undefined,
      defaultFilingFee: form.defaultFilingFee.trim() ? Number(form.defaultFilingFee) : undefined,
    });
  }

  const errorMessage = error ?? (createFirm.error instanceof Error ? createFirm.error.message : null);

  return (
    <Card>
      <CardHeader title="Add firm" />
      <form onSubmit={handleSubmit} className="space-y-6 p-4">
        <section>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Identity</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Name">
              <Input value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="Acme Tax Advisors" />
            </Field>
            <Field label="Slug" hint="Used in the portal URL /<slug>">
              <Input value={form.slug} onChange={(event) => set('slug', event.target.value)} placeholder="acme-tax" />
            </Field>
            <Field label="GSTIN">
              <Input value={form.gstin} onChange={(event) => set('gstin', event.target.value)} placeholder="27ABCDE1234F1Z5" />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(event) => set('email', event.target.value)} placeholder="admin@acme.test" />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(event) => set('phone', event.target.value)} placeholder="+91 98765 43210" />
            </Field>
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Branding</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Logo URL" hint="PNG/SVG hosted over https">
              <Input value={form.logoUrl} onChange={(event) => set('logoUrl', event.target.value)} placeholder="https://acme.test/logo.png" />
            </Field>
            <Field label="Brand color" hint="Hex like #0F766E">
              <div className="flex items-center gap-2">
                <Input value={form.brandColor} onChange={(event) => set('brandColor', event.target.value)} placeholder="#0F766E" />
                <span
                  className="h-9 w-9 shrink-0 rounded border border-slate-300"
                  style={{ backgroundColor: form.brandColor || '#ffffff' }}
                />
              </div>
            </Field>
            <Field label="Support email">
              <Input type="email" value={form.supportEmail} onChange={(event) => set('supportEmail', event.target.value)} placeholder="support@acme.test" />
            </Field>
            <Field label="Support phone">
              <Input value={form.supportPhone} onChange={(event) => set('supportPhone', event.target.value)} placeholder="+91 98765 43210" />
            </Field>
            <Field label="Address">
              <Input value={form.address} onChange={(event) => set('address', event.target.value)} placeholder="City, State" />
            </Field>
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Billing</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Default filing fee (INR)" hint="Prefilled on new filings">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.defaultFilingFee}
                onChange={(event) => set('defaultFilingFee', event.target.value)}
                placeholder="800"
              />
            </Field>
          </div>
        </section>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={createFirm.isPending || !form.name.trim()}>
            {createFirm.isPending ? 'Creating...' : 'Create firm'}
          </Button>
          {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
        </div>
      </form>
    </Card>
  );
}
