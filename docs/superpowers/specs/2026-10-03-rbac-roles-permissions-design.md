# GSTFlow — Configurable RBAC (Roles & Permissions)

Date: 2026-10-03
Status: Approved (design); pending implementation

## 1. Context

GSTFlow today authorizes staff with a hard-coded `Role` enum
(`SUPER_ADMIN`, `FIRM_ADMIN`, `FILER`, `CLIENT`) enforced by a `@Roles(...)`
decorator + `RolesGuard`. There is no permission catalog, no custom roles, and
no team-management screen in the firm panel.

Two actors need to manage access:

- The **platform owner** (super admin) needs to define roles, edit what each
  role can do, manage any user, and see roles across all firms.
- Each **firm admin** needs to manage their own team members and create
  firm-scoped roles, without ever being able to grant platform capabilities.

The `CLIENT` portal actor is synthetic (not backed by a `User` row) and is
**out of scope** — it keeps its current behaviour.

## 2. Decisions (from brainstorming)

| Question | Decision |
| --- | --- |
| RBAC depth | Configurable roles + permissions |
| Role scope | Global (system) roles + per-firm custom roles |
| Permission source | Code-defined catalog (each permission maps to server guards) |
| Architecture | Approach A: DB `Role` table + `RolePermission` join; `User.roleId` FK |
| Enforcement coverage | All staff modules |
| Roles per user | Exactly one |
| Client portal | Untouched (synthetic `CLIENT` actor) |
| Super admin | Implicit all-access bypass (cannot be locked out) |

## 3. Scope / Phasing

One spec; implemented in phases.

- **Phase 1 — Data model + enforcement foundation**
  - Prisma `Role`, `RolePermission`, `RoleScope`; `User.roleId`.
  - Permission catalog in code; `PermissionsGuard` + `@RequirePermissions` /
    `@RequireSuperAdmin`.
  - `JwtStrategy` reloads role + permissions per request.
  - Non-destructive migration + idempotent seed of system roles.
- **Phase 2 — API**
  - Admin roles/permissions endpoints; firm roles + team endpoints.
  - Switch every staff controller from `@Roles` to permission decorators.
- **Phase 3 — UI**
  - Admin panel: `/roles` page (matrix editor), `/users` role assignment.
  - Firm panel: `/<slug>/roles` and `/<slug>/team` pages, nav entries.

Out of scope now: multiple roles per user, time/condition-based rules,
per-object ACLs, editing the permission catalog at runtime, SSO.

## 4. Architecture

One API. Roles are DB rows; permissions are string keys defined in code so
every permission is backed by a guard. A role owns a set of permission keys;
a user has one role; effective permissions = the role's permission set (or all,
for the `SUPER_ADMIN` system role).

### 4.1 Effective permission resolution

On each authenticated staff request, `JwtStrategy.validate` loads the user with
`role.permissions`. The actor becomes:

```ts
interface Actor {
  userId: string;
  roleKey: string;          // e.g. 'FIRM_ADMIN', 'SUPER_ADMIN', custom key
  roleName: string;
  isSuperAdmin: boolean;    // roleKey === 'SUPER_ADMIN'
  permissions: string[];    // resolved permission keys
  firmId: string | null;
  clientId: string | null;
  email?: string;
  name?: string;
}
```

Reloading per request means permission edits and deactivation take effect on the
next request (no waiting for token refresh). `CLIENT` actors have
`roleKey: 'CLIENT'`, `permissions: []`.

A guard passes when: `actor.isSuperAdmin` **or** the actor holds any required
permission. `@RequireSuperAdmin()` passes only when `actor.isSuperAdmin`.
`@RequirePermissions(...)` requires **all** listed permissions.

### 4.2 Scoping rules

- A `SYSTEM` role has `firmId = null`. Any user (of any firm) may be assigned a
  system staff role. `SUPER_ADMIN` may only be assigned by a super admin.
- A `FIRM` role has `firmId` set and is assignable only within that firm.
- Firm admins may assign: system roles `FIRM_ADMIN`/`FILER`, and their own
  firm's `FIRM` roles. They may never assign `SUPER_ADMIN` or another firm's
  role.
- Firm custom roles may only use the **firm-allowed permission subset**
  (platform permissions excluded); the API rejects disallowed keys with 400.

## 5. Data model changes

