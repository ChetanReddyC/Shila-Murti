# Manual Test Scenarios — Functional Account System

This guide enumerates end-to-end test scenarios to verify the Functional Account System. Follow each scenario step-by-step. Record outcomes and any console/network logs when failures occur.

## Prerequisites

- Backend (Medusa v2) running locally with store + admin:
  - `MEDUSA_BASE_URL` (default `http://localhost:9000`)
  - Admin token configured in storefront: `MEDUSA_ADMIN_TOKEN`
- Storefront running locally:
  - `NEXT_PUBLIC_MEDUSA_API_BASE_URL` (same base URL as backend)
  - `NEXT_PUBLIC_URL` (default `http://localhost:3000`)
  - RS256 signing key configured: `AUTH_SIGNING_JWK` (with `kid`)
  - `AUTH_ISSUER` (e.g., `storefront`), `AUTH_AUDIENCE` (e.g., `medusa`)
- WhatsApp/mailer optional (for OTP/Magic). Dev fallbacks are acceptable for manual testing.

Verify:
- `GET /.well-known/jwks.json` returns a JWKS (at least an empty keys array; populated when `AUTH_SIGNING_JWK` set)
- Backend `AUTH_JWKS_URL` points to the storefront JWKS (e.g., `http://localhost:3000/.well-known/jwks.json`).

---

## Scenario 1: Passkey recognized (passkey-first)

Goal: When a known passkey is recognized, the user is authenticated without combo-MFA and can access account endpoints.

Steps:
1) Navigate to `/` → `Login` → `/login`.
2) Register a passkey first (one-time):
   - On the login page, after any session or in demo, click “Set up passkey on this device”.
   - Confirm platform prompt. Expect success banner “Passkey registered on this device.”
3) Sign out if needed; return to `/login`.
4) Enter identifier (email or phone) associated with the passkey.
5) Submit. Device prompts for passkey. Approve.
6) On success: Expect status “Authenticated with passkey.” and redirect to `/account`.
7) Confirm account proxies:
   - Call `GET /api/account/profile?customer_id=<id>`
   - Expect `200` with customer data. (Use Network tab; token never exposed.)

Expected:
- No combo-MFA modal appears.
- `/account` loads; profile API returns `200`.

---

## Scenario 2: Combo-MFA success (OTP + Magic)

Goal: When passkey is unavailable/unrecognized, require both OTP and Magic Link; on success, session is elevated and account accessible.

Steps:
1) Open `/login`.
2) Enter identifier where no passkey exists. Submit.
3) Combo-MFA modal appears.
4) OTP:
   - Click “Send OTP” (auto-triggered). Check status “OTP sent via WhatsApp”.
   - Retrieve OTP (dev: see server logs or KV list, or use test OTP `123456` if enabled in env).
   - Submit OTP → expect “OTP verified”.
5) Magic Link:
   - If email provided initially, link is sent; otherwise input email and send.
   - Click the received magic link (dev email provider or console URL), which calls `/api/auth/magic/confirm`.
   - Modal should auto-detect verification (polling) and show “Email link verified”.
6) After both factors, modal calls `/api/auth/session/elevate` and binds `customerId`; expect redirect to `/` or `/account`.
7) Confirm profile proxy now works (same as Scenario 1 step 7).

Expected:
- Both OTP and Magic are required; errors are clearly shown if code/token invalid.
- Elevation returns `{ ok: true, customerId }` and subsequent requests succeed.

---

## Scenario 3: Phone-only login creates customer; later add unique email

Goal: Support phone-only accounts; later add an email that is not used elsewhere.

Steps:
1) In `/login`, enter phone only (no email in modal).
2) Complete combo-MFA with OTP and Magic (provide email at this time for Magic delivery if desired).
3) After success, call `POST /api/account/customer/ensure` with `{ phone: "+1 555 000 0000" }` (or inspect the elevation response which includes `customerId`).
4) In `/account` → Account Details, update email to a new unique email; save (PATCH via proxies).
5) Verify `GET /api/account/profile?customer_id=<id>` shows updated email.

Expected:
- A Medusa customer exists with `metadata.phone` set.
- Email update succeeds (no conflict).

---

## Scenario 4: Email conflict on phone-only → add existing email

Goal: Prevent linking when the provided email belongs to another customer.

Steps:
1) Ensure an unrelated Medusa customer exists with `email = X` (via admin or script).
2) Login with phone-only account (as in Scenario 3) and attempt to set `email = X` via `/api/account/customer/ensure` or `/api/account/profile`.

Expected:
- `POST /api/account/customer/ensure` responds `409` with `{ error: "email_already_exists" }`.
- UI shows a friendly error; no link occurs.

---

## Scenario 5: Address Book CRUD

Goal: Verify address management through server proxies using bridge tokens.

Steps (assumes `customerId` known):
- List: `GET /api/account/addresses?customer_id=<id>` → expect `200` with addresses.
- Create: `POST /api/account/addresses?customer_id=<id>` with JSON body `{ first_name, last_name, address_1, city, postal_code, country_code }` → expect `200/201`.
- Update: `PATCH /api/account/addresses?customer_id=<id>` with body `{ id, ...updates }` → expect `200`.
- Delete: `DELETE /api/account/addresses?customer_id=<id>` with body `{ id }` → expect `200`.

Expected:
- Each operation succeeds and reflects in subsequent `GET`.

---

## Scenario 6: Orders list

Goal: Ensure orders for the current customer are retrievable.

Steps:
1) Complete a checkout flow (use existing functional checkout system) to create an order.
2) `GET /api/account/orders?customer_id=<id>` → expect `200` with at least one order.

Expected:
- Orders array contains the newly created order with items, totals, and shipping details.

---

## Scenario 7: Passkey management

Goal: Register and remove passkeys via the Security tab and API.

Steps:
1) Navigate to `/account` → “Security” tab.
2) Click “Set up passkey on this device”. Approve platform prompt.
3) Ensure `GET /api/account/passkeys?customer_id=<id>` shows the new credential.
4) Click “Remove” on a credential. Expect `DELETE /api/account/passkeys` to return `{ ok: true }`.
5) Refresh list; credential disappears.

Expected:
- Registration and removal work; list reflects current state.

---

## Observability and Diagnostics

- Metrics (storefront): verify counters/histograms increase after actions
  - `account_ensure_success_total`, `account_ensure_failure_total`, `account_ensure_latency_ms`
  - `account_profile_latency_ms`, `account_profile_failure_total`
  - `account_addresses_latency_ms`, `account_addresses_failure_total`
  - `account_orders_latency_ms`, `account_orders_failure_total`
- OTP/Magic diagnostics visible in server logs as implemented in `/api/auth/*` routes.

---

## Troubleshooting Tips

- JWKS shows empty keys → ensure `AUTH_SIGNING_JWK` is set and valid (RS256). Refresh route.
- Medusa store calls 401/403 → ensure backend is configured with `AUTH_JWKS_URL` and tokens include `mfaComplete: true`.
- `email_already_exists` on linking → choose a different email or merge accounts via admin.
- OTP delivery issues → check rate limits and provider configuration; in dev, OTP may be `123456` if enabled.


