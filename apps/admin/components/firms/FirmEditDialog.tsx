'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Role } from '@gstflow/types';
import type { Firm, UpdateFirmBody } from '@gstflow/types';
import { api } from '@/lib/api';
import { Button, Card, Field, Input, Select } from '@/components/ui';

const STATUSES: Array<Firm['status']> = ['ACTIVE', 'SUSPENDED', 'PENDING'];

type FormState = {
  name: string;
  slug: string;
  gstin: string;
  email: string;
  phone: string;
  logoUrl: string;
  brandColor: string;
  supportEmail: string;
  supportPhone: string;
  address: string;
  defaultFilingFee: string;
  status: string;
};

export function FirmEditDialog({ firm, onClose }: { firm: Firm; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>({
    name: firm.name,
    slug: firm.slug,
    gstin: firm.gstin ?? '',
    email: firm.email ?? '',
    phone: firm.phone ?? '',
    logoUrl: firm.logoUrl ?? '',
    brandColor: firm.brandColor ?? '',
    supportEmail: firm.supportEmail ?? '',
    supportPhone: firm.supportPhone ?? '',
    address: firm.address ?? '',
    defaultFilingFee: firm.defaultFilingFee === null || firm.defaultFilingFee === undefined ? '' : String(firm.defaultFilingFee),
    status: firm.status,
  });
  const [admin, setAdmin] = useState({ name: '', email: '', password: '' });
  const [adminMessage, setAdminMessage] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const save = useMutation({
    mutationFn: (body: UpdateFirmBody) => api.admin.firms.update(firm.id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'firms'] });
      onClose();
    },
  });

  const createAdmin = useMutation({
    mutationFn: () =>
      api.admin.users.create({
        name: admin.name.trim(),
        email: admin.email.trim(),
        password: admin.password,
        role: Role.FIRM_ADMIN,
        firmId: firm.id,
      }),
    onSuccess: () => {
      setAdmin({ name: '', email: '', password: '' });
      setAdminMessage('Firm admin created.');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate({
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
      status: form.status as Firm['status'],
    });
  }

  function handleCreateAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdminMessage(null);
    if (!admin.name.trim() || !admin.email.trim() || admin.password.length < 8) return;
    createAdmin.mutate();
  }

  const saveError = save.error instanceof Error ? save.error.message : null;
  const adminError = createAdmin.error instanceof Error ? createAdmin.error.message : null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
      <Card className="my-8 w-full max-w-3xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Edit firm</h3>
            <p className="mt-0.5 text-xs text-slate-400">{firm.name}</p>
          </div>
          <Button variant="ghost" type="button" onClick={onClose}>
            Close
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-4">
          <section>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Identity</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Name">
                <Input value={form.name} onChange={(event) => set('name', event.target.value)} />
              </Field>
              <Field label="Slug">
                <Input value={form.slug} onChange={(event) => set('slug', event.target.value)} />
              </Field>
              <Field label="GSTIN">
                <Input value={form.gstin} onChange={(event) => set('gstin', event.target.value)} />
              </Field>
              <Field label="Email">
                <Input type="email" value={form.email} onChange={(event) => set('email', event.target.value)} />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={(event) => set('phone', event.target.value)} />
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={(event) => set('status', event.target.value)}>
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </section>

          <section>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Branding</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Logo URL">
                <Input value={form.logoUrl} onChange={(event) => set('logoUrl', event.target.value)} />
              </Field>
              <Field label="Brand color">
                <div className="flex items-center gap-2">
                  <Input value={form.brandColor} onChange={(event) => set('brandColor', event.target.value)} placeholder="#0F766E" />
                  <span
                    className="h-9 w-9 shrink-0 rounded border border-slate-300"
                    style={{ backgroundColor: form.brandColor || '#ffffff' }}
                  />
                </div>
              </Field>
              <Field label="Support email">
                <Input type="email" value={form.supportEmail} onChange={(event) => set('supportEmail', event.target.value)} />
              </Field>
              <Field label="Support phone">
                <Input value={form.supportPhone} onChange={(event) => set('supportPhone', event.target.value)} />
              </Field>
              <Field label="Address">
                <Input value={form.address} onChange={(event) => set('address', event.target.value)} />
              </Field>
            </div>
          </section>

          <section>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Billing</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Default filing fee (INR)">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.defaultFilingFee}
                  onChange={(event) => set('defaultFilingFee', event.target.value)}
                />
              </Field>
            </div>
          </section>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving...' : 'Save changes'}
            </Button>
            <Button variant="secondary" type="button" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            {saveError ? <p className="text-sm text-red-600">{saveError}</p> : null}
          </div>
        </form>

        <div className="border-t border-slate-200 p-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Create firm admin</h4>
          <form onSubmit={handleCreateAdmin} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Name">
              <Input value={admin.name} onChange={(event) => setAdmin({ ...admin, name: event.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" value={admin.email} onChange={(event) => setAdmin({ ...admin, email: event.target.value })} />
            </Field>
            <Field label="Password" hint="Minimum 8 characters">
              <Input
                type="password"
                value={admin.password}
                onChange={(event) => setAdmin({ ...admin, password: event.target.value })}
              />
            </Field>
            <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                disabled={createAdmin.isPending || !admin.name.trim() || !admin.email.trim() || admin.password.length < 8}
              >
                {createAdmin.isPending ? 'Creating...' : 'Create firm admin'}
              </Button>
              {adminMessage ? <p className="text-sm text-green-600">{adminMessage}</p> : null}
              {adminError ? <p className="text-sm text-red-600">{adminError}</p> : null}
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
