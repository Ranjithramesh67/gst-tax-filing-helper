'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import type { Firm, UpdateFirmSettingsBody } from '@gstflow/types';
import { api } from '@/lib/api';
import { Button, Card, CardHeader, Field, Input, PageHeader, Spinner } from '@/components/ui';

interface FormState {
  name: string;
  gstin: string;
  email: string;
  phone: string;
  logoUrl: string;
  brandColor: string;
  supportEmail: string;
  supportPhone: string;
  address: string;
  defaultFilingFee: string;
}

const EMPTY_FORM: FormState = {
  name: '',
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

function toForm(firm: Firm): FormState {
  return {
    name: firm.name ?? '',
    gstin: firm.gstin ?? '',
    email: firm.email ?? '',
    phone: firm.phone ?? '',
    logoUrl: firm.logoUrl ?? '',
    brandColor: firm.brandColor ?? '',
    supportEmail: firm.supportEmail ?? '',
    supportPhone: firm.supportPhone ?? '',
    address: firm.address ?? '',
    defaultFilingFee:
      firm.defaultFilingFee === null || firm.defaultFilingFee === undefined
        ? ''
        : String(firm.defaultFilingFee),
  };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const profileQuery = useQuery({
    queryKey: ['firm', 'profile'],
    queryFn: () => api.firm.profile.get(),
  });

  useEffect(() => {
    if (profileQuery.data) setForm(toForm(profileQuery.data));
  }, [profileQuery.data]);

  const updateMutation = useMutation({
    mutationFn: (body: UpdateFirmSettingsBody) => api.firm.profile.update(body),
    onSuccess: () => {
      setError(null);
      setSuccess('Firm settings saved.');
      void queryClient.invalidateQueries({ queryKey: ['firm', 'profile'] });
      router.refresh();
    },
    onError: (mutationError) => {
      setSuccess(null);
      setError(errorMessage(mutationError, 'Failed to save settings.'));
    },
  });

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    const clean = (value: string) => value.trim();
    updateMutation.mutate({
      name: clean(form.name),
      gstin: clean(form.gstin) || null,
      email: clean(form.email) || null,
      phone: clean(form.phone) || null,
      logoUrl: clean(form.logoUrl) || null,
      brandColor: clean(form.brandColor) || null,
      supportEmail: clean(form.supportEmail) || null,
      supportPhone: clean(form.supportPhone) || null,
      address: clean(form.address) || null,
      defaultFilingFee: form.defaultFilingFee.trim() === '' ? null : Number(form.defaultFilingFee),
    });
  }

  if (profileQuery.isLoading) {
    return (
      <div>
        <PageHeader title="Settings" description="Manage your firm's profile and branding." />
        <Spinner label="Loading settings..." />
      </div>
    );
  }

  if (profileQuery.isError) {
    return (
      <div>
        <PageHeader title="Settings" description="Manage your firm's profile and branding." />
        <Card className="px-4 py-8 text-center">
          <p className="text-sm font-medium text-red-600">
            {errorMessage(profileQuery.error, 'Failed to load settings.')}
          </p>
          <Button variant="secondary" className="mt-3" onClick={() => void profileQuery.refetch()}>
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Settings" description="Manage your firm's profile and branding." />

      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader title="Firm profile" />
          <div className="grid grid-cols-1 gap-4 px-4 py-4 md:grid-cols-2">
            <Field label="Firm name">
              <Input
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                required
                minLength={2}
                maxLength={200}
              />
            </Field>
            <Field label="GSTIN" hint="Optional. 15-character GSTIN of the firm.">
              <Input
                value={form.gstin}
                onChange={(e) => setField('gstin', e.target.value.toUpperCase())}
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
                placeholder="hello@firm.com"
              />
            </Field>
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                placeholder="+919876543210"
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Address">
                <textarea
                  value={form.address}
                  onChange={(e) => setField('address', e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Registered office address"
                />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Branding" />
          <div className="grid grid-cols-1 gap-4 px-4 py-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Field label="Logo URL" hint="Absolute URL to a square or wide PNG/SVG.">
                <Input
                  value={form.logoUrl}
                  onChange={(e) => setField('logoUrl', e.target.value)}
                  placeholder="https://cdn.example.com/logo.png"
                />
              </Field>
            </div>
            <Field label="Brand colour" hint="Hex like #0F766E.">
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(form.brandColor) ? form.brandColor : '#0F766E'}
                  onChange={(e) => setField('brandColor', e.target.value.toUpperCase())}
                  className="h-9 w-12 cursor-pointer rounded border border-slate-300 bg-white"
                  aria-label="Brand colour picker"
                />
                <Input
                  value={form.brandColor}
                  onChange={(e) => setField('brandColor', e.target.value)}
                  placeholder="#0F766E"
                  maxLength={7}
                />
              </div>
            </Field>
            <Field label="Default filing fee" hint="Optional. Applied to new filings (INR).">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.defaultFilingFee}
                onChange={(e) => setField('defaultFilingFee', e.target.value)}
                placeholder="0"
              />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Client support" />
          <div className="grid grid-cols-1 gap-4 px-4 py-4 md:grid-cols-2">
            <Field label="Support email" hint="Shown to clients on payment and status pages.">
              <Input
                type="email"
                value={form.supportEmail}
                onChange={(e) => setField('supportEmail', e.target.value)}
                placeholder="support@firm.com"
              />
            </Field>
            <Field label="Support phone">
              <Input
                value={form.supportPhone}
                onChange={(e) => setField('supportPhone', e.target.value)}
                placeholder="+919876543210"
              />
            </Field>
          </div>
        </Card>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {success ? <p className="text-sm text-green-600">{success}</p> : null}

        <div className="flex justify-end">
          <Button type="submit" disabled={updateMutation.isPending}>
            <Save className="h-4 w-4" />
            {updateMutation.isPending ? 'Saving...' : 'Save settings'}
          </Button>
        </div>
      </form>
    </div>
  );
}
