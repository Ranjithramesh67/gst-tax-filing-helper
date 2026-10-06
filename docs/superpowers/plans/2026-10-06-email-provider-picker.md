# Email Provider Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a provider picker to the mobile email settings screen so users can link Gmail/Outlook via the existing OAuth flows or auto-fill IMAP host/port for Zoho, GoDaddy, and Hostinger.

**Architecture:** A static, offline provider catalog (`emailProviders.ts`) drives a presentational `ProviderChips` row inside the existing "Add account" card. Selecting an IMAP provider prefills editable host/port and submits through the unchanged `EmailAccounts.addImapAccount`; selecting Gmail/Outlook hides the IMAP fields and calls the already-wired `EmailAccounts.linkGmail()/linkGraph()`.

**Tech Stack:** React Native 0.75, TypeScript, jest, `@react-native/babel-preset`.

## Global Constraints

- Mobile-only change. Do **not** touch any Kotlin/native file, `apps/mobile/src/native/EmailAccounts.ts`, `GmailLinkActivity.kt`, or `GraphLinkActivity.kt`.
- Catalog is static and offline; it contains **no secrets** and performs no I/O.
- Default selected provider is `other`; selection is **not persisted** across screen mounts.
- Host/port are **prefilled but remain editable** for IMAP providers.
- Gmail/Outlook use the existing `EmailAccounts.linkGmail()` / `linkGraph()` only.
- Never retain or echo the password. It is cleared after every submit attempt.
- Real Gmail/Outlook success stays blocked by external Google/Azure credentials; out of scope. The screen must still surface a friendly message.
- The repo `prepare-commit-msg` hook auto-appends the `Co-authored-by` trailer; do **not** add it manually.
- Spec: `docs/superpowers/specs/2026-10-06-email-provider-picker-design.md`.

---

### Task 1: Provider catalog module

**Files:**
- Create: `apps/mobile/src/lib/emailProviders.ts`
- Test: `apps/mobile/src/lib/emailProviders.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type EmailProviderId = 'gmail' | 'outlook' | 'zoho' | 'godaddy' | 'hostinger' | 'other'`
  - `type EmailProviderAction = 'oauth' | 'imap'`
  - `interface EmailProviderPreset { id: EmailProviderId; label: string; action: EmailProviderAction; host?: string; port?: number; passwordLabel?: string; helper: string }`
  - `const EMAIL_PROVIDER_PRESETS: readonly EmailProviderPreset[]`
  - `function presetFor(id: EmailProviderId): EmailProviderPreset` (throws on unknown id)

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/lib/emailProviders.spec.ts`:

```ts
import { EMAIL_PROVIDER_PRESETS, presetFor, type EmailProviderId } from './emailProviders';

