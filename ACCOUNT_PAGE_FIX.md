# Account Page JWT Authentication Fix

## Problem Summary
The account page was failing to load user details even though the backend endpoints (`http://localhost:9000/store/customers/profile`) worked correctly in Postman. The issue was caused by missing JWT infrastructure.

## Root Cause
1. **Missing JWKS Endpoint**: The backend's JWT verification middleware expected to fetch public keys from `http://localhost:3000/.well-known/jwks.json`, but this endpoint didn't exist.
2. **Silent Failures**: Frontend API routes were catching errors but not logging them, making the issue difficult to diagnose.
3. **JWT Verification Failures**: The backend couldn't verify tokens signed by the frontend because it couldn't retrieve the public key.

## Changes Made

### 1. Created JWKS Endpoint
**File**: `storefront/src/app/.well-known/jwks.json/route.ts` (NEW)
- Exposes the public key from `AUTH_SIGNING_JWK` environment variable
- Returns JWK Set format required by the backend's JWT verification
- Includes proper caching headers (1 hour TTL)
- Logs errors when JWT configuration is missing

### 2. Enhanced Error Logging in Profile API
**File**: `storefront/src/app/api/account/profile/route.ts` (MODIFIED)
- Added console.error logging when customer ID is not found
- Added error logging when JWT signing fails
- Added logging of backend error responses with status codes
- Changed signing failure status from 200 to 500 (proper error code)
- Added info logging for successful requests

### 3. Improved JWT Signing Error Messages
**File**: `storefront/src/lib/auth/signing.ts` (MODIFIED)
- Added error logging when `AUTH_SIGNING_JWK` environment variable is missing
- Added error logging when private key import fails
- Added error logging when signer initialization fails

### 4. Enhanced Backend JWT Verification
**File**: `backend/src/utils/jwt.ts` (MODIFIED)
- Added logging when JWKS is initialized with the URL
- Added success logging when tokens are verified
- Enhanced error logging with issuer, audience, and JWKS URL details
- Better error context for troubleshooting JWT verification failures

## Verification

### JWKS Endpoint Test
The JWKS endpoint is now accessible and returning the correct public key:
```bash
curl http://localhost:3000/.well-known/jwks.json
```

Response:
```json
{
  "keys": [{
    "kty": "RSA",
    "n": "msy0Z_HagaxFT1vKrxIYdpKdp5B-g2iKm0xKPgeLxUGYTFlo8e8kCIgWwTsCMh0ozeJuVqEp1wzKYR-yyXV60PG-eA0ummRDQ-PmD9pHwwe_WSDb-I1V344lThHFsejiVFEP3sdm1pkgSDSs2hFZAzgl-vgedMmB0_3fevFPgYLyK1_kGrIt6wknIEb6yTsC2kWkW5ZTIhsrDsBt3b7Q-Xul8k2Jw9rCBrIPtMJyCfHnl6PxsriOdf7O_tKzZPLx1qnV6MRIaFetIdX9uNqHweDCBL_EyiU0CC5AlN8fEzna2x1kS9YWnpGrqBGY0pTEcyyRlVHCFWqKPZQEt1-K0Q",
    "e": "AQAB",
    "alg": "RS256",
    "use": "sig",
    "kid": "dev-1755013028698"
  }]
}
```

## Testing the Account Page

### Prerequisites
1. Ensure both servers are running:
   - Frontend: `http://localhost:3000`
   - Backend: `http://localhost:9000`

2. Ensure you're logged in with a valid session

### Test Steps
1. **Navigate to the account page**: Go to `http://localhost:3000/account`
2. **Check browser console** for detailed logs:
   - Should see `[account/profile][GET] Fetching customer profile for: <customer_id>`
   - Should NOT see error messages about missing tokens or unauthorized access
3. **Check backend logs** for JWT verification:
   - Should see `[JWT] Initializing JWKS from URL: http://localhost:3000/.well-known/jwks.json`
   - Should see `[JWT][verifyAccessToken] Token verified successfully for sub: <customer_id>`
   - Should see `[store/customers/profile][GET]` with customer authentication details
4. **Verify data loads**:
   - Customer name and email should appear
   - Order history should populate if you have orders
   - Addresses should show if configured

### Troubleshooting

#### If you still see "unauthorized" errors:
1. Check that `AUTH_SIGNING_JWK` is set in `storefront/.env.local`
2. Verify the customer ID is in sessionStorage: Open browser console and run `sessionStorage.getItem('customerId')`
3. Check that you have a valid NextAuth session

#### If JWT verification fails:
1. Check backend logs for detailed JWT error messages
2. Verify `AUTH_JWKS_URL`, `AUTH_ISSUER`, and `AUTH_AUDIENCE` match in both `.env` files
3. Ensure the JWKS endpoint is accessible from the backend

#### If JWKS endpoint returns an error:
1. Verify `AUTH_SIGNING_JWK` is properly set in `storefront/.env.local`
2. Check the browser/terminal console for error messages from the JWKS route

## Environment Variables Required

### Frontend (`storefront/.env.local`)
```env
AUTH_SIGNING_JWK=<your-jwk-json>
AUTH_ISSUER=storefront
AUTH_AUDIENCE=medusa
```

### Backend (`backend/.env`)
```env
AUTH_JWKS_URL=http://localhost:3000/.well-known/jwks.json
AUTH_ISSUER=storefront
AUTH_AUDIENCE=medusa
```

These are already configured in your environment files.

## Next Steps
1. Test the account page with the changes
2. Monitor console logs to verify the authentication flow works
3. If any errors persist, the enhanced logging will provide detailed diagnostic information
