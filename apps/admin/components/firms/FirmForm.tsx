'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateFirmBody } from '@gstflow/types';
import { api } from '@/lib/api';
import { Button, Card, CardHeader, Field, Input } from '@/components/ui';

export function FirmForm() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [gstin, setGstin] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createFirm = useMutation({
    mutationFn: (body: CreateFirmBody) => api.admin.firms.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'firms'] });
      setName('');
      setSlug('');
      setGstin('');
      setEmail('');
      setPhone('');
      setError(null);
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Firm name is required.');
      return;
    }
    setError(null);
    createFirm.mutate({
      name: name.trim(),
      slug: slug.trim() || undefined,
      gstin: gstin.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
    });
  }

  const errorMessage =
    error ?? (createFirm.error instanceof Error ? createFirm.error.message : null);

  return (
    <Card>
      <CardHeader title="Add firm" />
      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <Field label="Name">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Acme Tax Advisors"
          />
        </Field>
        <Field label="Slug" hint="Optional - generated from the name when blank">
          <Input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="acme-tax"
          />
        </Field>
        <Field label="GSTIN">
          <Input
            value={gstin}
            onChange={(event) => setGstin(event.target.value)}
            placeholder="27ABCDE1234F1Z5"
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@acme.test"
          />
        </Field>
        <Field label="Phone">
          <Input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+91 98765 43210"
          />
        </Field>
        <div className="flex items-end">
          <Button
            type="submit"
            disabled={createFirm.isPending || !name.trim()}
            className="w-full sm:w-auto"
          >
            {createFirm.isPending ? 'Creating...' : 'Create firm'}
          </Button>
        </div>
        {errorMessage ? (
          <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-3">{errorMessage}</p>
        ) : null}
      </form>
    </Card>
  );
}
