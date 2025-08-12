# Design Document — Functional Account System

## Overview

This feature delivers a production-grade account system built on top of the existing authentication building blocks (Passkey-first login, WhatsApp OTP, and Magic Link). The canonical user record lives in Medusa (`customers`), while NextAuth manages identity/session. We automatically link identities when both email and phone are provided. If a phone-only login later provides an email already used by another account, the system refuses the link with a clear "email already exists" error.

Authentication emphasizes Passkey-first; if a passkey is unavailable or unrecognized, the user must complete combo-MFA (both OTP + Magic Link). We mint RS256 JWTs (bridge tokens) with `sub = medusaCustomerId` and claims like `mfaComplete` to call Medusa store endpoints that we guard in the backend via JWKS.

Session policy during development uses a 15-minute lifetime, with the concept of “elevated” sessions (combo-MFA satisfied or passkey recognized). Elevated state is reflected in the bridge token’s claims and required for sensitive account actions (profile/addresses). We do not force re-MFA for additional scenarios yet.

## Goals

- Medusa is the source of truth for customer profiles; NextAuth for identity/session.
- Support email, phone, or both as identifiers; auto-link when both are present.
- Passkey-first login; fallback requires OTP + Magic link (combo-MFA) when passkey not recognized.
- Strong session integrity: short-lived sessions/tokens, elevation for sensitive actions.
- Server-side proxy to Medusa for account features without exposing tokens to the browser.
- Account features: profile view/update, address book CRUD, order history, passkey management (add/remove device credentials).

## Non-Goals (for now)

- Payment methods vaulting or card management.
- Data export, account deletion, or compliance workflows.
- Complex device/session dashboard beyond basic passkey management.

## Architecture

### High-level

```
Next.js (storefront)
└─ NextAuth (session) + Adapter DB (optional now, allowed later)
   ├─ Providers: passkey-first (+ combo-MFA via OTP + Magic)
   ├─ JWKS publication: /.well-known/jwks.json (public)
   ├─ Bridge token mint (RS256): sub=Medusa customer id, mfaComplete flag
   └─ Server proxy routes: /api/account/* → calls Medusa with Bearer bridge token

Medusa (backend)
└─ Store endpoints guarded where needed (/store/customers*, /store/addresses*) via middleware that verifies RS256 JWT via JWKS
   └─ Admin key used only in secure server routes to upsert/search customers
```

### Identity and Canonical User

- Canonical user: Medusa `customer` record. NextAuth tracks identity/session.
- Identifiers:
  - Email-only: search Medusa by email; upsert if not found.
  - Phone-only: search by phone; upsert if not found. If Medusa doesn’t natively support `phone`, store in `metadata.phone`.
  - Both provided: link to the same Medusa customer (auto-merge semantics). If the provided email belongs to another customer, reject with "email already exists".

### Passkey-first and Combo-MFA

- Attempt platform passkey auth. If recognized and verified for the identifier, we set `comboRequired=false` and proceed.
- If passkey unavailable or unrecognized, require both OTP (WhatsApp) and Magic Link (email) before session elevation.
- Success of combo-MFA leads to session elevation (`mfaComplete=true` in the bridge token). The NextAuth session itself remains 15 minutes.

### JWT Bridge and JWKS

- Sign RS256 JWTs server-side with a private JWK (`AUTH_SIGNING_JWK`).
- Expose a JWKS at `/.well-known/jwks.json` for the Medusa backend to verify tokens.
- Claims:
  - `sub`: string — Medusa `customer.id` (canonical identity)
  - `comboRequired`: boolean — whether combo-MFA was required in this session
  - `otpOK`: boolean — OTP factor satisfied
  - `magicOK`: boolean — Magic factor satisfied
  - `mfaComplete`: boolean — elevated session achieved (true if passkey recognized OR both OTP and Magic completed)
  - Standard fields: `iat`, `exp` (15m), `jti`

### Customer Upsert and Linking (Server-only)

- Server routes (protected by environment secrets) use the Medusa Admin API key to:
  1) Search for existing customers by email and/or phone (`metadata.phone` fallback).
  2) Create a new customer when none found.
  3) Link email/phone to a single customer when both provided.
  4) Reject linking if the provided email belongs to another customer.

