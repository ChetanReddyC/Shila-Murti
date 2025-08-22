import { storeFetch } from "../medusaServer";

interface RegisterWithPhoneParams {
  firstName: string;
  lastName: string;
  phone: string;
}

interface AuthTokenResponse { token: string }

/**
 * Registers a customer using a phone number as the primary identifier.
 * A deterministic placeholder email `<digits>@guest.local` is synthesised to satisfy
 * Medusa's required email field. The flow mirrors the steps described in Medusa docs:
 *   1. Request a registration token for the phone number
 *   2. Use that token for authenticated store requests
 *   3. Create a customer record with phone, placeholder email, first and last names
 *   4. Trigger the phone-based authentication flow
 *
 * Any network or HTTP error will be thrown as-is so callers can surface user-friendly
 * messages at the UI layer.
 */
export async function registerWithPhone({ firstName, lastName, phone }: RegisterWithPhoneParams) {
  // Normalize phone to E.164 (+countrycode) and derive deterministic placeholder email
  const digits = phone.replace(/\\D/g, "");
  const normalizedPhone = `+${digits}`;
  const email = `${digits}@guest.local`;

  // Step 1: obtain registration token scoped to this phone number
  const regRes = await storeFetch(`/auth/customer/phone-auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: normalizedPhone }),
  });
  if (!regRes.ok) {
    const txt = await regRes.text().catch(() => "");
    throw new Error(`registration_token_failed::${regRes.status}::${txt}`);
  }
  const { token: regToken } = (await regRes.json()) as AuthTokenResponse;

  // Step 2: perform subsequent calls with bearer token for auth-only endpoints
  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${regToken}`,
  } as Record<string, string>;

  // Step 3: create or update the customer
  // Use our custom unauthenticated endpoint that synthesises a placeholder email when needed
  const customerRes = await storeFetch(`/store/custom`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      first_name: firstName,
      last_name: lastName,
      phone: normalizedPhone,
      // backend will generate deterministic placeholder email from phone if absent
      email,
    }),
  });
  if (!customerRes.ok) {
    const txt = await customerRes.text().catch(() => "");
    throw new Error(`customer_create_failed::${customerRes.status}::${txt}`);
  }

  // Step 4: kick off phone authentication (OTP via WhatsApp/SMS)
  const authRes = await storeFetch(`/auth/customer/phone-auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: normalizedPhone }),
  });
  if (!authRes.ok) {
    const txt = await authRes.text().catch(() => "");
    throw new Error(`phone_auth_failed::${authRes.status}::${txt}`);
  }

  return await authRes.json();
}