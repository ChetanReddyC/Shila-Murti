# Design Document — Functional Authentication System Fix

## Overview

This design enforces a consistent, passkey-first authentication model with a guaranteed combo-MFA on first-time login. After successful first-time verification (OTP + Magic Link), the system prompts the user to register a passkey for the current device. Subsequent logins attempt passkey authentication first and fall back to combo-MFA when passkeys are unavailable or unrecognized.

## Architecture

### High-level

```
Next.js (storefront)
└─ NextAuth (session) + Adapter DB / KV (passkey credentials)
   ├─ Auth routes: /api/auth/* (otp, magic, elevate, passkey register/list/remove)
   ├─ JWKS publication: /.well-known/jwks.json
   ├─ Bridge token mint (RS256): sub=customer.id, claims: comboRequired, otpOK, magicOK, mfaComplete
   └─ Account proxies: /api/account/* (unchanged; require mfaComplete=true)

Medusa (backend)
└─ Store endpoints protected by middleware that verifies RS256 JWT via storefront JWKS
```

## Identity and Passkey Strategy

- Canonical user: Medusa `customer` record. NextAuth manages identity/session.
- Passkey records are stored by `customer.id` in Adapter DB/KV.
- First-time login (no passkeys for the identifier): enforce combo-MFA; after elevation, prompt passkey registration.
- Returning login: attempt passkey auth; fallback to OTP + Magic Link if passkey fails/unavailable.

## Session Model and Claims

- Tokens are signed server-side with private JWK (`AUTH_SIGNING_JWK`).
- JWKS at `/.well-known/jwks.json` for backend verification.
- Claims in bridge tokens:
  - `sub`: string — Medusa `customer.id`
  - `comboRequired`: boolean — true if this session required combo-MFA
  - `otpOK`: boolean — OTP satisfied
  - `magicOK`: boolean — Magic Link satisfied
  - `mfaComplete`: boolean — passkey success OR both factors complete
  - Standard: `iat`, `exp` (15m), `jti`

## Flow Details

### Login Attempt

1) User submits identifier (email and/or phone).
2) Determine passkey availability for the identifier:
   - If passkey exists → attempt platform WebAuthn authentication.
   - If success → sign-in, set `mfaComplete=true`, `comboRequired=false`.
   - If unavailable/fails → set `comboRequired=true` and continue to combo-MFA.

### Combo-MFA (OTP + Magic Link)

1) OTP: `/api/auth/otp/send` → send WhatsApp OTP; `/api/auth/otp/verify` → set `otpOK=true`.
2) Magic: `/api/auth/magic/send` → send email link; `/api/auth/magic/confirm` → set `magicOK=true`.
3) Elevation: `/api/auth/session/elevate` → `mfaComplete=true` when both factors verified; binds identity to session.
4) After elevation, ensure Medusa customer exists and retrieve `customer.id`.

### Passkey Registration Prompt

Immediately after first-time elevation, the UI prompts to register a passkey:

- Call `/api/auth/passkeys/register/start` → server generates options
- Browser `navigator.credentials.create`
- Call `/api/auth/passkeys/register/finish` → persist credential bound to `customer.id`
- On success, show confirmation and proceed to `/account`

### Subsequent Logins

- Attempt passkey-first using stored credentials. If not possible or user cancels, present combo-MFA as fallback. On success, optionally prompt to register passkey for current device if none exists for it.

## Components and UI

```
LoginPage (/login)
├── PasskeyAttemptBanner (shows passkey attempt state and failure fallback)
├── ComboMfaModal (OTP + Magic; appears when passkey unavailable/fails)
└── PostLoginPasskeyPrompt (appears after first-time elevation)

AccountPage (/account)
└── SecurityTab
    ├── PasskeyList (list/remove credentials)
    └── PasskeyRegister (register new device)
```

## Server Routes (expected)

- `/api/auth/otp/send`, `/api/auth/otp/verify`
- `/api/auth/magic/send`, `/api/auth/magic/confirm`
- `/api/auth/session/elevate`
- `/api/auth/passkeys/register/start`, `/api/auth/passkeys/register/finish`
- `/api/account/customer/ensure` (existing)
- `/.well-known/jwks.json` (existing)

## Error Handling

- Normalize OTP errors (expired/invalid), Magic Link errors (expired/used/invalid), passkey errors (not allowed, timeouts).
- Provide retry actions; allow resending OTP and Magic Link with cooldowns.
- If passkey fails, immediately show fallback without dead-ends.

## Observability

- Metrics and logs:
  - `auth_passkey_attempt_total`, `auth_passkey_success_total`, `auth_passkey_failure_total`
  - `auth_otp_sent_total`, `auth_otp_verify_success_total`, `auth_otp_verify_failure_total`
  - `auth_magic_sent_total`, `auth_magic_confirm_success_total`, `auth_magic_confirm_failure_total`
  - `auth_elevation_success_total`, `auth_elevation_failure_total`

## Security Considerations

- Private JWK never leaves server. Bridge tokens only used server-to-server.
- Email uniqueness and phone linking remain governed by server ensure/link logic.
- Rate limit OTP/Magic sends; device-bound WebAuthn challenges are origin-scoped.

## Testing Scope (Manual)

- First-time login requires OTP + Magic, then shows passkey registration prompt.
- Returning login succeeds with passkey-only when available.
- Fallback to combo-MFA works cleanly when passkey unavailable or user cancels.
- Passkey registration succeeds and appears in Security tab; removal works.