```prisma
enum RoleScope { SYSTEM, FIRM }

model Role {
  id          String    @id @default(cuid())
  key         String
  name        String
  description String?
  scope       RoleScope @default(FIRM)
  firmId      String?   // null for SYSTEM roles
  isSystem    Boolean   @default(false)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  firm        Firm?            @relation(fields: [firmId], references: [id], onDelete: Cascade)
  permissions RolePermission[]
  users       User[]

  @@unique([firmId, key])
  @@index([scope])
}

model RolePermission {
  id         String @id @default(cuid())
  roleId     String
  permission String
  role       Role   @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@unique([roleId, permission])
  @@index([permission])
}

model User {
  // removed: role Role @default(FILER)
  roleId String?
  role   Role? @relation(fields: [roleId], references: [id], onDelete: SetNull)

  @@index([roleId])
}

model Firm {
  // ...existing...
  roles Role[]
}
```

`Role.key` is unique per `firmId`. Because PostgreSQL treats `NULL` as distinct,
system-role key uniqueness is enforced with a partial unique index added by the
migration:

```sql
CREATE UNIQUE INDEX "Role_system_key_key" ON "Role" ("key") WHERE "firmId" IS NULL;
```

The `Role` enum in `@gstflow/types` is retained for the `CLIENT` portal contract
only; it is no longer a `User` column.

## 6. Permission catalog (code)

Defined in `packages/types` (`permissions.ts`) and mirrored in the API.

Firm-scoped keys:

| Permission | Covers |
| --- | --- |
| `clients:read` | list/detail clients, view consents |
| `clients:write` | create/update clients |
| `clients:delete` | delete clients |
| `consents:manage` | revoke client consents |
| `filings:read` / `filings:write` | filings |
| `returns:read` / `returns:write` | GST returns |
| `invoices:read` / `invoices:write` | invoices |
| `documents:read` / `documents:write` | documents + download |
| `devices:read` / `devices:manage` | paired devices |
| `sms:read` / `sms:classify` | SMS messages |
| `billing:read` / `billing:manage` | invoices, subscriptions, payment requests |
| `payments:read` / `payments:manage` | payments, links, receivables |
| `audit:read` | firm audit log |
| `users:read` / `users:manage` | team members |
| `roles:read` / `roles:manage` | roles |

Platform keys (excluded from firm custom roles):

| Permission | Covers |
| --- | --- |
| `firms:read` / `firms:manage` | firms |
| `releases:read` / `releases:manage` | app releases |
| `platform_billing:read` | platform billing oversight |

`users:*` and `roles:*` are firm-scoped keys reused for team/role management.
Platform user- and role-admin endpoints additionally require
`@RequireSuperAdmin()`, so a firm role can never reach them.

Default system roles (preserve current behaviour):

- **SUPER_ADMIN** — implicit all-access bypass; permissions are also stored as
  the full catalog for display.
- **FIRM_ADMIN** — all firm-scoped keys (`clients:*`, `consents:manage`,
  `filings:*`, `returns:*`, `invoices:*`, `documents:*`, `devices:*`, `sms:*`,
  `billing:*`, `payments:*`, `audit:read`, `users:*`, `roles:*`).
- **FILER** — operational keys only: `clients:read`, `consents:manage`,
  `filings:*`, `returns:*`, `invoices:*`, `documents:*`, `devices:*`, `sms:*`,
  `billing:*`, `payments:*`, `audit:read`. No `clients:write/delete`, no
  `users:*`/`roles:*`.

Platform endpoints keep an additional `@RequireSuperAdmin()` so firm roles
cannot reach them even if a permission key overlaps.

## 7. Shared contracts

`packages/types`:

- `permissions.ts`: `PERMISSIONS` catalog (keys + group + label),
  `FIRM_ALLOWED_PERMISSIONS`, `PLATFORM_PERMISSIONS`, `PermissionKey`.
- `entities.ts`: `Role` (id, key, name, description, scope, firmId, isSystem,
  permissions, `_count.users`), `RolePermission` (key), `RoleScope`.
- `api.ts`: `CreateRoleBody`, `UpdateRoleBody`, `AssignRoleBody`,
  `PaginatedRoles`, `PermissionCatalog`, `PermissionGroup`, `TeamMember`,
  `CreateTeamMemberBody`, `UpdateTeamMemberBody`, `PaginatedTeam`.
- Extend `User` with `roleKey`, `roleName`, `roleId`.

`packages/validation`:

- `rbac.ts`: `createRoleSchema` (key/name/description/permissions[]),
  `updateRoleSchema`, `assignRoleSchema`, `listRolesQuerySchema`,
  `createTeamMemberSchema`, `updateTeamMemberSchema`, `listTeamQuerySchema`.

`packages/api-client`:

