# Requirements Document — Functional Authentication System Fix

## Introduction

This update fixes inconsistencies in the login/authentication flow and enforces the intended policy:

- First-time login must require combo-MFA: WhatsApp OTP + Gmail Magic Link.
- Immediately after a successful first-time verification, the user is prompted to register a passkey for the current device.
- On subsequent logins, the system is passkey-first. If a usable passkey is available, it is used. If not, it falls back to combo-MFA (OTP + Magic Link).

The solution must be robust, secure, and consistent across browsers and devices.

## Requirements

### Requirement 1: First-Time Login Requires Combo-MFA

**User Story:** As a first-time user, I must verify myself with WhatsApp OTP and a Magic Link before I can access my account, after which I can register a passkey for faster future logins.

#### Acceptance Criteria

1. WHEN the system detects no registered passkey for the identifier THEN the login flow SHALL require both OTP and Magic Link to be verified in the same session before elevation.
2. WHEN both factors are verified THEN the session SHALL be elevated and the user SHALL be prompted to register a passkey for the current device.
3. WHEN the user skips passkey registration THEN the system SHALL continue to allow access but WILL prompt again on future logins until a passkey is registered on at least one device.

### Requirement 2: Returning Login is Passkey-First with Fallback

**User Story:** As a returning user, I want my login to use passkeys first. If unavailable, I still want to be able to log in with OTP + Magic Link.

#### Acceptance Criteria

1. WHEN a returning user initiates login THEN the system SHALL attempt platform passkey authentication first.
2. WHEN passkey authentication succeeds THEN the user SHALL be logged in without requiring OTP or Magic Link.
3. WHEN passkey authentication is unavailable, unrecognized, or fails THEN the system SHALL present the combo-MFA (OTP + Magic Link) flow.
4. WHEN combo-MFA succeeds THEN the user SHALL be logged in and MAY be prompted again to register a passkey on this device if none exists.

### Requirement 3: Session Integrity and Claims

**User Story:** As a system owner, I want strong session integrity signals so that sensitive resources are protected.

#### Acceptance Criteria

1. The elevated session SHALL be represented in server-minted bridge tokens with claims including `mfaComplete`, `otpOK`, `magicOK`, and `comboRequired`.
2. The system SHALL maintain a durable record of registered passkeys per user (e.g., in Adapter DB or KV) and use this to decide passkey-first behavior.
3. Session lifetime SHALL remain short (e.g., 15 minutes in development) with re-elevation required for sensitive operations as needed.

### Requirement 4: UX and Accessibility

**User Story:** As a user, I expect clear steps, progress, and errors during login.

#### Acceptance Criteria

1. The login UI SHALL clearly indicate the current step (passkey attempt, OTP, Magic Link, passkey registration prompt) and show non-blocking progress where appropriate.
2. Errors (expired OTP, invalid code, invalid/used Magic Link, passkey error) SHALL be mapped to concise, actionable messages.
3. The passkey registration prompt SHALL appear immediately after first-time elevation, with clear options to proceed or skip for later.

### Requirement 5: Security and Privacy

**User Story:** As a security stakeholder, I need assurance that secrets and tokens are handled safely.

#### Acceptance Criteria

1. The private signing key (JWK) MUST be server-only; JWKS publication MUST be public and verifiable by the backend.
2. Bridge tokens MUST not be exposed to the browser; only server proxies SHALL use them to call backend Store APIs.
3. WhatsApp and email providers SHALL be configurable; development fallbacks MAY be used with safeguards.

### Requirement 6: Observability and Reliability

**User Story:** As a developer, I need insight into flow health and quick troubleshooting.

#### Acceptance Criteria

1. Key checkpoints SHALL emit metrics and structured logs: passkey attempt, OTP sent/verified, Magic Link sent/confirmed, elevation, passkey registration success/failure.
2. The system SHALL handle transient failures with retries/backoff where safe, and surface user-friendly retry guidance.

### Requirement 7: Compatibility and Backwards Safety

**User Story:** As an operator, I need this fix to integrate with existing account and checkout features without breaking them.

#### Acceptance Criteria

1. Existing account features (profile, addresses, orders, passkeys list/remove) SHALL continue to function.
2. Environment variables and endpoints used by the account system (JWKS, bridge token mint) SHALL remain compatible.
3. No breaking changes SHALL be introduced to public client APIs; all changes are internal to auth flows and server routes.


