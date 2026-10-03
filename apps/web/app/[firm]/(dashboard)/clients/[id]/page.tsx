'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ShieldOff } from 'lucide-react';
import type { Client } from '@gstflow/types';
import { api } from '@/lib/api';
import { useFirmPath } from '@/lib/firm';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Spinner,
} from '@/components/ui';
import {
  ClientForm,
  clientToFormValues,
  toUpdateClientBody,
  type ClientFormValues,
} from '@/components/clients/client-form';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

function formatMoney(value?: number | null): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(
    value,
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-800">{value}</dd>
    </div>
  );
}

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const to = useFirmPath();

  const clientQuery = useQuery({
    queryKey: ['clients', id],
    queryFn: () => api.clients.get(id),
    enabled: Boolean(id),
  });

  const devicesQuery = useQuery({
    queryKey: ['devices', { clientId: id }],
    queryFn: () => api.devices.list({ clientId: id }),
    enabled: Boolean(id),
  });

  const consentsQuery = useQuery({
    queryKey: ['clients', id, 'consents'],
    queryFn: () => api.clients.consents(id),
    enabled: Boolean(id),
  });

  const filingsQuery = useQuery({
    queryKey: ['filings', { clientId: id }],
    queryFn: () => api.filings.list({ clientId: id, pageSize: 200 }),
    enabled: Boolean(id),
  });

  const paymentsQuery = useQuery({
    queryKey: ['payments', { clientId: id }],
    queryFn: () => api.payments.list({ clientId: id, pageSize: 200 }),
    enabled: Boolean(id),
  });

  const updateMutation = useMutation({
    mutationFn: (values: ClientFormValues) => api.clients.update(id, toUpdateClientBody(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => api.clients.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      router.push(to('/clients'));
    },
  });

  const revokeMutation = useMutation({
    mutationFn: () => api.http.post<{ success: boolean }>(`/clients/${id}/consents/revoke`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients', id, 'consents'] });
      queryClient.invalidateQueries({ queryKey: ['clients', id] });
    },
  });

  const handleArchive = () => {
    if (window.confirm('Archive this client? They will no longer appear as active.')) {
      archiveMutation.mutate();
    }
  };

  if (clientQuery.isLoading) {
    return <Spinner />;
  }

  if (clientQuery.isError || !clientQuery.data) {
    return (
      <Card className="p-4 text-sm text-red-600">
        {clientQuery.isError ? errorMessage(clientQuery.error) : 'Client not found.'}
      </Card>
    );
  }

  const client: Client = clientQuery.data;
  const clientFilings = filingsQuery.data?.items ?? [];
  const clientPayments = paymentsQuery.data?.items ?? [];
  const billed = clientFilings.reduce((sum, filing) => sum + (filing.feeAmount ?? 0), 0);
  const outstanding = clientFilings.reduce((sum, filing) => sum + (filing.balanceAmount ?? 0), 0);
  const collected = Math.max(billed - outstanding, 0);
  const dueFilings = clientFilings.filter((filing) => (filing.balanceAmount ?? 0) > 0);

  return (
    <div>
      <PageHeader
        title={client.name}
        description={client.gstin ? `GSTIN ${client.gstin}` : 'Client profile'}
        action={
          <Button variant="danger" onClick={handleArchive} disabled={archiveMutation.isPending}>
            <Archive className="h-4 w-4" />
            {archiveMutation.isPending ? 'Archiving...' : 'Archive client'}
          </Button>
        }
      />

      {archiveMutation.isError ? (
        <p className="mb-4 text-sm text-red-600">{errorMessage(archiveMutation.error)}</p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Profile"
            action={
              <Badge tone={client.consentGranted ? 'success' : 'neutral'}>
                {client.consentGranted ? 'Consent granted' : 'No consent'}
              </Badge>
            }
          />
          <dl className="px-4 py-2">
            <ProfileRow label="Name" value={client.name} />
            <ProfileRow label="Phone" value={client.phone} />
            <ProfileRow label="Email" value={client.email ?? '-'} />
            <ProfileRow label="GSTIN" value={client.gstin ?? '-'} />
            <ProfileRow label="PAN" value={client.pan ?? '-'} />
            <ProfileRow label="State code" value={client.stateCode ?? '-'} />
            <ProfileRow label="Address" value={client.address ?? '-'} />
            <ProfileRow label="Status" value={client.status} />
            <ProfileRow label="Last SMS" value={formatDateTime(client.lastSmsAt)} />
            <ProfileRow label="Created" value={formatDateTime(client.createdAt)} />
          </dl>
        </Card>

        <Card>
          <CardHeader title="Edit details" />
          <div className="p-4">
            <ClientForm
              key={client.updatedAt}
              initialValues={clientToFormValues(client)}
              submitLabel="Save changes"
              submitting={updateMutation.isPending}
              error={updateMutation.isError ? errorMessage(updateMutation.error) : null}
              onSubmit={(values) => updateMutation.mutate(values)}
            />
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Dues & payments" />
        {filingsQuery.isLoading || paymentsQuery.isLoading ? (
          <div className="px-4">
            <Spinner />
          </div>
        ) : (
          <div className="p-4">
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-md border border-slate-200 p-3">
                <div className="text-xs uppercase text-slate-400">Billed</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{formatMoney(billed)}</div>
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                <div className="text-xs uppercase text-slate-400">Collected</div>
                <div className="mt-1 text-lg font-semibold text-emerald-600">{formatMoney(collected)}</div>
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                <div className="text-xs uppercase text-slate-400">Outstanding</div>
                <div className="mt-1 text-lg font-semibold text-amber-600">{formatMoney(outstanding)}</div>
              </div>
            </div>

            {dueFilings.length === 0 ? (
              <EmptyState
                title="No outstanding dues"
                description="Filings with a balance will appear here."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Filing</th>
                      <th className="px-4 py-3 font-medium">Fee</th>
                      <th className="px-4 py-3 font-medium">Paid</th>
                      <th className="px-4 py-3 font-medium">Balance</th>
                      <th className="px-4 py-3 font-medium">State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dueFilings.map((filing) => (
                      <tr key={filing.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-700">
                          {filing.type} · {filing.period}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{formatMoney(filing.feeAmount)}</td>
                        <td className="px-4 py-3 text-slate-600">{formatMoney(filing.paidAmount)}</td>
                        <td className="px-4 py-3 font-medium text-amber-600">
                          {formatMoney(filing.balanceAmount)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={filing.paymentState === 'PAID' ? 'success' : 'warning'}>
                            {filing.paymentState ?? 'NONE'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {clientPayments.length > 0 ? (
              <div className="mt-4">
                <h4 className="mb-2 text-sm font-semibold text-slate-800">Recent payments</h4>
                <ul className="divide-y divide-slate-100 text-sm">
                  {clientPayments.map((payment) => (
                    <li key={payment.id} className="flex items-center justify-between py-2">
                      <span className="text-slate-600">
                        {formatMoney(payment.amount)} · {payment.method ?? '-'} · {payment.status}
                      </span>
                      <span className="text-slate-400">{formatDateTime(payment.paidAt ?? payment.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Devices" />
        {devicesQuery.isLoading ? (
          <div className="px-4">
            <Spinner />
          </div>
        ) : devicesQuery.isError ? (
          <div className="p-4 text-sm text-red-600">{errorMessage(devicesQuery.error)}</div>
        ) : (devicesQuery.data ?? []).length === 0 ? (
          <EmptyState title="No devices" description="This client has not paired a device yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Android ID</th>
                  <th className="px-4 py-3 font-medium">Platform</th>
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium">Revoked</th>
                  <th className="px-4 py-3 font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(devicesQuery.data ?? []).map((device) => (
                  <tr key={device.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{device.androidId}</td>
                    <td className="px-4 py-3 text-slate-600">{device.platform}</td>
                    <td className="px-4 py-3 text-slate-600">{device.model ?? '-'}</td>
                    <td className="px-4 py-3">
                      <Badge tone={device.revoked ? 'danger' : 'success'}>
                        {device.revoked ? 'Revoked' : 'Active'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDateTime(device.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Consents" />
        {consentsQuery.isLoading ? (
          <div className="px-4">
            <Spinner />
          </div>
        ) : consentsQuery.isError ? (
          <div className="p-4 text-sm text-red-600">{errorMessage(consentsQuery.error)}</div>
        ) : (consentsQuery.data ?? []).length === 0 ? (
          <EmptyState
            title="No consents recorded"
            description="Consent is captured when the client verifies via OTP."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Version</th>
                  <th className="px-4 py-3 font-medium">Accepted</th>
                  <th className="px-4 py-3 font-medium">OTP verified</th>
                  <th className="px-4 py-3 font-medium">Revoked</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(consentsQuery.data ?? []).map((consent) => (
                  <tr key={consent.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600">{consent.version}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDateTime(consent.acceptedAt)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={consent.otpVerified ? 'success' : 'neutral'}>
                        {consent.otpVerified ? 'Verified' : 'Unverified'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDateTime(consent.revokedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="secondary"
                        disabled={Boolean(consent.revokedAt) || revokeMutation.isPending}
                        onClick={() => revokeMutation.mutate()}
                      >
                        <ShieldOff className="h-4 w-4" /> Revoke consent
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {revokeMutation.isError ? (
          <p className="px-4 pb-4 text-sm text-red-600">{errorMessage(revokeMutation.error)}</p>
        ) : null}
      </Card>
    </div>
  );
}
