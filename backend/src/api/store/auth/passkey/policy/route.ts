import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { extractBearerToken, verifyAccessToken } from "../../../../../utils/jwt";

/**
 * GET /api/auth/passkey/policy
 * 
 * Checks if the authenticated user has a passkey registered on the current device.
 * This endpoint is used by the PasskeyNudge component to determine whether to show
 * the passkey registration prompt.
 * 
 * Returns:
 * - hasPasskey: boolean indicating if user has a passkey registered
 * - identifier: the user identifier (email or phone) used for passkey registration
 * - deviceFingerprint: optional device identifier for device-specific tracking
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  try {
    // Extract and verify JWT token
    const authHeader = req.headers.authorization;
    const token = extractBearerToken(authHeader);
    
    if (!token) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "No authentication token provided"
      });
    }

    let tokenPayload;
    try {
      tokenPayload = await verifyAccessToken(token, req.scope);
    } catch (error) {
      return res.status(401).json({
        error: "Unauthorized", 
        message: "Invalid authentication token"
      });
    }

    // Extract user identifier from token (email or phone)
    const userEmail = tokenPayload.email;
    const userPhone = tokenPayload.phone;
    const identifier = userPhone || userEmail;

    if (!identifier) {
      return res.status(400).json({
        error: "Bad Request",
        message: "No user identifier found in token"
      });
    }

    // Get customer service to check user's passkey status
    const customerModuleService: any = req.scope.resolve(Modules.CUSTOMER);
    
    // Look up customer by email or phone
    const customers = await customerModuleService.listCustomers({
      $or: [
        { email: userEmail },
        { phone: userPhone },
        { "metadata.phone": userPhone },
        { "metadata.phone_normalized": userPhone }
      ]
    });

    if (!customers || customers.length === 0) {
      return res.status(404).json({
        error: "Not Found",
        message: "Customer not found"
      });
    }

    const customer = customers[0];
    
    // Check if customer has passkey registered in metadata
    // This is a simplified check - in a real implementation, you would check
    // against a passkey registry or WebAuthn credential store
    const hasPasskey = customer.metadata?.passkey_registered === true ||
                      customer.metadata?.webauthn_credentials?.length > 0 ||
                      false; // Default to false if no passkey info found

    // Generate a simple device fingerprint based on request headers
    // In production, you might want a more sophisticated device fingerprinting
    const userAgent = req.headers['user-agent'] || '';
    const acceptLanguage = req.headers['accept-language'] || '';
    const deviceFingerprint = Buffer.from(`${userAgent}:${acceptLanguage}`).toString('base64').slice(0, 16);

    return res.status(200).json({
      hasPasskey,
      identifier,
      deviceFingerprint,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[PASSKEY_POLICY_ERROR]', error);
    
    // Return a safe default that allows the nudge to show
    // This ensures the system fails open rather than closed
    return res.status(200).json({
      hasPasskey: false,
      identifier: null,
      deviceFingerprint: null,
      timestamp: new Date().toISOString(),
      fallback: true
    });
  }
}

/**
 * POST /api/auth/passkey/policy
 * 
 * Updates the user's passkey registration status.
 * Called when a user successfully registers or removes a passkey.
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  try {
    // Extract and verify JWT token
    const authHeader = req.headers.authorization;
    const token = extractBearerToken(authHeader);
    
    if (!token) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "No authentication token provided"
      });
    }

    let tokenPayload;
    try {
      tokenPayload = await verifyAccessToken(token, req.scope);
    } catch (error) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid authentication token"
      });
    }

    const { hasPasskey, credentialId, deviceFingerprint } = req.body || {};
    
    if (typeof hasPasskey !== 'boolean') {
      return res.status(400).json({
        error: "Bad Request",
        message: "hasPasskey must be a boolean value"
      });
    }

    // Extract user identifier from token
    const userEmail = tokenPayload.email;
    const userPhone = tokenPayload.phone;
    const identifier = userPhone || userEmail;

    if (!identifier) {
      return res.status(400).json({
        error: "Bad Request",
        message: "No user identifier found in token"
      });
    }

    // Get customer service to update user's passkey status
    const customerModuleService: any = req.scope.resolve(Modules.CUSTOMER);
    
    // Look up customer by email or phone
    const customers = await customerModuleService.listCustomers({
      $or: [
        { email: userEmail },
        { phone: userPhone },
        { "metadata.phone": userPhone },
        { "metadata.phone_normalized": userPhone }
      ]
    });

    if (!customers || customers.length === 0) {
      return res.status(404).json({
        error: "Not Found",
        message: "Customer not found"
      });
    }

    const customer = customers[0];
    
    // Update customer metadata with passkey status
    const updatedMetadata = {
      ...(customer.metadata || {}),
      passkey_registered: hasPasskey,
      passkey_updated_at: new Date().toISOString(),
      passkey_device_fingerprint: deviceFingerprint || null,
      passkey_credential_id: credentialId || null
    };

    // If registering a passkey, add to credentials array
    if (hasPasskey && credentialId) {
      const existingCredentials = customer.metadata?.webauthn_credentials || [];
      const newCredential = {
        id: credentialId,
        registered_at: new Date().toISOString(),
        device_fingerprint: deviceFingerprint,
        last_used: new Date().toISOString()
      };
      
      // Add new credential if not already present
      const credentialExists = existingCredentials.some((cred: any) => cred.id === credentialId);
      if (!credentialExists) {
        updatedMetadata.webauthn_credentials = [...existingCredentials, newCredential];
      }
    }

    // Update customer with new passkey status
    await customerModuleService.updateCustomers(customer.id, {
      metadata: updatedMetadata
    });

    return res.status(200).json({
      success: true,
      hasPasskey,
      identifier,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[PASSKEY_POLICY_UPDATE_ERROR]', error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to update passkey status"
    });
  }
}