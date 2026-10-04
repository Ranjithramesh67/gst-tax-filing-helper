'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, MessageSquare, Play, Plus, XCircle } from 'lucide-react';
import type {
  SmsProviderBody,
  SmsProviderConfig,
  SmsTestReport,
  UpdateSmsProviderBody,
} from '@gstflow/types';
import { api } from '@/lib/api';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
} from '@/components/ui';

interface FormState {
  id: string | null;
  name: string;
  isActive: boolean;
  url: string;
  method: 'GET' | 'POST';
  sender: string;
  route: string;
  templateId: string;
  header: string;
  credentialsJson: string;
  messageTemplate: string;
  appName: string;
  variablesJson: string;
  timeoutMs: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  isActive: true,
  url: 'http://site.ping4sms.com/api/smsapi',
  method: 'GET',
  sender: 'VHOMEE',
  route: '4',
  templateId: '1207170351303889084',
  header: '',
  credentialsJson: '',
  messageTemplate:
    'Hi, Your OTP to Login into {{app name}} App is {{variable}}. ' +
    "This OTP is sent by Ranji, Please don't share this OTP with anyone. " +
    'This OTP will expire in 2Mins.',
  appName: 'GSTFlow',
  variablesJson: '',
  timeoutMs: '8000',
};

function parseJsonObject(value: string, label: string): Record<string, string> | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).map(([key, val]) => [key, String(val)]),
  );
}

function fromProvider(provider: SmsProviderConfig): FormState {
  return {
    id: provider.id,
    name: provider.name,
    isActive: provider.isActive,
    url: provider.url,
    method: provider.method === 'POST' ? 'POST' : 'GET',
    sender: provider.sender,
    route: provider.route ?? '',
    templateId: provider.templateId ?? '',
    header: provider.header ?? '',
    credentialsJson: '',
    messageTemplate: provider.messageTemplate,
    appName: provider.appName,
    variablesJson: provider.variables ? JSON.stringify(provider.variables, null, 2) : '',
    timeoutMs: String(provider.timeoutMs),
  };
}