Pseudocode:

```ts
// ensureCustomer({ email?, phone? })
const existingByEmail = email ? findCustomerByEmail(email) : null
const existingByPhone = phone ? findCustomerByPhone(phone) : null // metadata.phone fallback

if (existingByEmail && existingByPhone && existingByEmail.id !== existingByPhone.id) {
  // Email already belongs to a different account
  throw new Error('email_already_exists')
}

const customer = existingByEmail || existingByPhone || createCustomer({ email, metadata: { phone } })

// Backfill missing identifiers if safe
if (!customer.email && email) updateCustomer(customer.id, { email })
if (!customer.metadata?.phone && phone) updateCustomer(customer.id, { metadata: { phone } })

return customer.id
```

### Server Proxies for Account Features

To avoid exposing tokens in the browser, the client talks only to Next.js API routes. The server obtains the NextAuth session, mints a short-lived RS256 bridge token (with `sub=customer.id`), then calls Medusa store endpoints with `Authorization: Bearer <token>`.

- `/api/account/profile` (GET/PATCH)
- `/api/account/addresses` (GET/POST/PATCH/DELETE)
- `/api/account/orders` (GET)
- `/api/account/passkeys` (GET/DELETE)

### Component Structure

```
AuthSessionProvider (NextAuth SessionProvider)
└── AccountPage (/account)
    ├── ProfileTab (view/edit name, email, phone — email unique constraint enforced)
    ├── AddressBookTab (CRUD via server proxies)
    ├── OrdersTab (list user’s orders)
    └── SecurityTab
        ├── PasskeyList (list/remove device credentials via KV or Adapter DB)
        └── PasskeyRegister (reuses existing register flow)
```

### Data Flow — Login and Elevation

1) User submits identifier (email/phone)
2) Passkey attempt:
   - If verified and recognized → `comboRequired=false`
   - Else show Combo-MFA modal
3) Combo-MFA:
   - `/api/auth/otp/send` → WhatsApp OTP
   - `/api/auth/magic/send` → Magic link
   - `/api/auth/otp/verify` → sets OTP OK
   - `/api/auth/magic/confirm` → sets Magic OK
4) Elevation:
   - `/api/auth/session/elevate` (acknowledge factors)
   - `signIn('session', { identifier })` to bind session to identity
5) Ensure Medusa customer:
   - `/api/account/customer/ensure` (server-only; Admin API key) → returns `customer.id`
6) Bridge token mint:
   - `/api/account/token` (server-only) → RS256 JWT with `sub=customer.id`, `mfaComplete`
7) Use server proxies for account features, which call Medusa with Bearer

### Session and Elevation Policy

- NextAuth session maxAge: 15 minutes (development).
- Elevated status means `mfaComplete=true` at the time of the request. For now, we treat elevation as true immediately after passkey verification or after both OTP + Magic succeed. Sensitive account endpoints require `mfaComplete=true` (enforced in backend middleware).

### Error Handling

- Duplicate email protection: if a new email belongs to another customer, return `email_already_exists` and block the update/linking.
- Network/Medusa errors are normalized with friendly messages and retriable guidance.
- OTP/Magic expirations handled by existing TTLs and KV cleanup paths.

### Performance and Resilience

- Reuse metrics counters/histograms for auth/account events.
- Keep tokens short-lived and server-proxied to reduce exposure.
- Cache customer id in session server-side where possible to avoid repeated ensure calls.

### Security Considerations

- Private JWK is server-only; public JWKS is published for verification by Medusa.
- Bridge tokens aren’t exposed to the client; only server proxies use them when calling Medusa.
- Admin API key for Medusa is never exposed to client; used only in server routes.

### Testing Scope (Manual)

- Passkey success → no combo-MFA; account tabs accessible.
- Combo-MFA success → account tabs accessible.
- Phone-only login creates a Medusa customer without email; later adding an email that exists on another account yields an error.
- Profile update success/failure cases (validation, duplicate email).
- Address CRUD flows.
- Orders list matches backend for the `customer.id`.
- Passkey register/list/remove flows work end-to-end.


