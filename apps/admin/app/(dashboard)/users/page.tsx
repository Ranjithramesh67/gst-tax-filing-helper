'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { Role } from '@gstflow/types';
import type { CreateUserBody, User } from '@gstflow/types';
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

const ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: Role.FIRM_ADMIN, label: 'Firm admin' },
  { value: Role.FILER, label: 'Filer' },
];

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super admin',
  FIRM_ADMIN: 'Firm admin',
  FILER: 'Filer',
  CLIENT: 'Client',
};

interface CreateFormState {
  name: string;
  email: string;
  password: string;
  role: Role;
  firmId: string;
  phone: string;
}

const EMPTY_FORM: CreateFormState = {
  name: '',
  email: '',
  password: '',
  role: Role.FIRM_ADMIN,
  firmId: '',
  phone: '',
};

function formatDate(value?: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleString();
}

function roleTone(role: Role) {
  if (role === Role.FIRM_ADMIN) return 'info' as const;
  if (role === Role.SUPER_ADMIN) return 'warning' as const;
  return 'neutral' as const;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function UsersPage() {
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [firmFilter, setFirmFilter] = useState('');

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

  const firmsQuery = useQuery({
    queryKey: ['admin', 'firms', 'options'],
    queryFn: () => api.admin.firms.list({ pageSize: 200 }),
  });

  const usersQuery = useQuery({
    queryKey: ['admin', 'users', { page, search, role: roleFilter, firmId: firmFilter }],
    queryFn: () =>
      api.admin.users.list({
        page,
        pageSize: PAGE_SIZE,
        search: search || undefined,
        role: roleFilter || undefined,
        firmId: firmFilter || undefined,
      }),
  });

  const createMutation = useMutation({
    mutationFn: (body: CreateUserBody) => api.admin.users.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setForm(EMPTY_FORM);
      setFormError(null);
      setFormSuccess('User created.');
    },
    onError: (error) => {
      setFormSuccess(null);
      setFormError(errorMessage(error, 'Failed to create user.'));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (user: User) => api.admin.users.update(user.id, { isActive: !user.isActive }),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error) => {
      setActionError(errorMessage(error, 'Failed to update user.'));
    },
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
      role: form.role,
      firmId: form.firmId || undefined,
      phone: form.phone.trim() || undefined,
    });
  }

  const firms = firmsQuery.data?.items ?? [];
  const users = usersQuery.data?.items ?? [];
  const totalPages = usersQuery.data?.totalPages ?? 0;
  const total = usersQuery.data?.total ?? 0;
  const togglingId = toggleMutation.isPending ? toggleMutation.variables?.id : undefined;

  return (
    <div>
      <PageHeader
        title="Users"
        description="Create firm staff accounts and control access to the platform."
      />

      <Card className="mb-6">
        <CardHeader title="Create user" />
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
                value={form.role}
                onChange={(e) => updateField('role', e.target.value as Role)}
                required
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Firm"
              hint={firmsQuery.isError ? 'Could not load firms.' : undefined}
            >
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
              {createMutation.isPending ? 'Creating...' : 'Create user'}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader
          title="All users"
          action={
            <span className="text-xs text-slate-400">
              {usersQuery.isSuccess ? `${total} user${total === 1 ? '' : 's'}` : null}
            </span>
          }
        />

        <div className="grid grid-cols-1 gap-3 border-b border-slate-200 px-4 py-3 sm:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name or email"
              className="pl-9"
            />
          </div>
          <Select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All roles</option>
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select
            value={firmFilter}
            onChange={(e) => {
              setFirmFilter(e.target.value);
              setPage(1);
            }}
            disabled={firmsQuery.isLoading}
          >
            <option value="">All firms</option>
            {firms.map((firm) => (
              <option key={firm.id} value={firm.id}>
                {firm.name}
              </option>
            ))}
          </Select>
        </div>

        {actionError ? (
          <p className="border-b border-slate-200 px-4 py-2 text-sm text-red-600">{actionError}</p>
        ) : null}

        {usersQuery.isLoading ? (
          <Spinner label="Loading users..." />
        ) : usersQuery.isError ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium text-red-600">
              {errorMessage(usersQuery.error, 'Failed to load users.')}
            </p>
            <Button
              variant="secondary"
              className="mt-3"
              onClick={() => void usersQuery.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : users.length === 0 ? (
          <EmptyState
            title="No users found"
            description="Adjust the filters or create a new user above."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Firm</th>
                  <th className="px-4 py-3 font-medium">Active</th>
                  <th className="px-4 py-3 font-medium">Last login</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-800">{user.name}</td>
                    <td className="px-4 py-3 text-slate-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <Badge tone={roleTone(user.role)}>
                        {ROLE_LABELS[user.role] ?? user.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{user.firm?.name ?? '-'}</td>
                    <td className="px-4 py-3">
                      <Badge tone={user.isActive ? 'success' : 'danger'}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(user.lastLoginAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="secondary"
                        className={cn('px-2 py-1 text-xs', togglingId === user.id && 'opacity-50')}
                        disabled={toggleMutation.isPending}
                        onClick={() => toggleMutation.mutate(user)}
                      >
                        {user.isActive ? 'Deactivate' : 'Activate'}
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
