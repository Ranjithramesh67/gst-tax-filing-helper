# GSTFlow Client (Mobile)

React Native (bare, Android-first) app used by taxpayers/clients. With explicit
consent and OTP phone verification, it reads only GST/tax-related SMS in the
background and forwards the matched messages to the GSTFlow backend for the
client's CA firm to review.

## Requirements

- Node.js >= 20 (npm workspaces monorepo)
- Android Studio + Android SDK for a dev build
- JDK 17

## Install (from the monorepo root)

```
npm install
```

Do not run `npm install` inside `apps/mobile`; dependencies are hoisted by the
workspace.

## Run

```
npm run start --workspace @gstflow/mobile
npm run android --workspace @gstflow/mobile
```

Typecheck and tests:

```
npm run typecheck --workspace @gstflow/mobile
npm run test --workspace @gstflow/mobile
```

## Backend URL

`src/config.ts` points the API client at `http://10.0.2.2:4000/v1`, the Android
emulator loopback alias for the host machine. Change `API_BASE_URL` for a
physical device or a deployed backend.

## Consent and OTP flow

1. `ConsentScreen` shows the versioned consent text (`CONSENT_VERSION`,
   currently `2026-10-04`). Nothing is collected until the user taps accept.
2. `OtpScreen` requests an OTP for `CLIENT_ONBOARDING`, then verifies it together
   with a stable, per-install `androidId` and the device info. In development the
   API returns `devCode`, which is displayed on screen.
3. On success the session (`accessToken`, `refreshToken`, `client`) is persisted
   in AsyncStorage under `gstflow.mobile.auth` and the app switches to the
   Home / SMS Log / Settings stack.

## Android SMS reading

Reading SMS in the background requires a **custom dev build** of the app, not a
preview/Expo Go build, because it needs native permissions and a foreground
service. At runtime the app must request and be granted `READ_SMS` /
`RECEIVE_SMS` (via `react-native-permissions`) plus the foreground service
permission. If the permission is denied, the app runs normally but cannot
collect messages. The consent gate must be accepted before any permission prompt
or collection begins.

## Battery saver and background reliability

Android defers background work for apps that are not battery-optimization
exempt, which can delay or drop forwarding of a captured GST SMS / OTP when the
screen is off or power saver is on. The app handles this in three layers:

1. **Exemption prompt** - the Home and Settings screens show a "Background
   reliability" card with the current state and an *Allow background access*
   button that opens the system dialog
   (`ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`,
   `SmsReader.requestIgnoreBatteryOptimizations`).
2. **OEM autostart** - on manufacturers that kill background apps aggressively
   (Xiaomi, Oppo, Vivo, Huawei, ...), an *Open autostart settings* button opens
   the device's protected-apps screen (`SmsReader.openAutoStartSettings`).
3. **Wake lock** - `SmsForegroundService` holds a short-lived partial wake lock
   while uploading so the ingest request completes even if the device sleeps.

The status re-checks whenever the app returns to the foreground.

## iOS

iOS is not supported for background SMS collection; the platform does not allow
apps to read incoming SMS. An iOS build, if produced, would be a reduced reader
with no SMS ingestion.

## Layout

```
src/
  config.ts                 API base URL, consent version, app version
  theme.ts                  colors/spacing tokens
  lib/
    storage.ts              AsyncStorage helpers (auth, consent, SMS queue, device id)
    api.ts                  GstFlowApi wired to stored tokens
    auth.tsx                AuthProvider / useAuth
    device.ts               stable androidId + device info
  navigation/
    RootNavigator.tsx       native stack + auth/consent gate
  screens/
    Consent/ConsentScreen.tsx
    Otp/OtpScreen.tsx
```
