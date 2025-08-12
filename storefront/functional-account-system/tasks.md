# Implementation Plan — Functional Account System

- [X] 1. JWKS Publication and RS256 Bridge Token Minting

  - Add `/.well-known/jwks.json` endpoint that serves the public JWKS derived from `AUTH_SIGNING_JWK` (server-only private JWK, RS256, with `kid`).
  - Implement a server util to mint bridge tokens:
    - Claims: `sub=medusaCustomerId`, `comboRequired`, `otpOK`, `magicOK`, `mfaComplete`, `iat`, `exp` (~15m), `jti`.
    - Headers: `alg=RS256`, `kid` matching JWKS.
  - Configure backend (`AUTH_JWKS_URL`, `AUTH_ISSUER`, `AUTH_AUDIENCE`) to verify tokens. Confirm backend middleware already checks `/store/customers*` and `/store/addresses*`.

- [X] 2. Customer Ensure/Link Server Route (Admin API Key)

  - Create `POST /api/account/customer/ensure`:
    - Input: `{ email?: string, phone?: string }` (at least one required).
    - Uses Medusa Admin API key (server-side) to:
      1) Find by email (exact) and by phone (via `metadata.phone` fallback).
      2) Resolve identity: if both exist and different → error `email_already_exists`.
      3) Create when none exists (email optional; store `metadata.phone` if provided).
      4) Backfill missing email/phone when safe.
    - Returns `{ customerId }`.
  - Cache `customerId` on session server-side (if adapter present) to reduce calls.

- [X] 3. Account Server Proxies (Bearer via Bridge Token)

  - Profile: `/api/account/profile` (GET/PATCH)
    - GET: Mint bridge token → GET Medusa `/store/customers/me` (or equivalent) using Bearer.
    - PATCH: Validate inputs; enforce duplicate email check by pre-search; PATCH Medusa customer.
  - Addresses: `/api/account/addresses` (GET/POST/PATCH/DELETE)
    - Map to corresponding Medusa endpoints with Bearer.
  - Orders: `/api/account/orders` (GET)
    - List orders for the current `customer.id` via Medusa store API.
  - Passkeys: `/api/account/passkeys` (GET/DELETE)
    - GET: List stored credentials for the current user (KV or Adapter DB, by `customer.id`).
    - DELETE: Remove a stored credential record; ensure it belongs to `customer.id`.

- [X] 4. NextAuth Session Wiring and Elevation

  - Keep `session.maxAge = 15 * 60`.
  - Ensure combo-MFA state (`otpOK`, `magicOK`, `mfaComplete`) is reflected on the session token.
  - After elevation (combo-MFA success or recognized passkey), call `customer/ensure` to guarantee a Medusa customer, then continue to `/account`.

- [X] 5. Protect and Enhance `/account`

  - Protect `/account` route: unauthenticated → redirect to `/login`.
  - Replace static `accountPage.tsx` with tabbed UI backed by server proxies:
    - ProfileTab: load + update profile; handle `email_already_exists`.
    - AddressBookTab: list, add, edit, delete addresses.
    - OrdersTab: list orders (basic summary).
    - SecurityTab: list passkeys (from KV/DB) and register new via existing `SetupPasskeyButton` flow; add ability to remove a credential.

- [X] 6. Medusa API Client (if needed)

  - If using direct calls to Medusa from server proxies, a minimal server-side helper with Bearer injection suffices; otherwise reuse the existing client with an option to set `Authorization` header.

- [X] 7. Observability and Errors

  - Add counters/histograms for key events: ensure customer success/failure, profile update, address CRUD, orders list.
  - Normalize errors to user-friendly messages in UI (duplicate email, validation, rate limits, network).

- [ ] 8. Manual Test Scenarios

  - Passkey recognized → `/account` accessible; profile/addresses/orders load.
  - Combo-MFA success → `/account` accessible.
  - Phone-only login; later add new unique email → success.
  - Phone-only login; later add existing email from another account → `email_already_exists`.
  - Address create/update/delete; Orders list populated.
  - Passkey register; passkey list shows device; remove device.

- [ ] 9. Env and Secrets

  - Storefront: `AUTH_SIGNING_JWK`, `AUTH_ISSUER`, `AUTH_AUDIENCE`.
  - Backend: `AUTH_JWKS_URL` → `http://localhost:3000/.well-known/jwks.json` (dev), or deployed URL.
  - Medusa Admin API key in storefront server env for customer ensure/link endpoints.


