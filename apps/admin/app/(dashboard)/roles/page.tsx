'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Trash2 } from 'lucide-react';
import type {
  CreateRoleBody,
  PermissionGroup,
  RoleDefinition,
  RoleScope,
  UpdateRoleBody,
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
  cn,
} from '@/components/ui';

const PAGE_SIZE = 10;

interface RoleFormState {
  key: string;
  name: string;
  description: string;
  scope: RoleScope;
  firmId: string;
  permissions: string[];
}

const EMPTY_FORM: RoleFormState = {
  key: '',
  name: '',
  description: '',
  scope: 'FIRM',
  firmId: '',
  permissions: [],
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function slugify(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export default function RolesPage() {
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState('');

  const [form, setForm] = useState<RoleFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
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

  const catalogQuery = useQuery({
    queryKey: ['admin', 'permissions'],
    queryFn: () => api.admin.permissions(),
  });

  const firmsQuery = useQuery({
    queryKey: ['admin', 'firms', 'options'],
    queryFn: () => api.admin.firms.list({ pageSize: 200 }),
  });

  const rolesQuery = useQuery({
    queryKey: ['admin', 'roles', { page, search, scope: scopeFilter }],
    queryFn: () =>
      api.admin.roles.list({
        page,
        pageSize: PAGE_SIZE,
        search: search || undefined,
        scope: (scopeFilter as RoleScope) || undefined,
      }),
  });

  const saveMutation = useMutation({
    mutationFn: (vars: { id: string | null; body: CreateRoleBody | UpdateRoleBody }) =>
      vars.id
        ? api.admin.roles.update(vars.id, vars.body as UpdateRoleBody)
        : api.admin.roles.create(vars.body as CreateRoleBody),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
      setForm(EMPTY_FORM);
      setEditingId(null);
      setFormError(null);
      setFormSuccess(editingId ? 'Role updated.' : 'Role created.');
    },
    onError: (error) => {
      setFormSuccess(null);
      setFormError(errorMessage(error, 'Failed to save role.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.admin.roles.remove(id),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
    },
    onError: (error) => setActionError(errorMessage(error, 'Failed to delete role.')),
  });

  const groups: PermissionGroup[] = catalogQuery.data?.groups ?? [];
  const firms = firmsQuery.data?.items ?? [];
  const roles = rolesQuery.data?.items ?? [];
  const totalPages = rolesQuery.data?.totalPages ?? 0;
  const total = rolesQuery.data?.total ?? 0;

  const permissionFilter = useMemo(() => new Set(form.permissions), [form.permissions]);

  function updateField<K extends keyof RoleFormState>(key: K, value: RoleFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function togglePermission(key: string) {
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(key)
        ? prev.permissions.filter((p) => p !== key)
        : [...prev.permissions, key],
    }));
  }

  function toggleGroup(group: PermissionGroup, checked: boolean) {
    setForm((prev) => {
      const next = new Set(prev.permissions);
      for (const permission of group.permissions) {
        if (!scopeIsSystem() && permission.platform) continue;
        if (checked) next.add(permission.key);
        else next.delete(permission.key);
      }
      return { ...prev, permissions: [...next] };
    });
  }

  function scopeIsSystem(): boolean {
    return form.scope === 'SYSTEM';
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError(null);
    setFormSuccess(null);
  }

  function startEdit(role: RoleDefinition) {
    setEditingId(role.id);
    setForm({
      key: role.key,
      name: role.name,
      description: role.description ?? '',
      scope: role.scope,
      firmId: role.firmId ?? '',
      permissions: role.permissions,
    });
    setFormError(null);
    setFormSuccess(null);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    if (editingId) {
      saveMutation.mutate({
        id: editingId,
        body: {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          permissions: form.permissions,
        },
      });
    } else {
      saveMutation.mutate({
        id: null,
        body: {
          key: form.key.trim(),
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          scope: form.scope,
          firmId: form.scope === 'FIRM' ? form.firmId || undefined : undefined,
          permissions: form.permissions,
        },
      });
    }
  }

  const visibleGroups = groups
    .map((group) => ({
      group: group.group,
      permissions: group.permissions.filter((p) => scopeIsSystem() || !p.platform),
    }))
    .filter((group) => group.permissions.length > 0);

  return (
    <div>
      <PageHeader
        title="Roles & permissions"
        description="Define reusable permission sets for platform and firm staff."
      />

      <Card className="mb-6">
        <CardHeader
          title={editingId ? 'Edit role' : 'Create role'}
          action={
            editingId ? (
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={resetForm}>
                Cancel
              </Button>
            ) : null
          }
        />
        <form onSubmit={onSubmit} className="space-y-4 px-4 py-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    name,
                    ...(editingId ? {} : { key: prev.key || slugify(name) }),
                  }));
                }}
                placeholder="Senior filer"
                required
                minLength={2}
                maxLength={100}
              />
            </Field>
            <Field label="Key" hint="Used in APIs; uppercase with underscores.">
              <Input
                value={form.key}
                onChange={(e) => updateField('key', e.target.value.toUpperCase())}
                placeholder="SENIOR_FILER"
                required
                disabled={Boolean(editingId)}
                pattern="[A-Z0-9_]+"
                title="Uppercase letters, numbers and underscores only"
              />
            </Field>
            <Field label="Scope">
              <Select
                value={form.scope}
                onChange={(e) => updateField('scope', e.target.value as RoleScope)}
                disabled={Boolean(editingId)}
              >
                <option value="FIRM">Firm role</option>
                <option value="SYSTEM">Global (platform) role</option>
              </Select>
            </Field>
            {form.scope === 'FIRM' && !editingId ? (
              <Field label="Firm" hint="Leave empty to create for a specific firm. Required.">
                <Select
                  value={form.firmId}
                  onChange={(e) => updateField('firmId', e.target.value)}
                  disabled={firmsQuery.isLoading}
                  required
                >
                  <option value="" disabled>
                    {firmsQuery.isLoading ? 'Loading firms...' : 'Select a firm'}
                  </option>
                  {firms.map((firm) => (
                    <option key={firm.id} value={firm.id}>
                      {firm.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Description (optional)">
              <Input
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="Can file returns and manage invoices"
                maxLength={200}
              />
            </Field>
          </div>

          <div className="rounded-md border border-ink-600 bg-ink-900/40 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              Permissions ({form.permissions.length} selected)
            </p>
            {catalogQuery.isLoading ? (
              <Spinner label="Loading permissions..." />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {visibleGroups.map((group) => {
                  const allSelected = group.permissions.every((p) => permissionFilter.has(p.key));
                  return (
                    <div key={group.group} className="space-y-1">
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-200">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={(e) => toggleGroup(group as PermissionGroup, e.target.checked)}
                          className="h-4 w-4 rounded border-ink-600 bg-ink-800"
                        />
                        {group.group}
                      </label>
                      <div className="space-y-1 pl-6">
                        {group.permissions.map((permission) => (
                          <label
                            key={permission.key}
                            className="flex items-center gap-2 text-xs text-slate-400"
                          >
                            <input
                              type="checkbox"
                              checked={permissionFilter.has(permission.key)}
                              onChange={() => togglePermission(permission.key)}
                              className="h-3.5 w-3.5 rounded border-ink-600 bg-ink-800"
                            />
                            {permission.label}
                            {permission.platform ? (
                              <span className="text-[10px] uppercase text-amber-400">platform</span>
                            ) : null}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          {formSuccess ? <p className="text-sm text-green-600">{formSuccess}</p> : null}

          <div className="flex justify-end">
            <Button type="submit" disabled={saveMutation.isPending}>
              <Plus className="h-4 w-4" />
              {saveMutation.isPending ? 'Saving...' : editingId ? 'Save changes' : 'Create role'}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader
          title="Roles"
          action={
            <span className="text-xs text-slate-400">
              {rolesQuery.isSuccess ? `${total} role${total === 1 ? '' : 's'}` : null}
            </span>
          }
        />

        <div className="grid grid-cols-1 gap-3 border-b border-ink-600 px-4 py-3 sm:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search roles"
              className="pl-9"
            />
          </div>
          <Select
            value={scopeFilter}
            onChange={(e) => {
              setScopeFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All scopes</option>
            <option value="SYSTEM">Global</option>
            <option value="FIRM">Firm</option>
          </Select>
        </div>

        {actionError ? (
          <p className="border-b border-ink-600 px-4 py-2 text-sm text-red-600">{actionError}</p>
        ) : null}

        {rolesQuery.isLoading ? (
          <Spinner label="Loading roles..." />
        ) : rolesQuery.isError ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium text-red-600">
              {errorMessage(rolesQuery.error, 'Failed to load roles.')}
            </p>
            <Button variant="secondary" className="mt-3" onClick={() => void rolesQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : roles.length === 0 ? (
          <EmptyState title="No roles found" description="Create a role above to get started." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink-600 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Key</th>
                  <th className="px-4 py-3 font-medium">Scope</th>
                  <th className="px-4 py-3 font-medium">Firm</th>
                  <th className="px-4 py-3 font-medium">Permissions</th>
                  <th className="px-4 py-3 font-medium">Users</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.id} className="border-b border-ink-700 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-100">
                      <div className="flex items-center gap-2">
                        {role.name}
                        {role.isSystem ? <Badge tone="warning">system</Badge> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{role.key}</td>
                    <td className="px-4 py-3">
                      <Badge tone={role.scope === 'SYSTEM' ? 'info' : 'neutral'}>
                        {role.scope === 'SYSTEM' ? 'Global' : 'Firm'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{role.firm?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-400">{role.permissions.length}</td>
                    <td className="px-4 py-3 text-slate-400">{role._count?.users ?? 0}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          className="px-2 py-1 text-xs"
                          onClick={() => startEdit(role)}
                        >
                          Edit
                        </Button>
                        {!role.isSystem ? (
                          <Button
                            variant="danger"
                            className={cn(
                              'px-2 py-1 text-xs',
                              deleteMutation.isPending && 'opacity-50',
                            )}
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate(role.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-ink-600 px-4 py-3">
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
