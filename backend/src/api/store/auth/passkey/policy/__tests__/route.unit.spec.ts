import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { GET, POST } from '../route';

// Mock the dependencies
const mockCustomerModuleService = {
  listCustomers: jest.fn(),
  updateCustomers: jest.fn()
};

const mockScope = {
  resolve: jest.fn().mockReturnValue(mockCustomerModuleService)
};

const mockVerifyAccessToken = jest.fn();
const mockExtractBearerToken = jest.fn();

// Mock the JWT utilities
jest.mock('../../../../../../utils/jwt', () => ({
  verifyAccessToken: mockVerifyAccessToken,
  extractBearerToken: mockExtractBearerToken
}));

describe('Passkey Policy API', () => {
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockReq = {
      headers: {
        authorization: 'Bearer test-token',
        'user-agent': 'test-browser',
        'accept-language': 'en-US'
      },
      scope: mockScope,
      body: {}
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('GET /api/auth/passkey/policy', () => {
    it('should return passkey status for authenticated user', async () => {
      // Setup mocks
      mockExtractBearerToken.mockReturnValue('test-token');
      mockVerifyAccessToken.mockResolvedValue({
        email: 'test@example.com',
        phone: '+919876543210'
      });
      
      mockCustomerModuleService.listCustomers.mockResolvedValue([{
        id: 'customer-1',
        email: 'test@example.com',
        metadata: {
          passkey_registered: true
        }
      }]);

      await GET(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        hasPasskey: true,
        identifier: '+919876543210',
        deviceFingerprint: expect.any(String),
        timestamp: expect.any(String)
      });
    });

    it('should return false for user without passkey', async () => {
      mockExtractBearerToken.mockReturnValue('test-token');
      mockVerifyAccessToken.mockResolvedValue({
        email: 'test@example.com',
        phone: '+919876543210'
      });
      
      mockCustomerModuleService.listCustomers.mockResolvedValue([{
        id: 'customer-1',
        email: 'test@example.com',
        metadata: {}
      }]);

      await GET(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        hasPasskey: false,
        identifier: '+919876543210',
        deviceFingerprint: expect.any(String),
        timestamp: expect.any(String)
      });
    });

    it('should return 401 for missing token', async () => {
      mockExtractBearerToken.mockReturnValue(null);

      await GET(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Unauthorized",
        message: "No authentication token provided"
      });
    });

    it('should return fallback response on error', async () => {
      mockExtractBearerToken.mockReturnValue('test-token');
      mockVerifyAccessToken.mockRejectedValue(new Error('Token verification failed'));

      await GET(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        hasPasskey: false,
        identifier: null,
        deviceFingerprint: null,
        timestamp: expect.any(String),
        fallback: true
      });
    });
  });

  describe('POST /api/auth/passkey/policy', () => {
    it('should update passkey status for authenticated user', async () => {
      mockExtractBearerToken.mockReturnValue('test-token');
      mockVerifyAccessToken.mockResolvedValue({
        email: 'test@example.com',
        phone: '+919876543210'
      });
      
      mockCustomerModuleService.listCustomers.mockResolvedValue([{
        id: 'customer-1',
        email: 'test@example.com',
        metadata: {}
      }]);

      mockReq.body = {
        hasPasskey: true,
        credentialId: 'cred-123',
        deviceFingerprint: 'device-abc'
      };

      await POST(mockReq, mockRes);

      expect(mockCustomerModuleService.updateCustomers).toHaveBeenCalledWith('customer-1', {
        metadata: expect.objectContaining({
          passkey_registered: true,
          passkey_credential_id: 'cred-123',
          passkey_device_fingerprint: 'device-abc'
        })
      });

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        hasPasskey: true,
        identifier: '+919876543210',
        timestamp: expect.any(String)
      });
    });

    it('should return 400 for invalid hasPasskey value', async () => {
      mockExtractBearerToken.mockReturnValue('test-token');
      mockVerifyAccessToken.mockResolvedValue({
        email: 'test@example.com',
        phone: '+919876543210'
      });

      mockReq.body = {
        hasPasskey: 'invalid'
      };

      await POST(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Bad Request",
        message: "hasPasskey must be a boolean value"
      });
    });
  });
});