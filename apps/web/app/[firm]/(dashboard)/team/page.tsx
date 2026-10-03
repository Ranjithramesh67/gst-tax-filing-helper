'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import type { CreateTeamMemberBody, RoleDefinition, UpdateTeamMemberBody, User } from '@gstflow/types';
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
  cn,
} from '@/components/ui';

const PAGE_SIZE = 10;

interface CreateFormState {
  name: string;
  email: string;
  password: string;
  roleId: string;
  phone: string;
}

const EMPTY_FORM: CreateFormState = {
  name: '',
  email: '',
  password: '',
  roleId: '',
  phone: '',
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatDate(value?: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleString();
}

function roleLabel(role: RoleDefinition): string {
  return role.isSystem ? `${role.name} (system)` : role.name;
}

export default function TeamPage() {
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const rolesQuery = useQuery({
    queryKey: ['firm', 'roles'],
    queryFn: () => api.firm.roles.list(),
  });

  const teamQuery = useQuery({
    queryKey: ['firm', 'team', { page, search }],
    queryFn: () =>
      api.firm.team.list({ page, pageSize: PAGE_SIZE, search: search || undefined }),
  });

  const createMutation = useMutation({
    mutationFn: (body: CreateTeamMemberBody) => api.firm.team.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['firm', 'team'] });
      setForm(EMPTY_FORM);
      setFormError(null);
      setFormSuccess('Team member added.');
    },
    onError: (error) => {
      setFormSuccess(null);
      setFormError(errorMessage(error, 'Failed to add team member.'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; body: UpdateTeamMemberBody }) =>
      api.firm.team.update(vars.id, vars.body),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['firm', 'team'] });
    },
    onError: (error) => setActionError(errorMessage(error, 'Failed to update team member.')),
  });

  function updateField<K extends keyof CreateFormState>(key: K, value: CreateFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    createMutation.mutate({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      roleId: form.roleId || undefined,
      phone: form.phone.trim() || undefined,
    });
  }

  const roles = [...(rolesQuery.data?.system ?? []), ...(rolesQuery.data?.firm ?? [])];
  const members = teamQuery.data?.items ?? [];
  const totalPages = teamQuery.data?.totalPages ?? 0;
  const total = teamQuery.data?.total ?? 0;
  const updatingId = updateMutation.isPending ? updateMutation.variables?.id : undefined;

  return (
    <div>
      <PageHeader title="Team" description="Manage who can access your firm workspace." />

      <Card className="mb-6">
        <CardHeader title="Add team member" />
        <form onSubmit={onCreate} className="space-y-4 px-4 py-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="Jane Doe"
                required
                minLength={2}
                maxLength={200}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                placeholder="jane@firm.com"
                required
              />
            </Field>
            <Field label="Password" hint="At least 8 characters">
              <Input
                type="password"
                value={form.password}
                onChange={(e) => updateField('password', e.target.value)}
                placeholder="Password"
                required
                minLength={8}
                maxLength={128}
              />
            </Field>
            <Field label="Role">
              <Select
                value={form.roleId}
                onChange={(e) => updateField('roleId', e.target.value)}
                disabled={rolesQuery.isLoading}
              >
                <option value="">
                  {rolesQuery.isLoading ? 'Loading roles...' : 'Default (Filer)'}
                </option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {roleLabel(role)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Phone (optional)">
              <Input
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                placeholder="+919876543210"
              />
            </Field>
          </div>

          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          {formSuccess ? <p className="text-sm text-green-600">{formSuccess}</p> : null}

          <div className="flex justify-end">
            <Button type="submit" disabled={createMutation.isPending}>
              <Plus className="h-4 w-4" />
              {createMutation.isPending ? 'Adding...' : 'Add member'}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader
          title="Team members"
          action={
            <span className="text-xs text-slate-400">
              {teamQuery.isSuccess ? `${total} member${total === 1 ? '' : 's'}` : null}
            </span>
          }
        />

        <div className="border-b border-slate-200 px-4 py-3">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name or email"
              className="pl-9"
            />
          </div>
        </div>

        {actionError ? (
          <p className="border-b border-slate-200 px-4 py-2 text-sm text-red-600">{actionError}</p>
        ) : null}

        {teamQuery.isLoading ? (
          <Spinner label="Loading team..." />
        ) : teamQuery.isError ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium text-red-600">
              {errorMessage(teamQuery.error, 'Failed to load team.')}
            </p>
            <Button variant="secondary" className="mt-3" onClick={() => void teamQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : members.length === 0 ? (
          <EmptyState title="No team members" description="Add your first team member above." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last login</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member: User) => (
                  <tr key={member.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-800">{member.name}</td>
                    <td className="px-4 py-3 text-slate-600">{member.email}</td>
                    <td className="px-4 py-3">
                      <Select
                        value={member.roleId ?? ''}
                        onChange={(e) =>
                          updateMutation.mutate({ id: member.id, body: { roleId: e.target.value } })
                        }
                        disabled={updateMutation.isPending}
                        className={cn('max-w-[220px]', updatingId === member.id && 'opacity-50')}
                      >
                        {roles.map((role) => (
                          <option key={role.id} value={role.id}>
                            {roleLabel(role)}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={member.isActive ? 'success' : 'danger'}>
                        {member.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(member.lastLoginAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="secondary"
                        className={cn('px-2 py-1 text-xs', updatingId === member.id && 'opacity-50')}
                        disabled={updateMutation.isPending}
                        onClick={() =>
                          updateMutation.mutate({
                            id: member.id,
                            body: { isActive: !member.isActive },
                          })
                        }
                      >
                        {member.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <span className="text-xs text-slate-500">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="px-2 py-1 text-xs"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                className="px-2 py-1 text-xs"
                disabled={page >= totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
