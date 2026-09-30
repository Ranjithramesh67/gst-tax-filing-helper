'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, Send, Smartphone } from 'lucide-react';
import type { AppRelease, CreateReleaseBody } from '@gstflow/types';
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

const PAGE_SIZE = 10;

type Platform = CreateReleaseBody['platform'];
type Channel = CreateReleaseBody['channel'];

const PLATFORMS: Platform[] = ['ANDROID', 'IOS'];
const CHANNELS: Channel[] = ['STABLE', 'BETA'];

interface FormState {
  platform: Platform;
  version: string;
  versionCode: string;
  channel: Channel;
  url: string;
  checksum: string;
  changelog: string;
  mandatory: boolean;
}

const EMPTY_FORM: FormState = {
  platform: 'ANDROID',
  version: '',
  versionCode: '',
  channel: 'STABLE',
  url: '',
  checksum: '',
  changelog: '',
  mandatory: false,
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function channelTone(channel: Channel): 'success' | 'info' {
  return channel === 'STABLE' ? 'success' : 'info';
}

export default function ReleasesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [platformFilter, setPlatformFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const releases = useQuery({
    queryKey: ['admin', 'releases', 'list', page, platformFilter, channelFilter],
    queryFn: () =>
      api.admin.releases.list({
        page,
        pageSize: PAGE_SIZE,
        platform: platformFilter || undefined,
        channel: channelFilter || undefined,
      }),
  });

  const createRelease = useMutation({
    mutationFn: (body: CreateReleaseBody) => api.admin.releases.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'releases'] });
      setForm(EMPTY_FORM);
    },
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onPlatformFilter(value: string) {
    setPage(1);
    setPlatformFilter(value);
  }

  function onChannelFilter(value: string) {
    setPage(1);
    setChannelFilter(value);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createRelease.mutate({
      platform: form.platform,
      version: form.version.trim(),
      versionCode: Number(form.versionCode),
      channel: form.channel,
      url: form.url.trim(),
      checksum: form.checksum.trim() || undefined,
      changelog: form.changelog.trim() || undefined,
      mandatory: form.mandatory,
    });
  }

  async function copyLink(release: AppRelease) {
    try {
      await navigator.clipboard.writeText(release.url);
      setCopiedId(release.id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === release.id ? null : current));
      }, 2000);
    } catch {
      setCopiedId(null);
    }
  }

  const data = releases.data;
  const items = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="App releases"
        description="Publish mobile builds and share the download link with firm staff."
      />

      <Card>
        <CardHeader title="Publish build" />
        <form onSubmit={onSubmit} className="space-y-4 px-4 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Platform">
              <Select
                value={form.platform}
                onChange={(e) => update('platform', e.target.value as Platform)}
              >
                {PLATFORMS.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Version" hint="Semantic version shown to users, e.g. 1.0.1">
              <Input
                value={form.version}
                onChange={(e) => update('version', e.target.value)}
                placeholder="1.0.1"
                required
              />
            </Field>
            <Field label="Version code" hint="Monotonic build number">
              <Input
                type="number"
                min={0}
                step={1}
                value={form.versionCode}
                onChange={(e) => update('versionCode', e.target.value)}
                placeholder="101"
                required
              />
            </Field>
            <Field label="Channel">
              <Select
                value={form.channel}
                onChange={(e) => update('channel', e.target.value as Channel)}
              >
                {CHANNELS.map((channel) => (
                  <option key={channel} value={channel}>
                    {channel}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Download URL" hint="Direct APK / build link shared with clients">
              <Input
                type="url"
                value={form.url}
                onChange={(e) => update('url', e.target.value)}
                placeholder="https://downloads.gstflow.app/app-1.0.1.apk"
                required
              />
            </Field>
            <Field label="Checksum" hint="Optional SHA-256 of the build">
              <Input
                value={form.checksum}
                onChange={(e) => update('checksum', e.target.value)}
                placeholder="Optional"
              />
            </Field>
          </div>

          <Field label="Changelog" hint="Optional release notes">
            <textarea
              value={form.changelog}
              onChange={(e) => update('changelog', e.target.value)}
              rows={3}
              placeholder="What changed in this build?"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.mandatory}
              onChange={(e) => update('mandatory', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Mandatory update (clients must install this build)
          </label>

          {createRelease.isError ? (
            <p className="text-sm text-red-600">
              {createRelease.error instanceof Error ? createRelease.error.message : 'Failed to publish build'}
            </p>
          ) : null}
          {createRelease.isSuccess ? (
            <p className="text-sm text-green-600">Build published. Clients can now download it.</p>
          ) : null}

          <div className="flex justify-end">
            <Button type="submit" disabled={createRelease.isPending}>
              <Send className="h-4 w-4" />
              {createRelease.isPending ? 'Publishing...' : 'Publish build'}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Published builds"
          action={
            <div className="flex items-center gap-2">
              <Select
                value={platformFilter}
                onChange={(e) => onPlatformFilter(e.target.value)}
                className="w-36"
              >
                <option value="">All platforms</option>
                {PLATFORMS.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </Select>
              <Select
                value={channelFilter}
                onChange={(e) => onChannelFilter(e.target.value)}
                className="w-32"
              >
                <option value="">All channels</option>
                {CHANNELS.map((channel) => (
                  <option key={channel} value={channel}>
                    {channel}
                  </option>
                ))}
              </Select>
            </div>
          }
        />

        {releases.isLoading ? (
          <Spinner label="Loading releases..." />
        ) : releases.isError ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-red-600">
              {releases.error instanceof Error ? releases.error.message : 'Failed to load releases'}
            </p>
            <Button
              variant="secondary"
              className="mt-3"
              onClick={() => void releases.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No builds published yet"
            description="Publish a build above to generate the install link for firm staff."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Platform</th>
                  <th className="px-4 py-3">Version</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Channel</th>
                  <th className="px-4 py-3">Mandatory</th>
                  <th className="px-4 py-3">Published</th>
                  <th className="px-4 py-3 text-right">Download</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((release) => (
                  <tr key={release.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                        <Smartphone className="h-4 w-4 text-slate-400" />
                        {release.platform}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{release.version}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{release.versionCode}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Badge tone={channelTone(release.channel)}>{release.channel}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Badge tone={release.mandatory ? 'danger' : 'neutral'}>
                        {release.mandatory ? 'Mandatory' : 'Optional'}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                      {formatDate(release.publishedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <a
                          href={release.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-[220px] items-center gap-1 truncate text-brand-600 hover:underline"
                          title={release.url}
                        >
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{release.url}</span>
                        </a>
                        <Button
                          variant="secondary"
                          className="shrink-0 px-2 py-1"
                          onClick={() => void copyLink(release)}
                        >
                          {copiedId === release.id ? (
                            <>
                              <Check className="h-3.5 w-3.5" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" /> Copy link
                            </>
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-500">
            <span>
              Page {data.page} of {data.totalPages} &middot; {data.total} build
              {data.total === 1 ? '' : 's'}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={page >= data.totalPages}
                onClick={() => setPage((prev) => prev + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="mt-6 p-5">
        <h2 className="text-sm font-semibold text-slate-800">How clients get the app</h2>
        <p className="mt-2 text-sm text-slate-600">
          Firm staff share the published download link with their clients. The client installs this
          build, opens it and enters the phone number registered by their firm, then verifies the OTP
          to grant consent before any SMS is forwarded.
        </p>
      </Card>
    </div>
  );
}
