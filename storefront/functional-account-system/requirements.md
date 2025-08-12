# Requirements — Functional Account System

## Introduction

Build a complete account system where Medusa `customers` are the canonical user records and NextAuth manages identity/session. Support login by email, phone, or both. Enforce passkey-first auth and require combo-MFA (OTP + Magic Link) when passkey is not recognized. Provide account features through server-side proxies to Medusa using short-lived RS256 bridge tokens bound to the Medusa `customer.id`.

## Functional Requirements

### R1: Canonical Identity (Medusa Customer)

- User Story: As a user, I want my account to be represented centrally so that my profile and orders are consistent.
- Acceptance Criteria:
  1. WHEN a user signs in with email and/or phone THEN the system SHALL ensure a corresponding Medusa customer exists (create if missing) and return its `id`.
  2. WHEN both email and phone are provided THEN the system SHALL link them to the same customer record.
  3. WHEN a phone login later provides an email already used by another customer THEN the system SHALL reject with `email_already_exists` and preserve the original mapping.
  4. WHEN phone-only users are created THEN the system SHALL store the phone number (e.g., in `metadata.phone`) without requiring email.

### R2: Passkey-first with Combo-MFA Fallback

- User Story: As a user, I want the fastest and most secure login with passkey, and a reliable fallback when passkey is not available.
- Acceptance Criteria:
  1. WHEN a passkey is recognized and verified for the identifier THEN the system SHALL mark `comboRequired=false` and proceed without OTP/Magic.
  2. WHEN a passkey is not recognized or unavailable THEN the system SHALL require both OTP (WhatsApp) and Magic Link (email) to complete login.
  3. WHEN OTP or Magic fails or expires THEN the system SHALL clearly indicate the error with guidance to retry.

### R3: Session and Elevation

- User Story: As a user, I expect sensitive actions to be protected without re-authenticating too often during development.
- Acceptance Criteria:
  1. WHEN a user completes passkey or combo-MFA THEN the system SHALL issue a NextAuth session (15m) and record elevation state (`mfaComplete=true`).
  2. WHEN making account API requests THEN the system SHALL mint a short-lived RS256 bridge token with `sub=customer.id` and `mfaComplete=true` when elevated.
  3. WHEN the backend receives requests to `/store/customers*` or `/store/addresses*` THEN it SHALL require valid RS256 JWT (via JWKS) and `mfaComplete=true`.

### R4: JWKS and Token Bridging

- User Story: As the system, I need to securely trust the storefront’s tokens.
- Acceptance Criteria:
  1. WHEN the storefront is deployed THEN it SHALL expose a public JWKS at `/.well-known/jwks.json` that corresponds to the signing JWK used to create bridge tokens.
  2. WHEN Medusa verifies a token THEN it SHALL use the JWKS URL and respect `iss`, `aud`, and `exp` claims.
  3. WHEN tokens are minted THEN they SHALL use RS256 with `kid` header matching the JWKS key id.

### R5: Account Features (via Server Proxies)

- User Story: As an authenticated user, I want to view/update my profile, manage addresses, view orders, and manage passkeys.
- Acceptance Criteria:
  1. WHEN requesting profile (GET) THEN the system SHALL fetch and return Medusa customer data corresponding to the session’s `customer.id`.
  2. WHEN updating profile (PATCH) THEN the system SHALL apply changes to the Medusa customer; duplicate emails SHALL be rejected with `email_already_exists`.
  3. WHEN listing addresses THEN the system SHALL return all addresses tied to the customer.
  4. WHEN creating/updating/deleting an address THEN the system SHALL persist the change via Medusa store endpoints.
  5. WHEN listing orders THEN the system SHALL return orders belonging to the customer.
  6. WHEN managing passkeys THEN the system SHALL list registered credentials and allow removal; registration SHALL reuse the existing passkey register flows.

### R6: Routing and UX

- User Story: As a user, I should be directed appropriately based on auth state.
- Acceptance Criteria:
  1. WHEN a user visits `/account` unauthenticated THEN the system SHALL redirect to `/login`.
  2. WHEN a user signs in THEN the system SHALL redirect to `/account`.
  3. WHEN errors occur on account actions THEN the system SHALL show accessible error messages and allow retries.

## Non-Functional Requirements

### NFR1: Security

- RS256 with server-only private JWK; JWKS is public.
- Admin API key is server-only; never exposed to client.
- Bridge tokens are minted per-request (or short-lived) and only used server-to-server.

### NFR2: Performance and Reliability

- Use existing retry/backoff and observability.
- Cache the ensured `customer.id` in the session (server) to reduce upserts/searches.

### NFR3: Operability

- No additional compliance/deletion/export required now.
- Rate limits/notifications remain as implemented for OTP/Magic.

## Open Questions (to revisit later)

- Should we implement a device/session dashboard beyond passkeys?
- Should we introduce rolling sessions and longer lifetimes later (e.g., 30 days)?
- Should passkey trust be per-device with explicit naming/metadata for display?