export default function SmsGatewayPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [testNumbers, setTestNumbers] = useState('');
  const [testCode, setTestCode] = useState('');
  const [report, setReport] = useState<SmsTestReport | null>(null);

  const providers = useQuery({
    queryKey: ['admin', 'sms-providers'],
    queryFn: () => api.admin.smsProviders.list(),
  });

  const save = useMutation({
    mutationFn: (body: SmsProviderBody | UpdateSmsProviderBody) =>
      form.id
        ? api.admin.smsProviders.update(form.id, body as UpdateSmsProviderBody)
        : api.admin.smsProviders.create(body as SmsProviderBody),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'sms-providers'] });
      setForm(EMPTY_FORM);
      setFormError(null);
    },
  });

  const activate = useMutation({
    mutationFn: (id: string) => api.admin.smsProviders.activate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'sms-providers'] }),
  });

  const test = useMutation({
    mutationFn: () => {
      const numbers = testNumbers
        .split(/[\s,;]+/)
        .map((value) => value.trim())
        .filter(Boolean);
      if (numbers.length === 0) throw new Error('Enter at least one phone number');
      const config: UpdateSmsProviderBody = {
        url: form.url.trim(),
        method: form.method,
        sender: form.sender.trim(),
        route: form.route.trim() || undefined,
        templateId: form.templateId.trim() || undefined,
        header: form.header.trim() || undefined,
        messageTemplate: form.messageTemplate,
        appName: form.appName.trim(),
        timeoutMs: Number(form.timeoutMs) || undefined,
        variables: parseJsonObject(form.variablesJson, 'Variables'),
        credentials: parseJsonObject(form.credentialsJson, 'Credentials'),
      };
      return api.admin.smsProviders.test({
        numbers,
        code: testCode.trim() || undefined,
        providerId: form.id ?? undefined,
        config,
      });
    },
    onSuccess: (data) => {
      setReport(data);
      setFormError(null);
    },
    onError: (error) => {
      setReport(null);
      setFormError(error instanceof Error ? error.message : 'Test failed');
    },
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const credentials = parseJsonObject(form.credentialsJson, 'Credentials');
      const variables = parseJsonObject(form.variablesJson, 'Variables');
      const body: UpdateSmsProviderBody = {
        name: form.name.trim(),
        isActive: form.isActive,
        url: form.url.trim(),
        method: form.method,
        sender: form.sender.trim(),
        route: form.route.trim() || undefined,
        templateId: form.templateId.trim() || undefined,
        header: form.header.trim() || undefined,
        messageTemplate: form.messageTemplate,
        appName: form.appName.trim(),
        variables,
        timeoutMs: Number(form.timeoutMs) || undefined,
      };
      if (credentials) body.credentials = credentials;
      save.mutate(body);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Invalid input');
    }
  }

  const items = providers.data ?? [];

  return (
    <div>
      <PageHeader
        title="SMS gateway"
        description="Configure the outbound SMS provider, credentials and message. Test sends go to real numbers."
        action={
          form.id ? (
            <Button variant="secondary" onClick={() => setForm(EMPTY_FORM)}>
              <Plus className="h-4 w-4" /> New provider
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardHeader title={form.id ? `Edit ${form.name}` : 'New provider'} />
        <form onSubmit={onSubmit} className="space-y-4 px-4 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Label" hint="A friendly name for this configuration">
              <Input
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="Ping4SMS primary"
                required
              />
            </Field>
            <Field label="Provider">
              <Select value="PING4SMS" disabled>
                <option value="PING4SMS">PING4SMS</option>
              </Select>
            </Field>
            <Field label="Method">
              <Select
                value={form.method}
                onChange={(e) => update('method', e.target.value as 'GET' | 'POST')}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </Select>
            </Field>
            <Field label="Endpoint URL">
              <Input
                type="url"
                value={form.url}
                onChange={(e) => update('url', e.target.value)}
                required
              />
            </Field>
            <Field label="Sender ID / Header" hint="DLT header, e.g. VHOMEE">
              <Input
                value={form.sender}
                onChange={(e) => update('sender', e.target.value)}
                required
              />
            </Field>
            <Field label="Route" hint="Provider route id, e.g. 4">
              <Input value={form.route} onChange={(e) => update('route', e.target.value)} />
            </Field>
            <Field label="Template ID" hint="DLT template id">
              <Input
                value={form.templateId}
                onChange={(e) => update('templateId', e.target.value)}
              />
            </Field>
            <Field label="Header override" hint="Optional fallback for the sender id">
              <Input value={form.header} onChange={(e) => update('header', e.target.value)} />
            </Field>
            <Field label="App name" hint="Used by the {{app name}} token">
              <Input
                value={form.appName}
                onChange={(e) => update('appName', e.target.value)}
                required
              />
            </Field>
            <Field label="Timeout (ms)">
              <Input
                type="number"
                min={1000}
                max={30000}
                value={form.timeoutMs}
                onChange={(e) => update('timeoutMs', e.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Credentials (JSON)"
            hint={
              form.id
                ? currentCredentialHint(items, form.id)
                : 'e.g. {"key":"your-api-key"}'
            }
          >
            <textarea
              value={form.credentialsJson}
              onChange={(e) => update('credentialsJson', e.target.value)}
              rows={2}
              placeholder={form.id ? 'Leave blank to keep the existing credentials' : '{"key":"..."}'}
              className="w-full rounded-md border border-ink-600 bg-ink-800 px-3 py-2 font-mono text-xs text-slate-100 placeholder:text-slate-500 outline-none focus:border-brand-500"
            />
          </Field>

          <Field
            label="Message template"
            hint="Tokens: {{app name}}, {{variable}} (OTP), plus any key from Variables"
          >
            <textarea
              value={form.messageTemplate}
              onChange={(e) => update('messageTemplate', e.target.value)}
              rows={3}
              required
              className="w-full rounded-md border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500"
            />
          </Field>

          <Field label="Variables (JSON)" hint='Extra tokens, e.g. {"support":"Ranji"}'>
            <textarea
              value={form.variablesJson}
              onChange={(e) => update('variablesJson', e.target.value)}
              rows={2}
              placeholder='{"support":"Ranji"}'
              className="w-full rounded-md border border-ink-600 bg-ink-800 px-3 py-2 font-mono text-xs text-slate-100 placeholder:text-slate-500 outline-none focus:border-brand-500"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => update('isActive', e.target.checked)}
              className="h-4 w-4 rounded border-ink-600 text-brand-600"
            />
            Make this the active provider
          </label>

          {formError ? <p className="text-sm text-red-400">{formError}</p> : null}
          {save.isError ? (
            <p className="text-sm text-red-400">
              {save.error instanceof Error ? save.error.message : 'Failed to save provider'}
            </p>
          ) : null}
          {save.isSuccess ? (
            <p className="text-sm text-green-400">Provider saved.</p>
          ) : null}

          <div className="flex justify-end">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving...' : form.id ? 'Save changes' : 'Add provider'}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Configured providers" />
        {providers.isLoading ? (
          <Spinner label="Loading providers..." />
        ) : items.length === 0 ? (
          <EmptyState title="No providers yet" description="Add a provider above to enable OTP SMS." />
        ) : (
          <div className="divide-y divide-ink-700">
            {items.map((provider) => (
              <div key={provider.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-100">{provider.name}</span>
                    {provider.isActive ? <Badge tone="success">Active</Badge> : null}
                    {provider.hasCredentials ? (
                      <Badge tone="info">{provider.credentialKeys.join(', ') || 'credentials'}</Badge>
                    ) : (
                      <Badge tone="warning">No credentials</Badge>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {provider.provider} · {provider.sender} · {provider.url}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => setForm(fromProvider(provider))}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={provider.isActive || activate.isPending}
                    onClick={() => activate.mutate(provider.id)}
                  >
                    Activate
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Send a test SMS" />
        <div className="space-y-4 px-4 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Numbers" hint="Comma or newline separated">
              <textarea
                value={testNumbers}
                onChange={(e) => setTestNumbers(e.target.value)}
                rows={2}
                placeholder="9876543210, 9123456780"
                className="w-full rounded-md border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-brand-500"
              />
            </Field>
            <Field label="OTP code" hint="Optional. Random 6-digit code if left blank.">
              <Input value={testCode} onChange={(e) => setTestCode(e.target.value)} placeholder="123456" />
            </Field>
          </div>
          <p className="text-xs text-slate-500">
            Uses the form values above. Save first if you want to test with the stored credentials
            without re-entering them.
          </p>
          <div className="flex justify-end">
            <Button onClick={() => test.mutate()} disabled={test.isPending}>
              <Play className="h-4 w-4" />
              {test.isPending ? 'Sending...' : 'Send test'}
            </Button>
          </div>

          {report ? (
            <div className="rounded-md border border-ink-600">
              <div className="flex items-center gap-3 border-b border-ink-600 px-3 py-2 text-xs text-slate-400">
                <span>
                  {report.successCount}/{report.total} delivered
                </span>
                <span>code: {report.code}</span>
              </div>
              <div className="divide-y divide-ink-700">
                {report.results.map((result, index) => (
                  <div key={`${result.to}-${index}`} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="flex items-center gap-2 text-slate-200">
                      {result.ok ? (
                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-400" />
                      )}
                      {result.to}
                    </span>
                    <span className="text-xs text-slate-500">
                      {result.ok
                        ? `HTTP ${result.status ?? 200}`
                        : result.error ?? (result.skipped ? 'skipped' : `HTTP ${result.status ?? 'error'}`)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function currentCredentialHint(items: SmsProviderConfig[], id: string): string {
  const provider = items.find((item) => item.id === id);
  if (!provider || !provider.hasCredentials) return 'e.g. {"key":"your-api-key"}';
  return `Stored: ${provider.credentialKeys.join(', ')}. Leave blank to keep them.`;
}
