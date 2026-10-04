'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Database, Play, Save, ShieldCheck } from 'lucide-react';
import type { UpdateSmsRetentionBody } from '@gstflow/types';
import { api } from '@/lib/api';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Spinner,
} from '@/components/ui';

const RETENTION_KEY = ['admin', 'settings', 'sms-retention'];

interface FormState {
  enabled: boolean;
  archiveAfterDays: string;
  purgeBackupAfterDays: string;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const policy = useQuery({
    queryKey: RETENTION_KEY,
    queryFn: () => api.admin.settings.smsRetention.get(),
  });

  const preview = useQuery({
    queryKey: [...RETENTION_KEY, 'preview'],
    queryFn: () => api.admin.settings.smsRetention.preview(),
  });

  useEffect(() => {
    if (policy.data && form === null) {
      setForm({
        enabled: policy.data.enabled,
        archiveAfterDays: String(policy.data.archiveAfterDays),
        purgeBackupAfterDays: String(policy.data.purgeBackupAfterDays),
      });
    }
  }, [policy.data, form]);

  const save = useMutation({
    mutationFn: (body: UpdateSmsRetentionBody) => api.admin.settings.smsRetention.update(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: RETENTION_KEY });
      setError(null);
      setMessage('Retention policy saved.');
    },
    onError: (err) => {
      setMessage(null);
      setError(err instanceof Error ? err.message : 'Failed to save policy');
    },
  });

  const run = useMutation({
    mutationFn: () => api.admin.settings.smsRetention.run(),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: RETENTION_KEY });
      setError(null);
      setMessage(`Run complete: archived ${result.archived}, purged ${result.purged}.`);
    },
    onError: (err) => {
      setMessage(null);
      setError(err instanceof Error ? err.message : 'Run failed');
    },
  });

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    setMessage(null);
    save.mutate({
      enabled: form.enabled,
      archiveAfterDays: Number(form.archiveAfterDays),
      purgeBackupAfterDays: Number(form.purgeBackupAfterDays),
    });
  }

  const stats = preview.data;

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Platform-wide configuration for the GSTFlow service."
      />

      <Card>
        <CardHeader title="SMS retention & backup" />
        {policy.isLoading || !form ? (
          <Spinner label="Loading policy..." />
        ) : (
          <form onSubmit={onSubmit} className="space-y-4 px-4 py-5">
            <p className="text-sm text-slate-400">
              Old SMS messages are removed from the firm portal and the client app and kept in an
              encrypted backup that only a super admin can access. After the backup window they are
              permanently deleted.
            </p>

            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                className="h-4 w-4 rounded border-ink-600 text-brand-600"
              />
              Enable automatic retention
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Archive after (days)"
                hint="Messages older than this leave the inbox and move to encrypted backup."
              >
                <Input
                  type="number"
                  min={1}
                  max={3650}
                  value={form.archiveAfterDays}
                  onChange={(e) => setForm({ ...form, archiveAfterDays: e.target.value })}
                  required
                />
              </Field>
              <Field
                label="Delete backup after (days)"
                hint="Backup copies older than this are permanently deleted."
              >
                <Input
                  type="number"
                  min={1}
                  max={3650}
                  value={form.purgeBackupAfterDays}
                  onChange={(e) => setForm({ ...form, purgeBackupAfterDays: e.target.value })}
                  required
                />
              </Field>
            </div>

            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            {message ? <p className="text-sm text-green-400">{message}</p> : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => preview.refetch()}
                disabled={preview.isFetching}
              >
                <Archive className="h-4 w-4" />
                {preview.isFetching ? 'Checking...' : 'Preview'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (window.confirm('Run retention now? This archives old messages and purges expired backups.')) {
                    run.mutate();
                  }
                }}
                disabled={run.isPending}
              >
                <Play className="h-4 w-4" />
                {run.isPending ? 'Running...' : 'Run now'}
              </Button>
              <Button type="submit" disabled={save.isPending}>
                <Save className="h-4 w-4" />
                {save.isPending ? 'Saving...' : 'Save policy'}
              </Button>
            </div>
          </form>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Current data"
          action={
            <Badge tone={stats?.policy.enabled ? 'success' : 'warning'}>
              {stats?.policy.enabled ? 'Retention on' : 'Retention off'}
            </Badge>
          }
        />
        <div className="grid grid-cols-2 gap-4 px-4 py-5 sm:grid-cols-4">
          <Stat
            icon={<Database className="h-4 w-4 text-slate-400" />}
            label="Messages in inbox"
            value={stats?.liveCount}
          />
          <Stat
            icon={<Archive className="h-4 w-4 text-slate-400" />}
            label="Ready to archive"
            value={stats?.archiveCandidates}
          />
          <Stat
            icon={<ShieldCheck className="h-4 w-4 text-slate-400" />}
            label="In encrypted backup"
            value={stats?.archivedCount}
          />
          <Stat
            icon={<Archive className="h-4 w-4 text-slate-400" />}
            label="Backups expiring"
            value={stats?.purgeCandidates}
          />
        </div>
      </Card>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: number;
}) {
  return (
    <div className="rounded-md border border-ink-700 bg-ink-900/40 px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-100">{value ?? '-'}</p>
    </div>
  );
}
