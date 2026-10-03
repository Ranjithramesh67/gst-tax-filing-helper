'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import type { CreateRoleBody, PermissionGroup, RoleDefinition, UpdateRoleBody } from '@gstflow/types';
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
  Spinner,
  cn,
} from '@/components/ui';

interface RoleFormState {
  key: string;
  name: string;
  description: string;
  permissions: string[];
}

const EMPTY_FORM: RoleFormState = {
  key: '',
  name: '',
  description: '',
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

export default function FirmRolesPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<RoleFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const catalogQuery = useQuery({
    queryKey: ['firm', 'permissions'],
    queryFn: () => api.firm.permissions(),
  });

  const rolesQuery = useQuery({
    queryKey: ['firm', 'roles'],
    queryFn: () => api.firm.roles.list(),
  });

  const saveMutation = useMutation({
    mutationFn: (vars: { id: string | null; body: CreateRoleBody | UpdateRoleBody }) =>
      vars.id
        ? api.firm.roles.update(vars.id, vars.body as UpdateRoleBody)
        : api.firm.roles.create(vars.body as CreateRoleBody),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['firm', 'roles'] });
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
    mutationFn: (id: string) => api.firm.roles.remove(id),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['firm', 'roles'] });
    },
    onError: (error) => setActionError(errorMessage(error, 'Failed to delete role.')),
  });

  const groups: PermissionGroup[] = catalogQuery.data?.groups ?? [];
  const systemRoles = rolesQuery.data?.system ?? [];
  const firmRoles = rolesQuery.data?.firm ?? [];
  const selected = new Set(form.permissions);

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
        if (checked) next.add(permission.key);
        else next.delete(permission.key);
      }
      return { ...prev, permissions: [...next] };
    });
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
          permissions: form.permissions,
        },
      });
    }
  }

  return (
    <div>
      <PageHeader
        title="Roles & permissions"
        description="Create custom roles for your team. System roles are read-only."
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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
            <Field label="Key" hint="Uppercase with underscores.">
              <Input
                value={form.key}
                onChange={(e) => setForm((prev) => ({ ...prev, key: e.target.value.toUpperCase() }))}
                placeholder="SENIOR_FILER"
                required
                disabled={Boolean(editingId)}
                pattern="[A-Z0-9_]+"
              />
            </Field>
            <Field label="Description (optional)">
              <Input
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Can file returns and manage invoices"
                maxLength={200}
              />
            </Field>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Permissions ({form.permissions.length} selected)
            </p>
            {catalogQuery.isLoading ? (
              <Spinner label="Loading permissions..." />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {groups.map((group) => {
                  const allSelected = group.permissions.every((p) => selected.has(p.key));
                  return (
                    <div key={group.group} className="space-y-1">
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={(e) => toggleGroup(group, e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        {group.group}
                      </label>
                      <div className="space-y-1 pl-6">
                        {group.permissions.map((permission) => (
                          <label
                            key={permission.key}
                            className="flex items-center gap-2 text-xs text-slate-600"
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(permission.key)}
                              onChange={() => togglePermission(permission.key)}
                              className="h-3.5 w-3.5 rounded border-slate-300"
                            />
                            {permission.label}
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

      {actionError ? (
        <p className="mb-3 text-sm text-red-600">{actionError}</p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Your custom roles" />
          {rolesQuery.isLoading ? (
            <Spinner label="Loading roles..." />
          ) : firmRoles.length === 0 ? (
            <EmptyState title="No custom roles" description="Create one above." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {firmRoles.map((role) => (
                <li key={role.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{role.name}</p>
                    <p className="text-xs text-slate-500">
                      {role.key} &middot; {role.permissions.length} permissions &middot;{' '}
                      {role._count?.users ?? 0} users
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      className="px-2 py-1 text-xs"
                      onClick={() => startEdit(role)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      className={cn('px-2 py-1 text-xs', deleteMutation.isPending && 'opacity-50')}
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(role.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="System roles" />
          <ul className="divide-y divide-slate-100">
            {systemRoles.map((role) => (
              <li key={role.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-800">{role.name}</p>
                    <Badge tone="warning">read-only</Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    {role.key} &middot; {role.permissions.length} permissions
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