- `roles.list/get/create/update/delete`, `permissions.catalog`.
- `firm.roles.*`, `firm.team.*`.

## 8. API surface

All under `/v1`.

Admin (super admin only):

- `GET /admin/permissions` — full permission catalog, grouped.
- `GET /admin/roles` — system roles + optional `?firmId=` filter for firm roles.
- `POST /admin/roles` — create a system or firm role.
- `PATCH /admin/roles/:id`, `DELETE /admin/roles/:id` (system roles not deletable).
- Existing `PATCH /admin/users/:id` accepts `roleId`.

Firm:

- `GET /firm/permissions` — firm-allowed subset (grouped).
- `GET /firm/roles` — system assignable roles + this firm's roles.
- `POST /firm/roles`, `PATCH /firm/roles/:id`, `DELETE /firm/roles/:id`
  (firm-scoped only; platform keys rejected).
- `GET /firm/users` — team members of `actor.firmId`.
- `POST /firm/users`, `PATCH /firm/users/:id` — create/update team member and
  assign an assignable role.

Tenancy: every firm route filters by `actor.firmId`; cross-firm ids return
**404**. `SUPER_ADMIN` bypasses scoping. A firm admin attempting to assign a
non-assignable role → 400.

Controllers switch from `@Roles(...)` to `@RequirePermissions(...)` /
`@RequireSuperAdmin()` per the catalog mapping in §6.

## 9. UI

### 9.1 Super admin panel (`apps/admin`)

- New `/roles` page: table of roles (name, key, scope, firm, users count,
  system badge); create/edit dialog with a permission matrix grouped by module
  (checkboxes); delete custom roles. System roles are editable but not
  deletable; `SUPER_ADMIN` is read-only/locked.
- Enhance `/users`: role column, assign-role dropdown (any role), filter by
  role; create user can set role.
- New nav item "Roles".

### 9.2 Firm panel (`apps/web`)

- New `/<slug>/(dashboard)/roles`: firm roles + assignable system roles; create/
  edit firm role with a permission matrix limited to the firm-allowed subset.
- New `/<slug>/(dashboard)/team`: staff list (name, email, role, status);
  create member and assign role; activate/deactivate; edit role.
- Nav items "Team" and "Roles".

## 10. Error handling & edge cases

- Missing permission → **403**; unauthenticated → 401.
- Cross-firm resource → **404** (never 403) to avoid leaking ids.
- Assigning `SUPER_ADMIN` or another firm's role by a firm admin → **400**.
- Firm role containing platform permission keys → **400**.
- Deleting a role still assigned to users → **409** (must reassign first).
- Deleting a system role → **400**.
- Duplicate role key within the same scope/firm → **409**.
- `SUPER_ADMIN` cannot be stripped of access (bypass), preventing lockout.
- Role edits apply on the next request (no cached-token staleness).
- `PATCH /admin/users/:id` changing role records an `AuditLog` entry
  (actor, target, from→to).

## 11. Testing

- Unit (API): permission resolution incl. super-admin bypass;
  `PermissionsGuard` allow/deny; firm-allowed subset validation; role
  assignability rules; role-key uniqueness.
- e2e (API): super admin creates a role + assigns it; firm admin creates a
  firm role, assigns it to a teammate, and sees it take effect; firm admin
  cannot assign `SUPER_ADMIN` or a foreign role (400); cross-firm role/user
  access (404); missing permission (403); delete-in-use role (409).
- Typecheck: `apps/api`, `apps/web`, `apps/admin`, all packages.
- Build: `apps/web` and `apps/admin` production builds succeed.

## 12. Migration & rollout

Custom Prisma migration (non-destructive), in order:

1. Create `Role`, `RolePermission` tables and `RoleScope` enum.
2. Insert the three system roles (`SUPER_ADMIN`, `FIRM_ADMIN`, `FILER`) and
   their default `RolePermission` rows.
3. Add nullable `User.roleId`; backfill staff users from the old enum:
   `UPDATE "User" SET "roleId" = (SELECT id FROM "Role" WHERE key = UPPER(<role>) AND "firmId" IS NULL)`.
   Legacy `CLIENT` is synthetic and has no `User` rows, so no staff mapping is
   lost; any unexpected row is left with `roleId = NULL` for manual review.
4. Drop the old `User.role` column and `Role` enum type.

`seed.ts` is idempotent (upsert system roles + permissions) so fresh and
existing databases converge. Existing users keep their effective access because
defaults mirror today's `@Roles` behaviour.

Rollout is gated on the migration, so the API must deploy and migrate before
the new UI ships. No change to the mobile/client API contract.
