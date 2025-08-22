/**
 * Phone Consistency Warning Component
 * 
 * Displays warnings and information when phone number conflicts are detected
 * during the checkout process, helping users understand how conflicts are resolved.
 */

import React from 'react';
import { AlertTriangle, Phone, CheckCircle, Info } from 'lucide-react';
import { validatePhoneConsistency, createPhoneResolutionExplanation, PhoneConsistencyResult } from '@/utils/phoneConsistencyValidation';

export interface PhoneConsistencyWarningProps {
  whatsappPhone: string;
  shippingPhone: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  showActions?: boolean;
  className?: string;
}

export function PhoneConsistencyWarning({
  whatsappPhone,
  shippingPhone,
  onConfirm,
  onCancel,
  showActions = true,
  className = ''
}: PhoneConsistencyWarningProps) {
  const consistencyResult = validatePhoneConsistency(whatsappPhone, shippingPhone);
  const resolutionExplanation = createPhoneResolutionExplanation(whatsappPhone, shippingPhone);
  
  if (consistencyResult.isConsistent) {
    return (
      <div className={`flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg ${className}`}>
        <CheckCircle className=\"w-5 h-5 text-green-600 flex-shrink-0\" />
        <div className=\"text-sm text-green-800\">
          <p className=\"font-medium\">Phone numbers are consistent</p>
          <p className=\"text-green-700\">Your WhatsApp and shipping phone numbers match.</p>
        </div>
      </div>
    );
  }
  
  const getAlertStyle = () => {
    switch (consistencyResult.recommendedAction) {
      case 'warn_user':
        return {
          containerClass: 'bg-yellow-50 border-yellow-200',
          iconClass: 'text-yellow-600',
          titleClass: 'text-yellow-800',
          textClass: 'text-yellow-700',
          icon: AlertTriangle
        };
      case 'require_confirmation':
        return {
          containerClass: 'bg-red-50 border-red-200',
          iconClass: 'text-red-600',
          titleClass: 'text-red-800',
          textClass: 'text-red-700',
          icon: AlertTriangle
        };
      default:
        return {
          containerClass: 'bg-blue-50 border-blue-200',
          iconClass: 'text-blue-600',
          titleClass: 'text-blue-800',
          textClass: 'text-blue-700',
          icon: Info
        };
    }
  };
  
  const alertStyle = getAlertStyle();
  const Icon = alertStyle.icon;
  
  return (
    <div className={`p-4 border rounded-lg ${alertStyle.containerClass} ${className}`}>
      <div className=\"flex items-start gap-3\">
        <Icon className={`w-5 h-5 ${alertStyle.iconClass} flex-shrink-0 mt-0.5`} />
        <div className=\"flex-1\">
          <h4 className={`font-medium text-sm ${alertStyle.titleClass} mb-2`}>
            Phone Number Conflict Detected
          </h4>
          
          <div className=\"space-y-3\">
            {/* Phone number comparison */}
            <div className=\"grid grid-cols-1 md:grid-cols-2 gap-3 text-sm\">
              <div className=\"flex items-center gap-2 p-2 bg-white rounded border\">
                <Phone className=\"w-4 h-4 text-green-600\" />
                <div>
                  <p className=\"font-medium text-gray-900\">WhatsApp Phone</p>
                  <p className={alertStyle.textClass}>{consistencyResult.conflictDetails?.whatsappDisplay}</p>
                </div>
              </div>
              
              <div className=\"flex items-center gap-2 p-2 bg-white rounded border\">
                <Phone className=\"w-4 h-4 text-blue-600\" />
                <div>
                  <p className=\"font-medium text-gray-900\">Shipping Phone</p>
                  <p className={alertStyle.textClass}>{consistencyResult.conflictDetails?.shippingDisplay}</p>
                </div>
              </div>
            </div>
            
            {/* Resolution explanation */}
            <div className={`text-sm ${alertStyle.textClass}`}>
              <p className=\"font-medium mb-1\">How we'll resolve this:</p>
              <p>{resolutionExplanation}</p>
            </div>
            
            {/* User message */}
            {consistencyResult.userFriendlyMessage && (
              <div className={`text-sm ${alertStyle.textClass} bg-white p-3 rounded border`}>
                <p>{consistencyResult.userFriendlyMessage}</p>
              </div>
            )}
          </div>
          
          {/* Action buttons */}
          {showActions && consistencyResult.recommendedAction === 'require_confirmation' && (
            <div className=\"flex flex-col sm:flex-row gap-2 mt-4\">
              <button
                onClick={onConfirm}
                className=\"px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2\"
              >
                Continue with WhatsApp Phone
              </button>
              <button
                onClick={onCancel}
                className=\"px-4 py-2 bg-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2\"
              >
                Review Phone Numbers
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Compact version of the phone consistency warning for smaller spaces
 */
export function PhoneConsistencyBadge({
  whatsappPhone,
  shippingPhone,
  className = ''
}: Pick<PhoneConsistencyWarningProps, 'whatsappPhone' | 'shippingPhone' | 'className'>) {
  const consistencyResult = validatePhoneConsistency(whatsappPhone, shippingPhone);
  
  if (consistencyResult.isConsistent) {
    return (
      <div className={`inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full ${className}`}>
        <CheckCircle className=\"w-3 h-3\" />
        <span>Phone numbers match</span>
      </div>
    );
  }
  
  const getBadgeStyle = () => {
    switch (consistencyResult.recommendedAction) {
      case 'warn_user':
        return 'bg-yellow-100 text-yellow-800';
      case 'require_confirmation':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };
  
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${getBadgeStyle()} ${className}`}>
      <AlertTriangle className=\"w-3 h-3\" />
      <span>Phone conflict detected</span>
    </div>
  );
}

/**
 * Hook for managing phone consistency state in checkout forms
 */
export function usePhoneConsistencyValidation(whatsappPhone: string, shippingPhone: string) {
  const [hasUserConfirmed, setHasUserConfirmed] = React.useState(false);
  
  const consistencyResult = React.useMemo(() => {
    return validatePhoneConsistency(whatsappPhone, shippingPhone);
  }, [whatsappPhone, shippingPhone]);
  
  const canProceed = React.useMemo(() => {
    if (consistencyResult.isConsistent) return true;
    if (consistencyResult.recommendedAction === 'warn_user') return true;
    if (consistencyResult.recommendedAction === 'require_confirmation') return hasUserConfirmed;
    return true;
  }, [consistencyResult, hasUserConfirmed]);
  
  const handleConfirm = React.useCallback(() => {
    setHasUserConfirmed(true);
  }, []);
  
  const handleCancel = React.useCallback(() => {
    setHasUserConfirmed(false);
  }, []);
  
  return {
    consistencyResult,
    canProceed,
    hasUserConfirmed,
    handleConfirm,
    handleCancel,
    requiresConfirmation: consistencyResult.recommendedAction === 'require_confirmation'
  };
}"