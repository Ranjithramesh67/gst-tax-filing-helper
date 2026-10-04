# Firm Settings Self-Service — Design Spec

Date: 2026-10-04
Status: Approved
Depends on: RBAC roles & permissions (2026-10-03)

## 1. Problem

Firm branding (logo, brand colour, support contacts, address, default filing fee)
today can only be changed by a `SUPER_ADMIN` via `/v1/admin/firms/:id`. Firm admins
have no way to manage their own profile, so every brand tweak needs platform
support. This adds a firm-scoped profile endpoint and a Settings page.

## 2. Scope

In scope: a `FIRM_ADMIN` (holder of `firm:manage`) can read and update their own
firm's display and contact fields. Out of scope: changing `slug` (breaks firm URLs
and reserved-slug rules), changing `status` (platform control), and logo file
upload (logo remains a URL for now).

## 3. Permissions

Add two firm-scoped permissions in a new `Firm settings` group:

- `firm:read` — view the firm profile & branding
- `firm:manage` — edit the firm profile & branding

`FIRM_ADMIN_PERMISSIONS` already expands to all non-platform permissions, so the
seeded firm-admin role receives both. `FILER` does not, by default. System roles
are re-seeded (`npm run db:seed`), which replaces each system role's permission set.

## 4. API Surface

| Method | Path | Roles / permission | Body | Response |
|---|---|---|---|---|
| GET | `/v1/firm/profile` | `firm:read` | - | `Firm` (own firm) |
| PATCH | `/v1/firm/profile` | `firm:manage` | `UpdateFirmSettingsBody` | `Firm` |

Editable fields: `name`, `gstin`, `email`, `phone`, `logoUrl`, `brandColor`,
`supportEmail`, `supportPhone`, `address`, `defaultFilingFee`. Nullable fields may
be sent as `null` to clear them. `slug` and `status` are rejected by the Zod schema
(unknown keys stripped) and never written.

Tenant rule: the target firm is always `actor.firmId`. A super admin without a firm
receives `400`; a non-staff actor is blocked by the permission guard. Each update
writes an `AuditLog` row (`firm.profile.update`).

## 5. Surfaces

- `packages/types`: `UpdateFirmSettingsBody`, permission keys.
- `packages/validation`: `updateFirmSettingsSchema`.
- `packages/api-client`: `firm.profile.get()` / `firm.profile.update(body)`.
- `apps/web`: new `/[firm]/settings` page (form) + a "Settings" nav item gated on
  `firm:read`; after saving, `router.refresh()` re-renders the server-side branding
  used by the firm layout.

## 6. Testing

`apps/api/test/firm-settings.e2e-spec.ts`:

- firm admin reads own profile
- firm admin updates branding/contact fields and they persist
- `slug` and `status` cannot be changed through the self-service endpoint
- filer (no `firm:manage`) gets `403`
- super admin without a firm gets `400`
- an audit record is written
