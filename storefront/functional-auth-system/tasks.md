# Implementation Plan — Functional Authentication System Fix

- [X] 1. Policy Gate: Passkey-First with Guaranteed First-Time Combo-MFA

  - Add a server util to decide flow based on presence of passkeys for the identifier (Adapter DB/KV lookup by `customer.id` or pre-session identifier mapping).
  - At login start: attempt passkey if any credentials exist; else set `comboRequired=true`.
  - On passkey failure/unavailable: immediately show Combo-MFA modal.

- [X] 2. Combo-MFA Flow Hardening (OTP + Magic Link)

  - Ensure `/api/auth/otp/send` and `/api/auth/magic/send` apply rate limits and return opaque success.
  - Verify `/api/auth/otp/verify` and `/api/auth/magic/confirm` set `otpOK` and `magicOK` respectively in session state.
  - Implement `/api/auth/session/elevate` to require both flags (or passkey success) → sets `mfaComplete=true`.

- [X] 3. Post-Elevation Passkey Registration Prompt

  - After elevation, trigger a UI prompt to register a passkey if none exists for this device.
  - Implement `/api/auth/passkeys/register/start` and `/api/auth/passkeys/register/finish` (reuse existing register logic where available).
  - Persist credentials with `customer.id`; expose `/api/account/passkeys` list/delete if not already present.

- [X] 4. Session and Bridge Tokens

  - Maintain session fields: `comboRequired`, `otpOK`, `magicOK`, `mfaComplete`.
  - Ensure RS256 bridge tokens include these claims and `sub=customer.id`; keep `exp≈15m`.
  - Confirm backend middleware honors `mfaComplete=true` for protected account routes.

- [X] 5. UI Wiring on `/login`

  - Attempt passkey silently on load if credentials exist; show progress/fallback state.
  - ComboMFA modal: clear steps, resend controls, error mapping.
  - Post-login: display passkey registration prompt upon first elevation.

- [X] 6. Customer Ensure/Link

  - On elevation success, call `/api/account/customer/ensure` to guarantee a Medusa customer (`customer.id`).
  - Cache `customer.id` in session server-side to reduce future lookups.

- [X] 7. Observability and Diagnostics

  - Add metrics and structured logs for passkey attempts, OTP/Magic sends/verifications, elevation, and registration outcomes.
  - Include correlation ids (`jti`) in logs where applicable.

- [ ] 8. Manual Test Scenarios

  - First-time login requires OTP+Magic; passkey prompt shown; passkey registration succeeds.
  - Returning login uses passkey only; fallback path works if passkey unavailable.
  - Error cases: expired OTP, invalid magic token, passkey cancel → fallback; rate limit enforcement.

- [ ] 9. Env and Secrets

  - Storefront: `AUTH_SIGNING_JWK`, `AUTH_ISSUER`, `AUTH_AUDIENCE`.
  - Backend: `AUTH_JWKS_URL` configured to storefront JWKS.
  - Providers: WhatsApp and mailer credentials; enable dev fallbacks.


