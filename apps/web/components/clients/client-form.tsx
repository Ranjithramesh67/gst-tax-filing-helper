'use client';

import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import type { Client, CreateClientBody, UpdateClientBody } from '@gstflow/types';
import { Button, Field, Input } from '@/components/ui';

export interface ClientFormValues {
  name: string;
  phone: string;
  gstin: string;
  pan: string;
  email: string;
  address: string;
  stateCode: string;
}

export const emptyClientForm: ClientFormValues = {
  name: '',
  phone: '',
  gstin: '',
  pan: '',
  email: '',
  address: '',
  stateCode: '',
};

export function clientToFormValues(client: Client): ClientFormValues {
  return {
    name: client.name,
    phone: client.phone,
    gstin: client.gstin ?? '',
    pan: client.pan ?? '',
    email: client.email ?? '',
    address: client.address ?? '',
    stateCode: client.stateCode ?? '',
  };
}

export function toCreateClientBody(values: ClientFormValues): CreateClientBody {
  const body: CreateClientBody = {
    name: values.name.trim(),
    phone: values.phone.trim(),
  };
  if (values.gstin.trim()) body.gstin = values.gstin.trim();
  if (values.pan.trim()) body.pan = values.pan.trim();
  if (values.email.trim()) body.email = values.email.trim();
  if (values.address.trim()) body.address = values.address.trim();
  if (values.stateCode.trim()) body.stateCode = values.stateCode.trim();
  return body;
}

export function toUpdateClientBody(values: ClientFormValues): UpdateClientBody {
  return {
    name: values.name.trim(),
    phone: values.phone.trim(),
    gstin: values.gstin.trim(),
    pan: values.pan.trim(),
    email: values.email.trim(),
    address: values.address.trim(),
    stateCode: values.stateCode.trim(),
  };
}

const FIELDS: Array<{ key: keyof ClientFormValues; label: string; type?: string; placeholder?: string }> = [
  { key: 'name', label: 'Name', placeholder: 'Acme Traders' },
  { key: 'phone', label: 'Phone', placeholder: '+91 98765 43210' },
  { key: 'gstin', label: 'GSTIN', placeholder: '22AAAAA0000A1Z5' },
  { key: 'pan', label: 'PAN', placeholder: 'AAAAA0000A' },
  { key: 'email', label: 'Email', type: 'email', placeholder: 'accounts@acme.in' },
];

export function ClientForm({
  initialValues,
  submitLabel,
  onSubmit,
  onCancel,
  submitting,
  error,
}: {
  initialValues?: ClientFormValues;
  submitLabel: string;
  onSubmit: (values: ClientFormValues) => void;
  onCancel?: () => void;
  submitting?: boolean;
  error?: string | null;
}) {
  const [values, setValues] = useState<ClientFormValues>(initialValues ?? emptyClientForm);

  const update = (key: keyof ClientFormValues) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { value } = event.target;
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(values);
  };

  const valid = values.name.trim().length > 0 && values.phone.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <Field key={field.key} label={field.label}>
            <Input
              type={field.type ?? 'text'}
              value={values[field.key]}
              onChange={update(field.key)}
              placeholder={field.placeholder}
            />
          </Field>
        ))}
        <Field label="State code">
          <Input value={values.stateCode} onChange={update('stateCode')} placeholder="22" />
        </Field>
      </div>
      <Field label="Address">
        <textarea
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          rows={3}
          value={values.address}
          onChange={update('address')}
          placeholder="Registered address"
        />
      </Field>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={!valid || submitting}>
          {submitting ? 'Saving...' : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