describe('email provider catalog', () => {
  it('has exactly six entries in the expected order with unique ids', () => {
    expect(EMAIL_PROVIDER_PRESETS).toHaveLength(6);
    expect(EMAIL_PROVIDER_PRESETS.map((p) => p.id)).toEqual([
      'gmail',
      'outlook',
      'zoho',
      'godaddy',
      'hostinger',
      'other',
    ]);
  });

  it('gives every IMAP provider a port in range', () => {
    for (const preset of EMAIL_PROVIDER_PRESETS.filter((p) => p.action === 'imap')) {
      expect(preset.port).toBeGreaterThanOrEqual(1);
      expect(preset.port).toBeLessThanOrEqual(65535);
    }
  });

  it('prefills the documented hosts', () => {
    expect(presetFor('zoho').host).toBe('imap.zoho.com');
    expect(presetFor('godaddy').host).toBe('imap.secureserver.net');
    expect(presetFor('hostinger').host).toBe('imap.hostinger.com');
    expect(presetFor('other').host).toBeUndefined();
  });

  it('gives OAuth providers no host or port', () => {
    for (const preset of EMAIL_PROVIDER_PRESETS.filter((p) => p.action === 'oauth')) {
      expect(preset.host).toBeUndefined();
      expect(preset.port).toBeUndefined();
    }
    expect(presetFor('gmail').action).toBe('oauth');
    expect(presetFor('outlook').action).toBe('oauth');
  });

  it('returns the matching preset and throws on an unknown id', () => {
    expect(presetFor('hostinger').label).toBe('Hostinger email');
    expect(() => presetFor('nope' as EmailProviderId)).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace @gstflow/mobile -- emailProviders`
Expected: FAIL — cannot resolve `./emailProviders`.

- [ ] **Step 3: Write the module**

Create `apps/mobile/src/lib/emailProviders.ts`:

```ts
/**
 * Static catalog of supported email providers for the settings picker.
 *
 * Pure and offline: no secrets, no network. Gmail and Outlook route to the
 * native OAuth link flows because neither supports password-based IMAP
 * (Microsoft disabled basic auth entirely; Google requires app passwords).
 */

export type EmailProviderId = 'gmail' | 'outlook' | 'zoho' | 'godaddy' | 'hostinger' | 'other';

export type EmailProviderAction = 'oauth' | 'imap';

export interface EmailProviderPreset {
  id: EmailProviderId;
  label: string;
  action: EmailProviderAction;
  host?: string;
  port?: number;
  passwordLabel?: string;
  helper: string;
}

export const EMAIL_PROVIDER_PRESETS: readonly EmailProviderPreset[] = [
  {
    id: 'gmail',
    label: 'Gmail',
    action: 'oauth',
    helper: 'Sign in with Google. Your password is never stored.',
  },
  {
    id: 'outlook',
    label: 'Outlook / Microsoft 365',
    action: 'oauth',
    helper: 'Sign in with Microsoft. Your password is never stored.',
  },
  {
    id: 'zoho',
    label: 'Zoho Mail',
    action: 'imap',
    host: 'imap.zoho.com',
    port: 993,
    passwordLabel: 'App password',
    helper:
      'Custom-domain Zoho accounts use imappro.zoho.com; Zoho India uses imap.zoho.in. Enable IMAP access; use an app password if 2FA is on.',
  },
  {
    id: 'godaddy',
    label: 'GoDaddy email',
    action: 'imap',
    host: 'imap.secureserver.net',
    port: 993,
    passwordLabel: 'Password',
    helper:
      'Works for Workspace and Professional Email. If your plan is Microsoft 365, choose Outlook above.',
  },
  {
    id: 'hostinger',
    label: 'Hostinger email',
    action: 'imap',
    host: 'imap.hostinger.com',
    port: 993,
    passwordLabel: 'Password',
    helper: 'Use your mailbox password.',
  },
  {
    id: 'other',
    label: 'Other / manual',
    action: 'imap',
    port: 993,
    passwordLabel: 'Password',
    helper: "Enter your provider's IMAP host and port.",
  },
];

export function presetFor(id: EmailProviderId): EmailProviderPreset {
  const preset = EMAIL_PROVIDER_PRESETS.find((entry) => entry.id === id);
  if (!preset) throw new Error(`Unknown email provider: ${id}`);
  return preset;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace @gstflow/mobile -- emailProviders`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck --workspace @gstflow/mobile`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/lib/emailProviders.ts apps/mobile/src/lib/emailProviders.spec.ts
git commit -m "feat(mobile): add static email provider catalog"
```

---

### Task 2: ProviderChips component

**Files:**
- Create: `apps/mobile/src/components/ProviderChips.tsx`

**Interfaces:**
- Consumes: `EMAIL_PROVIDER_PRESETS`, `EmailProviderId` from Task 1; `colors/spacing/radius/fontSize` from `@/theme`.
- Produces: `function ProviderChips(props: { selected: EmailProviderId; onSelect: (id: EmailProviderId) => void; disabled?: boolean }): React.ReactElement`

- [ ] **Step 1: Write the component**

Create `apps/mobile/src/components/ProviderChips.tsx`:

```tsx
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { EMAIL_PROVIDER_PRESETS, type EmailProviderId } from '@/lib/emailProviders';
import { colors, fontSize, radius, spacing } from '@/theme';

interface ProviderChipsProps {
  selected: EmailProviderId;
  onSelect: (id: EmailProviderId) => void;
  disabled?: boolean;
}

/** Horizontal selector for the email provider catalog. Presentational only. */
export function ProviderChips({
  selected,
  onSelect,
  disabled,
}: ProviderChipsProps): React.ReactElement {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {EMAIL_PROVIDER_PRESETS.map((preset) => {
        const isSelected = preset.id === selected;
        return (
          <Pressable
            key={preset.id}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected, disabled: Boolean(disabled) }}
            disabled={disabled}
            onPress={() => onSelect(preset.id)}
            style={({ pressed }) => [
              styles.chip,
              isSelected && styles.chipSelected,
              pressed && !isSelected && styles.chipPressed,
              disabled && styles.chipDisabled,
            ]}
          >
            <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
              {preset.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  chipPressed: {
    backgroundColor: colors.background,
  },
  chipDisabled: {
    opacity: 0.6,
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
  },
  chipTextSelected: {
    color: colors.surface,
  },
});

export default ProviderChips;
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @gstflow/mobile`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/ProviderChips.tsx
git commit -m "feat(mobile): add ProviderChips selector component"
```

---

### Task 3: Wire picker into EmailSettingsScreen

**Files:**
- Modify: `apps/mobile/src/screens/Email/EmailSettingsScreen.tsx`

**Interfaces:**
- Consumes: `ProviderChips` (Task 2), `presetFor`/`EmailProviderId` (Task 1), `EmailAccounts.linkGmail()/linkGraph()` (existing), `EmailAccounts.addImapAccount(...)` (existing).
- Produces: nothing imported elsewhere.

- [ ] **Step 1: Add imports**

In `apps/mobile/src/screens/Email/EmailSettingsScreen.tsx`, replace the import block (currently lines 17-19) with:

```tsx
import { EmailAccounts, type EmailAccountMetadata } from '@/native/EmailAccounts';
import { useAuth } from '@/lib/auth';
import { ProviderChips } from '@/components/ProviderChips';
import { presetFor, type EmailProviderId } from '@/lib/emailProviders';
import { colors, fontSize, radius, spacing } from '@/theme';
```

- [ ] **Step 2: Add the OAuth error mapper**

Add this module-level function immediately after `isValidPort` (after the block ending at the current line 41):

```tsx
function oauthErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | undefined)?.code;
  switch (code) {
    case 'LINK_CANCELLED':
      return 'Sign-in was cancelled.';
    case 'IN_PROGRESS':
      return 'A sign-in is already in progress.';
    case 'NO_ACTIVITY':
      return 'Could not start sign-in. Please try again.';
    default:
      return error instanceof Error && error.message
        ? error.message
        : 'Could not link the account.';
  }
}
```

- [ ] **Step 3: Add provider state and selection handler**

In the component, after the existing `const [adding, setAdding] = useState(false);` line (currently line 57), add:

```tsx
const [provider, setProvider] = useState<EmailProviderId>('other');
const [linking, setLinking] = useState<EmailProviderId | null>(null);
```

Then, after the `load` callback (currently ending line 70), add:

```tsx
const selectedPreset = presetFor(provider);
const isOauth = selectedPreset.action === 'oauth';

const applyPreset = useCallback((id: EmailProviderId) => {
  const preset = presetFor(id);
  setHost(preset.host ?? '');
  setPort(preset.port ? String(preset.port) : '993');
}, []);

const onSelectProvider = useCallback(
  (id: EmailProviderId) => {
    setProvider(id);
    setErrors({});
    setNotice(null);
    setPassword('');
    applyPreset(id);
  },
  [applyPreset],
);
```

- [ ] **Step 4: Make validation skip OAuth**

Replace the existing `validate` callback (currently lines 106-114) with:

```tsx
const validate = useCallback((): FormErrors => {
  const next: FormErrors = {};
  if (!address.trim()) next.address = 'Email address is required.';
  else if (!EMAIL_PATTERN.test(address.trim())) next.address = 'Enter a valid email address.';
  if (!isOauth) {
    if (!password) next.password = 'Password is required.';
    if (!host.trim()) next.host = 'IMAP host is required.';
    if (!isValidPort(port)) next.port = 'Port must be between 1 and 65535.';
  }
  return next;
}, [address, host, isOauth, password, port]);
```

- [ ] **Step 5: Reset to the current preset after a successful IMAP add**

In `onAddAccount`, replace the success-reset block (currently lines 139-142):

```tsx
        setAddress('');
        setHost('');
        setPort('993');
        setErrors({});
```

with:

```tsx
        setAddress('');
        setErrors({});
        applyPreset(provider);
```

and add `applyPreset` and `provider` to that callback's dependency array (currently `[address, host, load, password, port, validate]` → `[address, applyPreset, host, load, password, port, provider, validate]`).

- [ ] **Step 6: Add the OAuth link handler**

Immediately after the `onAddAccount` callback (currently ending line 153), add:

```tsx
const onLinkOauth = useCallback(async () => {
  if (!EmailAccounts.isAvailable) {
    setNotice('Email accounts are only available on Android.');
    return;
  }
  const id = provider;
  setLinking(id);
  setNotice(null);
  try {
    const result = id === 'gmail' ? await EmailAccounts.linkGmail() : await EmailAccounts.linkGraph();
    if (result.ok) {
      await load();
      setNotice(id === 'gmail' ? 'Gmail account linked.' : 'Outlook account linked.');
    } else {
      setNotice('Could not link the account. Please try again.');
    }
  } catch (error) {
    setNotice(oauthErrorMessage(error));
  } finally {
    setLinking(null);
  }
}, [load, provider]);
```

- [ ] **Step 7: Replace the Add-account card body**

Replace the entire existing "Add account" card block (currently lines 265-344, from `<View style={styles.card}>` containing `Add IMAP account` through its closing `</View>`) with:

```tsx
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Add email account</Text>
          <Text style={styles.helper}>
            Pick your provider, or choose Other to enter IMAP details manually. Credentials stay
            encrypted on this device.
          </Text>

          <ProviderChips
            selected={provider}
            onSelect={onSelectProvider}
            disabled={adding || linking != null}
          />

          <Text style={styles.helper}>{selectedPreset.helper}</Text>

          {isOauth ? (
            <Pressable
              accessibilityRole="button"
              disabled={linking != null}
              onPress={() => {
                void onLinkOauth();
              }}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
                linking != null && styles.buttonDisabled,
              ]}
            >
              {linking != null ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {provider === 'gmail' ? 'Sign in with Google' : 'Sign in with Microsoft'}
                </Text>
              )}
            </Pressable>
          ) : (
            <>
              <Text style={styles.label}>Email address</Text>
              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!adding}
                style={[styles.input, errors.address ? styles.inputError : undefined]}
              />
              {errors.address ? <Text style={styles.fieldError}>{errors.address}</Text> : null}

              <Text style={styles.label}>{selectedPreset.passwordLabel ?? 'Password'}</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={selectedPreset.passwordLabel ?? 'Password'}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                editable={!adding}
                style={[styles.input, errors.password ? styles.inputError : undefined]}
              />
              {errors.password ? <Text style={styles.fieldError}>{errors.password}</Text> : null}

              <Text style={styles.label}>IMAP host</Text>
              <TextInput
                value={host}
                onChangeText={setHost}
                placeholder="imap.example.com"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!adding}
                style={[styles.input, errors.host ? styles.inputError : undefined]}
              />
              {errors.host ? <Text style={styles.fieldError}>{errors.host}</Text> : null}

              <Text style={styles.label}>Port</Text>
              <TextInput
                value={port}
                onChangeText={setPort}
                placeholder="993"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={5}
                editable={!adding}
                style={[styles.input, errors.port ? styles.inputError : undefined]}
              />
              {errors.port ? <Text style={styles.fieldError}>{errors.port}</Text> : null}

              <Pressable
                accessibilityRole="button"
                disabled={adding}
                onPress={() => {
                  void onAddAccount();
                }}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.primaryButtonPressed,
                  adding && styles.buttonDisabled,
                ]}
              >
                {adding ? (
                  <ActivityIndicator color={colors.surface} />
                ) : (
                  <Text style={styles.primaryButtonText}>Add account</Text>
                )}
              </Pressable>
            </>
          )}
        </View>
```

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck --workspace @gstflow/mobile`
Expected: no errors. In particular no "unused variable" or missing-import errors.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/src/screens/Email/EmailSettingsScreen.tsx
git commit -m "feat(mobile): add email provider picker with OAuth + IMAP presets"
```

---

### Task 4: Full mobile verification

**Files:** none.

- [ ] **Step 1: Run the full typecheck**

Run: `npm run typecheck --workspace @gstflow/mobile`
Expected: no errors.

- [ ] **Step 2: Run the mobile test suite**

Run: `npm run test --workspace @gstflow/mobile`
Expected: PASS, including the 5 catalog tests. (`--passWithNoTests` is set, so any failure is a real regression.)

- [ ] **Step 3: Manual device QA checklist**

On an Android device/emulator with the app installed:

1. Open Email settings. Confirm the default chip is **Other / manual** with empty host and port 993.
2. Select **Zoho Mail** → host `imap.zoho.com`, port `993`, password label "App password", helper mentions `imappro` and `imap.zoho.in`.
3. Select **GoDaddy email** → host `imap.secureserver.net`, port 993.
4. Select **Hostinger email** → host `imap.hostinger.com`, port 993.
5. Edit a prefilled host and confirm it is not reset until you change chips.
6. Add an IMAP account and confirm it appears under "Linked accounts".
7. Select **Gmail** → address/password/host/port are hidden; a "Sign in with Google" button shows. Press it. Without Google credentials, confirm a friendly notice appears (or the sign-in screen opens); cancel it and confirm "Sign-in was cancelled."
8. Select **Outlook / Microsoft 365** → "Sign in with Microsoft" button; same cancellation check.
9. Confirm the password field is empty after any submit attempt.

- [ ] **Step 4: Record the outcome**

Note the QA result in the commit for the final task or in the PR description. No file changes required.

---

## Deployment note (out of scope for this plan)

This is a JS-only change with no native/Kotlin edits, so no Gradle work is required to implement it. To make the change visible to installed apps, the release APK must be rebuilt and republished later using the documented flow (`:app:assembleRelease -PapiBaseUrl=...` → copy to `apps/web/public/gstflow-client*.apk` → rsync). Real Gmail/Outlook linking additionally requires the Google Cloud OAuth client and Azure app registration noted in the spec.
