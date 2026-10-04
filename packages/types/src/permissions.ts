// Permission catalog. Permissions are defined in code because every key must be
// enforced by a server-side guard; roles are DB rows that reference these keys.

export interface PermissionDef {
  key: string;
  group: string;
  label: string;
  /** Platform-scoped permissions can never be granted to a firm role. */
  platform?: boolean;
}

export const PERMISSION_DEFS: PermissionDef[] = [
  { key: 'clients:read', group: 'Clients', label: 'View clients' },
  { key: 'clients:write', group: 'Clients', label: 'Create / edit clients' },
  { key: 'clients:delete', group: 'Clients', label: 'Delete clients' },
  { key: 'consents:manage', group: 'Clients', label: 'Revoke client consents' },

  { key: 'filings:read', group: 'Filings', label: 'View filings' },
  { key: 'filings:write', group: 'Filings', label: 'Create / edit filings' },
  { key: 'returns:read', group: 'Filings', label: 'View GST returns' },
  { key: 'returns:write', group: 'Filings', label: 'Create / edit GST returns' },
  { key: 'invoices:read', group: 'Filings', label: 'View invoices' },
  { key: 'invoices:write', group: 'Filings', label: 'Create / edit invoices' },

  { key: 'documents:read', group: 'Documents', label: 'View / download documents' },
  { key: 'documents:write', group: 'Documents', label: 'Upload documents' },

  { key: 'devices:read', group: 'Devices & SMS', label: 'View devices' },
  { key: 'devices:manage', group: 'Devices & SMS', label: 'Register / revoke devices' },
  { key: 'sms:read', group: 'Devices & SMS', label: 'View SMS messages' },
  { key: 'sms:classify', group: 'Devices & SMS', label: 'Classify SMS messages' },

  { key: 'billing:read', group: 'Billing & Payments', label: 'View billing' },
  { key: 'billing:manage', group: 'Billing & Payments', label: 'Manage invoices & subscriptions' },
  { key: 'payments:read', group: 'Billing & Payments', label: 'View payments' },
  { key: 'payments:manage', group: 'Billing & Payments', label: 'Record / edit payments' },

  { key: 'users:read', group: 'Team & Access', label: 'View team members' },
  { key: 'users:manage', group: 'Team & Access', label: 'Manage team members' },
  { key: 'roles:read', group: 'Team & Access', label: 'View roles' },
  { key: 'roles:manage', group: 'Team & Access', label: 'Manage roles & permissions' },

  { key: 'audit:read', group: 'Audit', label: 'View audit log' },

  { key: 'firm:read', group: 'Firm settings', label: 'View firm profile & branding' },
  { key: 'firm:manage', group: 'Firm settings', label: 'Edit firm profile & branding' },

  { key: 'firms:read', group: 'Platform', label: 'View firms', platform: true },
  { key: 'firms:manage', group: 'Platform', label: 'Manage firms', platform: true },
  { key: 'releases:read', group: 'Platform', label: 'View app releases', platform: true },
  { key: 'releases:manage', group: 'Platform', label: 'Manage app releases', platform: true },
  { key: 'platform_billing:read', group: 'Platform', label: 'Platform billing oversight', platform: true },
];

export const PERMISSIONS: string[] = PERMISSION_DEFS.map((p) => p.key);
export const PLATFORM_PERMISSIONS: string[] = PERMISSION_DEFS.filter((p) => p.platform).map((p) => p.key);
export const FIRM_PERMISSIONS: string[] = PERMISSION_DEFS.filter((p) => !p.platform).map((p) => p.key);

const PERMISSION_SET = new Set(PERMISSIONS);

export function isPermissionKey(key: string): boolean {
  return PERMISSION_SET.has(key);
}

export function isPlatformPermission(key: string): boolean {
  return PLATFORM_PERMISSIONS.includes(key);
}

// Default permission sets for the built-in system roles. These mirror the
// previous hard-coded @Roles behaviour so existing users keep their access.
export const FILER_PERMISSIONS: string[] = [
  'clients:read',
  'consents:manage',
  'filings:read',
  'filings:write',
  'returns:read',
  'returns:write',
  'invoices:read',
  'invoices:write',
  'documents:read',
  'documents:write',
  'devices:read',
  'devices:manage',
  'sms:read',
  'sms:classify',
  'billing:read',
  'billing:manage',
  'payments:read',
  'payments:manage',
  'audit:read',
];

export const FIRM_ADMIN_PERMISSIONS: string[] = [
  ...FIRM_PERMISSIONS,
];

export const SUPER_ADMIN_PERMISSIONS: string[] = [...PERMISSIONS];

export const SYSTEM_ROLE_DEFAULTS: Record<string, string[]> = {
  SUPER_ADMIN: SUPER_ADMIN_PERMISSIONS,
  FIRM_ADMIN: FIRM_ADMIN_PERMISSIONS,
  FILER: FILER_PERMISSIONS,
};

export const SYSTEM_ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super admin',
  FIRM_ADMIN: 'Firm admin',
  FILER: 'Filer',
};
