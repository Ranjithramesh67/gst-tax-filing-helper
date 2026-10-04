# SMS provider configuration in the super admin panel

Date: 2026-10-04
Status: Implemented

## Problem

Outbound OTP SMS credentials (endpoint, api key, sender/header, route, DLT
template id, message body) lived only in server environment variables. Changing a
provider, templating the message, or testing delivery required a redeploy and SSH
access. Operators need to manage and test SMS providers from the super admin
panel, and switch providers at any time without a code change.

## Design

### Storage

New `SmsProviderConfig` table:

- `name`, `provider` (`SmsProviderKind`, currently `PING4SMS`), `isActive`
- `url`, `method`, `sender`, `route`, `templateId`, `header`
- `credentials` — AES-256-GCM encrypted JSON (via `CryptoService`), never returned
- `messageTemplate`, `appName`, `variables` (JSON), `timeoutMs`
- `updatedById` for audit trail

At most one row is active at a time; activating a provider clears the flag on all
others in a single transaction. The first provider created auto-activates.

### Provider abstraction

`SmsProviderConfigService` resolves the active provider and renders the outbound
message. `buildPing4SmsRequest` maps the canonical message onto the ping4sms
query-string contract. The `provider` column exists so additional adapters can be
added later without changing callers. `SmsGatewayService.sendOtp` prefers the
active DB provider and falls back to the existing `SMS_GATEWAY_*` env gateway, so
deployments keep sending during migration.

### Message templating

`renderSmsMessage` replaces `{{token}}` placeholders case/whitespace-insensitively:

- `{{app name}}`, `{{app_name}}` → `appName`
- `{{variable}}`, `{{otp}}`, `{{code}}` → the generated OTP
- any other token → looked up in the operator-provided `variables` map

Unknown tokens are left in place so misconfiguration is visible in a test send.

### Admin API

`/admin/sms-providers` (all `RequireSuperAdmin`): list, get, create, update,
activate, and `test`. The test endpoint accepts a saved `providerId`, inline
`config`, or both (inline overrides merge on top of the saved row), plus one or
more `numbers` and an optional `code`. It returns per-number results plus the
rendered preview; it never echoes stored credentials. Credentials are only
replaced when explicitly provided, so operators can edit other fields without
re-entering the key.

### Admin UI

New "SMS Gateway" page: provider list with active toggle, create/edit form for
every field (endpoint, method, sender/header, route, template id, credentials,
message, variables, timeout), and a test panel that sends to one or many numbers
and shows per-number delivery status.

## Security

- Secrets encrypted at rest; API responses expose only credential key names and a
  `hasCredentials` flag.
- All endpoints are super-admin only.
- Every create/update/activate/test writes an `AuditService` entry (test metadata
  records counts and numbers, never credentials).

## Testing

- Unit: template rendering/aliases, `buildPing4SmsRequest` mapping, `maskSecret`,
  and gateway preference of the DB provider over env (13 tests).
- E2E: RBAC (401/403), create/update without secret leakage, single-active
  activation, and multi-number test + inline test against an unreachable endpoint
  (7 tests).
