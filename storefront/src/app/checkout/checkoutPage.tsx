'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import Script from 'next/script';
import styles from './checkoutPage.module.css';
import loginStyles from '../(auth)/login/loginPage.module.css';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '../../contexts/CartContext';
import { processCheckout } from '../../utils/checkoutOrchestrator';
import { useSession } from 'next-auth/react';
import { usePasskey } from '../../hooks/usePasskey';
import { PriceCalculationService } from '../../services/PriceCalculationService';
import { validateIndianAddress, validateAddressField, type AddressInput } from '../../utils/addressValidation';
import AuthRequiredModal from '../../components/AuthRequiredModal';
import LoadingScreen from '../../components/LoadingScreen';
import { useNavigationLoading } from '../../providers/NavigationLoadingProvider';
import { setCustomerId as setCustomerIdHybrid, getCustomerId as getCustomerIdHybrid } from '../../utils/hybridCustomerStorage';

export default function CheckoutPage() {

  const router = useRouter();

  const { cart, loading, refreshCart, loadSpecificCart, clearCart, clearCartSilently } = useCart();

  const { authenticate, authenticateConditional, isConditionalMediationAvailable } = usePasskey();

  const { showLoading, hideLoading } = useNavigationLoading();

  // Performance Enhancement: Removed redundant refreshCart() call
  // CartContext already loads cart on initialization - no need to call it again here
  // This was causing N+1 query problem (multiple concurrent API calls on mount)



  // Form state

  const [formData, setFormData] = useState({

    name: '',

    lastName: '',

    address: '',

    city: '',

    state: '',

    postalCode: '',

    contactNumber: ''

  });

  // Field-level validation errors

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});



  // Shipping method selection is driven by backend option ids



  // Payment method state

  const [paymentMethod, setPaymentMethod] = useState('cashfree');

  const [paymentDetails, setPaymentDetails] = useState({ cardNumber: '', expiryDate: '', cvv: '' });


  // Cashfree SDK state

  const [cashfreeSdkLoaded, setCashfreeSdkLoaded] = useState(false)

  const [cashfreeLoading, setCashfreeLoading] = useState(false)



  // Identity method and state (Task 2)

  const [identityMethod, setIdentityMethod] = useState<'login' | 'phone' | 'email'>('login')

  const [phone, setPhone] = useState('')

  const [email, setEmail] = useState('')

  const [identityError, setIdentityError] = useState<string | null>(null)

  // Auth required modal state
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authModalMessage, setAuthModalMessage] = useState('')
  const identityVerificationRef = useRef<HTMLDivElement>(null)



  // Login state

  const [loginIdentifier, setLoginIdentifier] = useState('')

  const [loginProcessing, setLoginProcessing] = useState(false)
  const [loginStatusText, setLoginStatusText] = useState('Checking your credentials...')



  // OTP flow state

  const [otpSending, setOtpSending] = useState(false)

  const [otpSent, setOtpSent] = useState(false)

  const [otpCode, setOtpCode] = useState('')

  const [otpVerifying, setOtpVerifying] = useState(false)

  const [showOtpModal, setShowOtpModal] = useState(false)

  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([])
  const autoSubmitTimerRef = useRef<any>(null)



  // Magic link flow state

  const [magicSending, setMagicSending] = useState(false)

  const [magicSent, setMagicSent] = useState(false)

  const [magicVerified, setMagicVerified] = useState(false)

  const [magicLinkProcessing, setMagicLinkProcessing] = useState(false)

  const magicPollTimerRef = useRef<any>(null)



  // State for client-side URL detection to avoid hydration mismatch

  const [isFromMagicLink, setIsFromMagicLink] = useState(false)

  const [cartIdFromUrl, setCartIdFromUrl] = useState<string | null>(null)



  // Conditional mediation state

  const [conditionalUIActive, setConditionalUIActive] = useState<boolean>(false)



  // Purchase readiness gate

  const [purchaseReady, setPurchaseReady] = useState(false)

  const [customerId, setCustomerId] = useState<string | null>(null)

  // Cache flag to avoid repeated API calls for customer ID retrieval
  const [customerIdFetched, setCustomerIdFetched] = useState(false)

  // Persist readiness and form data across refresh and tabs

  useEffect(() => {

    // Only run on client side after hydration

    const restoreData = () => {

      try {

        // Identity data stays in sessionStorage (tab-specific for security)

        const raw = sessionStorage.getItem('checkout_identity')

        if (raw) {

          const data = JSON.parse(raw)

          if (data && data.expiresAt && data.expiresAt > Date.now()) {

            setCustomerId(data.customerId || null)

            if (typeof data.identityMethod === 'string') setIdentityMethod(data.identityMethod)

            if (typeof data.phone === 'string') setPhone(data.phone)

            if (typeof data.email === 'string') setEmail(data.email)

          } else {

            sessionStorage.removeItem('checkout_identity')

          }

        }



        // Form data uses localStorage for cross-tab sharing (magic links open in new tabs)

        const formRaw = localStorage.getItem('checkout_form')

        if (formRaw) {

          const formData = JSON.parse(formRaw)

          if (formData && formData.expiresAt && formData.expiresAt > Date.now()) {

            // Only restore if it's for the same cart or no cart specified (backward compatibility)

            const shouldRestore = !formData.cartId || !cart?.id || formData.cartId === cart.id



            if (shouldRestore) {


              setFormData(prev => ({ ...prev, ...formData.data }))



              // Show a brief notification that form data was restored

              if (Object.keys(formData.data).some(key => formData.data[key])) {

                setIdentityError('📋 Form data restored from previous session')

                setTimeout(() => {

                  setIdentityError(prev => prev === '📋 Form data restored from previous session' ? null : prev)

                }, 3000)

              }

            } else {


            }

          } else {

            localStorage.removeItem('checkout_form')

          }

        }

      } catch (e) {


      }

    };



    // Use setTimeout to ensure this runs after hydration

    const timer = setTimeout(restoreData, 0);

    return () => clearTimeout(timer);

  }, [])

  // Persist identity data (only after hydration)

  useEffect(() => {

    const timer = setTimeout(() => {

      try {

        const ttlMs = 15 * 60 * 1000 // 15 minutes

        const blob = {

          customerId,

          identityMethod,

          phone,

          email,

          expiresAt: Date.now() + ttlMs,

        }

        sessionStorage.setItem('checkout_identity', JSON.stringify(blob))

      } catch { }

    }, 0);



    return () => clearTimeout(timer);

  }, [customerId, identityMethod, phone, email])



  // Persist form data to localStorage for cross-tab sharing (magic links open in new tabs)

  useEffect(() => {

    const timer = setTimeout(() => {

      try {

        const ttlMs = 5 * 60 * 1000 // 5 minutes

        const blob = {

          data: formData,

          expiresAt: Date.now() + ttlMs,

        }

        // Include cart ID to ensure form data matches current cart

        const blobWithCart = {

          ...blob,

          cartId: cart?.id || null

        }


        localStorage.setItem('checkout_form', JSON.stringify(blobWithCart))

      } catch (e) {


      }

    }, 0);



    return () => clearTimeout(timer);

  }, [formData])



  // Detect authenticated users and bypass identity verification

  const { data: session, status } = useSession();

  const [sessionValidated, setSessionValidated] = useState(false);

  const isAuthenticated = status === 'authenticated' && sessionValidated;

  const isReadyToPay = isAuthenticated || purchaseReady;



  useEffect(() => {

    // CRITICAL: Validate session is still active (not blacklisted after logout)

    const validateSession = async () => {

      if (status === 'authenticated') {

        try {

          const response = await fetch('/api/auth/session/validate', {

            method: 'GET',

            credentials: 'include',

            cache: 'no-store',

          });



          if (!response.ok) {

            setSessionValidated(false);

            setPurchaseReady(false);

            return;

          }



          const data = await response.json();



          if (data?.valid === true) {

            setSessionValidated(true);

            setPurchaseReady(true);



            // Extract customerId from session if available

            const sessionCustomerId = (session as any)?.customerId;

            if (sessionCustomerId) {

              setCustomerId(sessionCustomerId);

              setCustomerIdFetched(true); // Mark as fetched from session

            } else {

              // Fallback: Try to get customer ID from hybrid storage

              console.log('[CHECKOUT] Session has no customerId, checking hybrid storage...');

              try {

                const result = await getCustomerIdHybrid();

                if (result.ok && result.customerId) {

                  console.log('[CHECKOUT] Retrieved customerId from hybrid storage:', result.customerId);

                  setCustomerId(result.customerId);

                  setCustomerIdFetched(true); // Mark as fetched from storage

                } else {

                  console.log('[CHECKOUT] No customer ID in hybrid storage:', result.error);

                  setCustomerIdFetched(true); // Mark as attempted

                }

              } catch (error) {

                console.error('[CHECKOUT] Failed to retrieve customer ID from hybrid storage:', error);

                setCustomerIdFetched(true); // Mark as attempted

              }

            }

          } else {

            // Session is invalid (blacklisted or expired)

            setSessionValidated(false);

            setPurchaseReady(false);

            console.log('[CHECKOUT] Session validation failed:', data?.reason);

          }

        } catch (error) {

          console.error('[CHECKOUT] Session validation error:', error);

          setSessionValidated(false);

          setPurchaseReady(false);

        }

      } else {

        setSessionValidated(false);

      }

    };



    validateSession();

  }, [status, session]);



  // On mount: Try to retrieve customer ID from hybrid storage if not already set

  // This handles cases where user logged in from /login page and navigated here

  useEffect(() => {

    const retrieveCustomerId = async () => {

      // Skip if we already have a customer ID or if authenticated session is loading or already fetched

      if (customerId || status === 'loading' || customerIdFetched) {

        return;

      }



      console.log('[CHECKOUT] Checking for existing customer ID in hybrid storage on mount...');



      try {

        const result = await getCustomerIdHybrid();



        if (result.ok && result.customerId) {

          console.log('[CHECKOUT] Found customer ID in hybrid storage:', result.customerId);

          setCustomerId(result.customerId);

          setCustomerIdFetched(true); // Mark as fetched

          // Note: Don't set purchaseReady here - let session validation or identity verification handle it

        } else {

          console.log('[CHECKOUT] No customer ID found in hybrid storage');

          setCustomerIdFetched(true); // Mark as attempted

        }

      } catch (error) {

        console.error('[CHECKOUT] Error retrieving customer ID from hybrid storage:', error);

        setCustomerIdFetched(true); // Mark as attempted

      }

    };



    retrieveCustomerId();

  }, [customerId, status, customerIdFetched]);



  // Conditional UI: Start listening for passkey autofill when identity method is login

  // CRITICAL: Must start IMMEDIATELY when login method is selected, before input field is focused

  useEffect(() => {

    let abortController: AbortController | null = null



    const startConditionalUI = async () => {

      try {

        // Don't run if already verified

        if (purchaseReady || status === 'authenticated') {

          return

        }



        console.log('[Checkout ConditionalUI] Starting conditional mediation on mount...')

        setConditionalUIActive(true)



        // Check if conditional mediation is supported

        const isSupported = await isConditionalMediationAvailable()

        if (!isSupported) {

          console.log('[Checkout ConditionalUI] Not supported on this browser')

          setConditionalUIActive(false)

          return

        }



        // Create abort controller to cancel the request if needed

        abortController = new AbortController()



        // Get a generic challenge for conditional UI (doesn't need user identifier)

        const optionsRes = await fetch('/api/auth/passkey/options', {

          method: 'POST',

          headers: { 'Content-Type': 'application/json' },

          body: JSON.stringify({ conditionalUI: true }),

          signal: abortController.signal,

        })



        if (!optionsRes.ok) {

          console.warn('[Checkout ConditionalUI] Failed to get options')

          return

        }



        const { options, userId: canonicalUserId } = await optionsRes.json()



        // Start conditional authentication (non-blocking, waits for user input)

        const { data, error: authError } = await authenticateConditional(options)



        if (authError) {

          // User cancelled or no passkey available - this is normal, not an error

          console.log('[Checkout ConditionalUI] Not used:', authError)

          return

        }



        if (data) {

          console.log('[Checkout ConditionalUI] Passkey selected from autofill!')

          // Show full-page loading screen with status progression
          flushSync(() => {
            setLoginProcessing(true)
            setLoginStatusText('Authenticating with passkey...')
          })



          // Verify the passkey

          const verifyRes = await fetch('/api/auth/passkey/verify', {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify({

              ...data,

              userId: canonicalUserId,

              conditionalUI: true,

            }),

          })



          if (!verifyRes.ok) {

            setIdentityError('Passkey authentication failed')

            setLoginProcessing(false)

            return

          }

          setLoginStatusText('Verifying your identity...')

          const result = await verifyRes.json()

          console.log('🔵 [Checkout ConditionalUI] Verify response:', result)



          // Extract identifier from result (email or phone)

          const userIdentifier = result.email || result.phone || canonicalUserId

          console.log('🔵 [Checkout ConditionalUI] Extracted userIdentifier:', userIdentifier)



          // Mark passkey authentication success

          try {

            if (typeof window !== 'undefined') {

              sessionStorage.setItem('hasPasskey', 'true')

              if (result?.credentialId) {

                sessionStorage.setItem('lastPasskeyCredential', result.credentialId)

                sessionStorage.setItem('currentPasskeyCredential', result.credentialId)

              }

              const policyKey = `passkeyPolicy_${userIdentifier}`

              const cacheData = { hasPasskey: true, expiresAt: Date.now() + (60 * 60 * 1000) }

              localStorage.setItem(policyKey, JSON.stringify(cacheData))

              const registeredKey = `passkeyRegistered_${userIdentifier}`

              localStorage.setItem(registeredKey, JSON.stringify({ timestamp: Date.now() }))

            }

          } catch (storageError) {

            console.warn('[Checkout ConditionalUI] Failed to update storage:', storageError)

          }



          // Ensure customer exists
          setLoginStatusText('Setting up your account...')

          let ensuredCustomerId: string | undefined

          try {

            const id = userIdentifier.includes('@') ? { email: userIdentifier } : { phone: userIdentifier }

            console.log('🔵 [Checkout ConditionalUI] Ensuring customer for:', id)

            const ensure = await fetch('/api/account/customer/ensure', {

              method: 'POST',

              headers: { 'Content-Type': 'application/json' },

              body: JSON.stringify(id)

            })

            const ej = await ensure.json().catch(() => ({}))

            console.log('🔵 [Checkout ConditionalUI] Customer ensure response:', ej)

            if (ej?.customerId) {

              ensuredCustomerId = String(ej.customerId)

              try {

                await setCustomerIdHybrid(ensuredCustomerId)

                console.log('✅ [Checkout ConditionalUI] Customer ID set in hybrid storage:', ensuredCustomerId)

              } catch (e) {

                console.error('❌ [Checkout ConditionalUI] Failed to set customer ID:', e)

              }

            }

          } catch (err) {

            console.error('❌ [Checkout ConditionalUI] Customer ensure failed:', err)

          }



          // Set purchase ready state

          if (ensuredCustomerId) {

            setCustomerId(ensuredCustomerId)

            setPurchaseReady(true)

            setIdentityError('✅ Authenticated with passkey! You can now place your order.')



            // Update NextAuth session
            setLoginStatusText('Creating your session...')

            try {

              const { signIn } = await import('next-auth/react')

              const signInResult = await signIn('session', {

                identifier: userIdentifier,

                customerId: ensuredCustomerId,

                hasPasskey: true,

                redirect: false

              })



              if (!signInResult?.ok) {

                console.error('❌ [Checkout ConditionalUI] SignIn failed:', signInResult?.error)

                setIdentityError('⚠️ Session creation failed. Please refresh the page.')

                setPurchaseReady(false)

                setLoginProcessing(false)

                return

              }



              console.log('✅ [Checkout ConditionalUI] Session created successfully')



              // Wait for session cookie to be set and force session refresh

              await new Promise(resolve => setTimeout(resolve, 800))



              // Force session validation by making a direct check

              try {

                const validationResponse = await fetch('/api/auth/session/validate', {

                  method: 'GET',

                  credentials: 'include',

                  cache: 'no-store',

                });



                const validationData = await validationResponse.json();



                if (validationData?.valid !== true) {

                  console.error('[Checkout ConditionalUI] Session validation failed after creation:', validationData?.reason)

                  setIdentityError('⚠️ Session validation failed. Please refresh the page.')

                  setPurchaseReady(false)

                  setLoginProcessing(false)

                  return

                }



                console.log('✅ [Checkout ConditionalUI] Session validated successfully')

              setLoginProcessing(false)

              } catch (validationError) {

                console.error('[Checkout ConditionalUI] Session validation error:', validationError)

                setIdentityError('⚠️ Could not validate session. Please refresh the page.')

                setPurchaseReady(false)

                setLoginProcessing(false)

                return

              }



            } catch (e) {

              console.error('❌ [Checkout ConditionalUI] SignIn error:', e)

              setIdentityError('⚠️ Authentication failed. Please refresh the page.')

              setPurchaseReady(false)

              setLoginProcessing(false)

              return

            }



            // Auto-hide success message after 5 seconds

            setTimeout(() => {

              setIdentityError((prev) => prev === '✅ Authenticated with passkey! You can now place your order.' ? null : prev)

            }, 5000)

          } else {

            setIdentityError('Failed to get customer information. Please try again.')

            setLoginProcessing(false)

          }

        }

      } catch (err: any) {

        // AbortError is expected when user navigates away

        if (err?.name !== 'AbortError') {

          console.warn('[Checkout ConditionalUI] Error:', err)

        }

        setLoginProcessing(false)

      }

    }



    // CRITICAL: Start immediately on component mount (just like login page)

    // The conditional mediation request MUST be active BEFORE user switches to login method

    // and BEFORE user clicks the input field

    if (!purchaseReady && status !== 'authenticated') {

      startConditionalUI()

    }



    // Cleanup: abort the request if component unmounts

    return () => {

      if (abortController) {

        abortController.abort()

      }

      setConditionalUIActive(false)

    }

  }, [purchaseReady, status, isConditionalMediationAvailable, authenticateConditional])



  // Check URL parameters only after hydration to avoid hydration mismatch

  useEffect(() => {

    if (typeof window !== 'undefined') {

      const urlParams = new URLSearchParams(window.location.search);

      setIsFromMagicLink(urlParams.get('verified') === 'true');

      setCartIdFromUrl(urlParams.get('cartId'));

    }

  }, []);



  // Handle magic link verification success from URL parameters

  useEffect(() => {

    // Only run on client side

    if (typeof window === 'undefined') return;



    const urlParams = new URLSearchParams(window.location.search);

    const verified = urlParams.get('verified');

    const emailParam = urlParams.get('email');

    const cartIdParam = urlParams.get('cartId');

    const phoneParam = urlParams.get('phone');



    if (verified === 'true' && emailParam) {

      setMagicLinkProcessing(true);



      // Magic link verification successful

      setEmail(emailParam);

      setIdentityMethod('email');

      setMagicSent(true);

      setMagicVerified(true);



      // Set phone if provided (for dual verification scenarios)

      if (phoneParam) {

        setPhone(phoneParam);

      }



      // Process cart loading and verification

      const processVerification = async () => {

        try {




          // If cartId is provided, force load that specific cart (cross-device support)

          if (cartIdParam && cartIdParam !== cart?.id) {


            await loadSpecificCart(cartIdParam);

          }



          // Trigger the checkout verification process

          // Parse form name for customer creation

          const fullName = (formData.name || '').trim()

          const nameParts = fullName.split(/\s+/).filter(Boolean)

          const firstName = nameParts[0] || 'Customer'

          const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : ''



          const payload: any = { email: emailParam };

          if (cartIdParam) payload.cartId = cartIdParam;

          if (phoneParam) payload.phone = phoneParam;



          // Include form data for account creation

          payload.formData = {

            first_name: firstName,

            last_name: lastName,

            phone: formData.contactNumber || phoneParam || '',

            address: {

              address_1: formData.address,

              city: formData.city,

              postal_code: formData.postalCode,

              province: formData.state,

              country_code: 'in',

              phone: formData.contactNumber || phoneParam || ''

            }

          };



          const res = await fetch('/api/auth/session/checkout/verify', {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify(payload),

          });



          const json = await res.json().catch(() => ({}));



          if (res.ok && json?.customerId) {

            setPurchaseReady(true);

            setCustomerId(json.customerId);

            // Store customerId using hybrid storage (Option C)

            try {

              await setCustomerIdHybrid(json.customerId);

            } catch (storageError) {

              console.error('[Checkout] Failed to set customer ID:', storageError);

            }

            setIdentityError(null);



            // Update NextAuth session with the customerId to trigger passkey nudge

            try {

              const identifierValue = (identityMethod === 'email')

                ? (emailParam || '').trim().toLowerCase()

                : (phone || '').trim();

              if (identifierValue) {

                import('next-auth/react').then(({ signIn }) => {

                  signIn('session', { identifier: identifierValue, customerId: json.customerId, redirect: false })

                    .catch((e) => {


                    });

                }).catch(() => { });

              }

            } catch (sessionError) {


            }



            // Show success message briefly

            setIdentityError('✅ Email verification successful! You can now place your order.');

            setTimeout(() => setIdentityError(null), 5000);




          } else {

            throw new Error(json?.error || 'Verification failed');

          }

        } catch (e: any) {


          setIdentityError(e?.message || 'Failed to complete verification. Please try again.');

          setMagicVerified(false);

          setPurchaseReady(false);

        } finally {

          setMagicLinkProcessing(false);

        }

      };



      processVerification();



      // For cross-tab communication: store verification success in localStorage

      // This helps when magic link opens in a new tab

      try {

        const verificationData = {

          verified: true,

          email: emailParam,

          phone: phoneParam,

          cartId: cartIdParam,

          customerId: undefined, // customerId will be set by the verification process

          timestamp: Date.now(),

          expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes

        }

        localStorage.setItem('magic_verification_success', JSON.stringify(verificationData))


      } catch (e) {


      }



      // Clean up URL parameters to avoid confusion on refresh (but keep cartId briefly for recovery)

      setTimeout(() => {

        if (typeof window !== 'undefined') {

          const cleanUrl = window.location.pathname;

          window.history.replaceState({}, document.title, cleanUrl);

        }

      }, 3000); // Wait 3 seconds to allow cart loading to complete

    }

  }, [cart?.id, loadSpecificCart]);



  // Listen for cross-tab verification success (when magic link opens in new tab)

  useEffect(() => {

    const checkCrossTabVerification = async () => {

      try {

        const raw = localStorage.getItem('magic_verification_success')

        if (raw) {

          const data = JSON.parse(raw)

          if (data && data.expiresAt && data.expiresAt > Date.now() && data.verified && data.cartId && data.cartId === cart?.id) {




            // Apply the verification state

            if (data.email) {

              setEmail(data.email)

              setIdentityMethod('email')

              setMagicSent(true)

              setMagicVerified(true)

              setPurchaseReady(true)

              // Set customerId if available in cross-tab data

              if (data.customerId) {

                setCustomerId(data.customerId);

                // Store customerId using hybrid storage (Option C)

                try {

                  await setCustomerIdHybrid(data.customerId);

                } catch (storageError) {

                  console.error('[Checkout] Failed to set customer ID:', storageError);

                }

              }

              setIdentityError('✅ Email verified in another tab! You can now place your order.')



              // Clear the verification data since we've used it

              localStorage.removeItem('magic_verification_success')



              // Auto-hide success message after 5 seconds

              setTimeout(() => setIdentityError(null), 5000)

            }

          } else if (data && data.expiresAt && data.expiresAt <= Date.now()) {

            // Clean up expired data

            localStorage.removeItem('magic_verification_success')

          }

        }

      } catch (e) {


      }

    }



    // Check immediately

    checkCrossTabVerification()



    // Also listen for storage events (when other tabs update localStorage)

    const handleStorageChange = (e: StorageEvent) => {

      if (e.key === 'magic_verification_success' && e.newValue) {


        checkCrossTabVerification()

      }

    }



    window.addEventListener('storage', handleStorageChange)



    // Also poll periodically in case storage events don't fire

    const pollInterval = setInterval(checkCrossTabVerification, 2000)



    return () => {

      window.removeEventListener('storage', handleStorageChange)

      clearInterval(pollInterval)

    }

  }, [])



  // Map backend error codes to user-friendly messages

  const mapIdentityError = (

    source: 'otp-send' | 'otp-verify' | 'magic-send' | 'checkout-verify',

    code?: string,

    status?: number,

  ): string => {

    const c = String(code || '').toLowerCase()

    if (source === 'otp-send') {

      if (c === 'identifier_required') return 'Please enter your WhatsApp phone number.'

      if (c === 'rate_limited_identifier' || status === 429) return 'Too many OTP requests for this number. Please try again later.'

      if (c === 'rate_limited_ip') return 'Too many OTP requests from your network. Please wait and try again.'

      if (c === 'wa_send_failed') return 'Failed to send WhatsApp OTP. Please check your number or try again later.'

      return 'Unable to send OTP. Please try again.'

    }

    if (source === 'otp-verify') {

      if (c === 'invalid_code') return 'The OTP you entered is invalid.'

      if (c === 'expired_or_missing') return 'Your OTP has expired. Please request a new one.'

      return 'Failed to verify OTP. Please try again.'

    }

    if (source === 'magic-send') {

      if (c === 'email_required') return 'Please enter a valid email address.'

      if (c === 'rate_limited' || status === 429) return 'Too many emails sent. Please try again later.'

      if (c === 'email_send_failed') return 'Failed to send the magic link. Please try again.'

      return 'Unable to send magic link. Please try again.'

    }

    // checkout-verify

    if (c === 'identifier_required') return 'Please provide your phone or email to continue.'

    if (c === 'not_verified') return 'Verification is not complete. Please verify and try again.'

    if (c === 'ensure_failed') return 'We could not prepare your account. Please try again.'

    if (status && status >= 500) return 'Temporary error. Please try again.'

    return 'Verification failed. Please try again.'

  }



  // Derive cart-based values

  const cartItems = cart?.items ?? [];



  // Calculate subtotal from actual item prices to ensure consistency

  const subtotal = cart?.items?.reduce((sum, item) => sum + (Number(item.unit_price) * Number(item.quantity)), 0) ?? 0;

  const backendShippingAmount = Number(cart?.shipping_total ?? 0);



  // Shipping options and dynamic amounts sourced from backend at runtime

  const [shippingOptions, setShippingOptions] = useState<Array<{ id: string; name: string; amount: number; estimate?: string }>>([])

  // Derive an estimated delivery text for a shipping option

  const getEstimate = (name: string, metadata?: Record<string, any>): string | undefined => {

    if (metadata) {

      const text = (metadata as any).delivery_estimate_text

      const min = Number((metadata as any).min_days)

      const max = Number((metadata as any).max_days)

      if (typeof text === 'string' && text.trim()) return text.trim()

      if (!Number.isNaN(min) && !Number.isNaN(max) && min > 0 && max >= min) {

        return `${min}-${max} business days`

      }

      if (!Number.isNaN(min) && min > 0) {

        return `${min} business days`

      }

    }

    const lower = name.toLowerCase()

    if (lower.includes('express') || lower.includes('overnight') || lower.includes('one-day') || lower.includes('1-2')) return '1-2 business days'

    if (lower.includes('expedited') || lower.includes('priority') || lower.includes('fast')) return '2-3 business days'

    if (lower.includes('standard') || lower.includes('economy') || lower.includes('ground') || lower.includes('regular') || lower.includes('free')) return '5-7 business days'

    return undefined

  }



  const [selectedShippingOptionId, setSelectedShippingOptionId] = useState<string | null>(null)



  // Load eligible shipping options for the current cart

  useEffect(() => {

    const load = async () => {

      if (!cart?.id) return

      try {

        const options = await (async () => {

          // Use the medusaApiClient via dynamic import to avoid circular deps

          const { medusaApiClient } = await import('../../utils/medusaApiClient')

          return medusaApiClient.getShippingOptionsForCart(cart.id)

        })()

        const normalized = (options || []).map((o: any) => ({

          id: o.id,

          name: String(o.name || ''),

          amount: Number(o.amount ?? 0),

          estimate: getEstimate(String(o.name || ''), (o as any).metadata || (o as any).data)

        }))

        // Sort by amount ascending for stable order

        normalized.sort((a, b) => Number(a.amount) - Number(b.amount))

        setShippingOptions(normalized)

        // Default to the first option if none selected yet

        setSelectedShippingOptionId((prev) => prev ?? (normalized[0]?.id || null))

      } catch (e) {


      }

    }

    load()

  }, [cart?.id])



  // Use centralized price calculation service for all price calculations

  const cartTotals = cart ? PriceCalculationService.calculateCartTotals(cart, selectedShippingOptionId || undefined, shippingOptions) : null;



  const effectiveShippingAmount = cartTotals?.shipping ?? backendShippingAmount;

  const shipping = PriceCalculationService.getFormattedShipping(cart, selectedShippingOptionId || undefined, shippingOptions);

  const taxes = cartTotals?.tax ?? 0;

  const total = cartTotals?.total ?? (subtotal + effectiveShippingAmount + taxes);



  // Progress state for entire checkout form

  const [formProgress, setFormProgress] = useState(0);

  // State to track if progress bar should be sticky

  const [isProgressBarSticky, setIsProgressBarSticky] = useState(false);

  // Reference to the original progress bar

  const progressBarRef = useRef<HTMLDivElement>(null);



  // Calculate form completion progress for the entire checkout

  useEffect(() => {

    let filledFields = 0;

    let totalFields = 0;



    // Shipping fields (6 fields)

    totalFields += 6;

    if (formData.name) filledFields++;

    if (formData.address) filledFields++;

    if (formData.city) filledFields++;

    if (formData.state) filledFields++;

    if (formData.postalCode) filledFields++;

    if (formData.contactNumber) filledFields++;



    // Shipping option selection (1 field)

    totalFields += 1;

    if (selectedShippingOptionId) filledFields++;



    // Payment method selection (1 field)

    totalFields += 1;

    if (paymentMethod) filledFields++; // Always filled since we have a default



    // Payment details (only counted if credit card is selected)

    if (paymentMethod === 'creditCard') {

      totalFields += 3; // cardNumber, expiryDate, cvv

      if (paymentDetails.cardNumber) filledFields++;

      if (paymentDetails.expiryDate) filledFields++;

      if (paymentDetails.cvv) filledFields++;

    }



    const progress = (filledFields / totalFields) * 100;

    setFormProgress(progress);

  }, [formData, selectedShippingOptionId, paymentMethod, paymentDetails]);



  // Add scroll event listener to check if progress bar should be sticky

  useEffect(() => {

    const handleScroll = () => {

      if (progressBarRef.current) {

        const progressBarRect = progressBarRef.current.getBoundingClientRect();

        // Make the bar sticky when it's about to scroll off the top (accounting for header)

        const headerHeight = 65 + 16; // header height + its margin

        setIsProgressBarSticky(progressBarRect.top <= headerHeight);

      }

    };



    window.addEventListener('scroll', handleScroll);

    return () => {

      window.removeEventListener('scroll', handleScroll);

    };

  }, []);



  // Handle form input changes

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {

    const { name, value } = e.target;

    setFormData({

      ...formData,

      [name]: value

    });



    // Clear error for this field when user starts typing

    if (formErrors[name]) {

      setFormErrors(prev => {

        const updated = { ...prev };

        delete updated[name];

        return updated;

      });

    }

  };



  // Validate individual field on blur

  const handleFieldBlur = (e: React.FocusEvent<HTMLInputElement>) => {

    const { name, value } = e.target;



    // Only validate fields that are part of AddressInput

    const addressFields = ['name', 'address', 'city', 'state', 'postalCode', 'contactNumber'];

    if (!addressFields.includes(name)) return;



    const error = validateAddressField(name as keyof AddressInput, value);



    if (error) {

      setFormErrors(prev => ({

        ...prev,

        [name]: error

      }));

    } else {

      setFormErrors(prev => {

        const updated = { ...prev };

        delete updated[name];

        return updated;

      });

    }

  };



  // Handle payment details changes

  const handlePaymentDetailsChange = (e: React.ChangeEvent<HTMLInputElement>) => {

    const { name, value } = e.target;

    setPaymentDetails({

      ...paymentDetails,

      [name]: value

    });

  };



  // Handle shipping method change

  const handleShippingOptionIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {

    setSelectedShippingOptionId(e.target.value)

  }



  // Handle payment method change

  const handlePaymentMethodChange = (e: React.ChangeEvent<HTMLInputElement>) => {

    setPaymentMethod(e.target.value);

  };



  // Reset identity states when switching method

  const onIdentityMethodChange = (method: 'login' | 'phone' | 'email') => {

    setIdentityMethod(method)

    setIdentityError(null)

    setOtpSending(false)

    setOtpSent(false)

    setOtpCode('')

    setOtpVerifying(false)

    setMagicSending(false)

    setMagicSent(false)

    setMagicVerified(false)

    setLoginProcessing(false)

    if (magicPollTimerRef.current) {

      clearInterval(magicPollTimerRef.current)

      magicPollTimerRef.current = null

    }

    setPurchaseReady(false)

    setCustomerId(null)

  }



  // Send OTP for phone flow

  const sendOtp = async () => {

    try {

      setIdentityError(null)

      if (!phone.trim()) {

        setIdentityError('Enter a valid phone number')

        return

      }

      setOtpSending(true)

      const res = await fetch('/api/auth/otp/send', {

        method: 'POST', headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ phone })

      })

      const body = await res.json().catch(() => ({}))

      if (!res.ok || body?.ok !== true) {

        throw new Error(mapIdentityError('otp-send', body?.error, res.status))

      }

      setOtpSent(true)
      setShowOtpModal(true)

    } catch (e: any) {

      setIdentityError(e?.message || mapIdentityError('otp-send'))

    } finally {

      setOtpSending(false)

    }

  }



  const handleOtpInputChange = (index: number, value: string) => {
    if (value.length <= 1 && /^\d*$/.test(value)) {
      const newOtpArray = Array(6).fill('')
      const currentCode = otpCode.padEnd(6, '')
      for (let i = 0; i < 6; i++) {
        newOtpArray[i] = currentCode[i] || ''
      }
      newOtpArray[index] = value
      const completeCode = newOtpArray.join('')
      setOtpCode(completeCode)
      if (value.length === 1 && index < 5) {
        otpInputRefs.current[index + 1]?.focus()
      }
    }
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus()
    }
  }

  // Verify OTP, then checkout-verify

  const verifyOtp = useCallback(async () => {

    try {

      setIdentityError(null)

      if (!otpCode || !/^\d{6}$/.test(otpCode)) {

        setIdentityError('Enter the 6-digit OTP code')

        return

      }

      setOtpVerifying(true)

      const vr = await fetch('/api/auth/otp/verify', {

        method: 'POST', headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ phone, code: otpCode })

      })

      const vj = await vr.json().catch(() => ({}))

      if (!vr.ok || vj?.ok !== true) {

        throw new Error(mapIdentityError('otp-verify', vj?.error, vr.status))

      }

      // Checkout verify

      if (!cart?.id) throw new Error('Cart not ready for verification')

      // Parse form name for customer creation

      const fullName = (formData.name || '').trim()

      const nameParts = fullName.split(/\s+/).filter(Boolean)

      const firstName = nameParts[0] || 'Customer'

      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : ''



      const cr = await fetch('/api/auth/session/checkout/verify', {

        method: 'POST', headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({

          phone,

          cartId: cart.id,

          formData: {

            first_name: firstName,

            last_name: lastName,

            phone: formData.contactNumber || phone,

            address: {

              address_1: formData.address,

              city: formData.city,

              postal_code: formData.postalCode,

              province: formData.state,

              country_code: 'in',

              phone: formData.contactNumber || phone

            }

          }

        })

      })

      const cj = await cr.json().catch(() => ({}));

      if (!cr.ok || cj?.ok !== true) {

        throw new Error(mapIdentityError('checkout-verify', cj?.error, cr.status));

      }

      const customerIdValue = String(cj.customerId || '');

      setCustomerId(customerIdValue);

      // Store customerId using hybrid storage (Option C)

      try {

        await setCustomerIdHybrid(customerIdValue);

      } catch (storageError) {

        console.error('[Checkout] Failed to set customer ID:', storageError);
      }

      // Close modal and clear OTP code after success
      setShowOtpModal(false);
      setOtpCode('');
      setOtpSent(false);

      setPurchaseReady(true);



      // Update NextAuth session with the customerId to trigger automatic login
      try {
        const identifierValue = (identityMethod === 'email')
          ? (email || '').trim().toLowerCase()
          : (phone || '').trim();

        if (identifierValue) {
          console.log('[CHECKOUT][AUTO_LOGIN][START]', {
            identityMethod,
            identifierLength: identifierValue.length,
            customerId: customerIdValue?.substring(0, 15) + '...'
          })

          // Use proper async/await instead of Promise chaining
          const { signIn } = await import('next-auth/react')

          const result = await signIn('session', {
            identifier: identifierValue,
            customerId: String(cj.customerId || ''),
            redirect: false
          })

          if (result?.ok) {
            console.log('[CHECKOUT][AUTO_LOGIN][SUCCESS]', {
              identityMethod,
              customerId: customerIdValue?.substring(0, 15) + '...'
            })
          } else {
            console.error('[CHECKOUT][AUTO_LOGIN][FAILED]', {
              identityMethod,
              error: result?.error,
              status: result?.status
            })
          }
        } else {
          console.warn('[CHECKOUT][AUTO_LOGIN][SKIPPED]', {
            reason: 'no_identifier',
            identityMethod
          })
        }
      } catch (sessionError: any) {
        console.error('[CHECKOUT][AUTO_LOGIN][EXCEPTION]', {
          error: sessionError?.message || String(sessionError),
          stack: sessionError?.stack
        })
      }

    } catch (e: any) {

      setIdentityError(e?.message || mapIdentityError('otp-verify'))

      setPurchaseReady(false)

      setCustomerId(null)

    } finally {

      setOtpVerifying(false)

    }

  }, [otpCode, phone, cart?.id, formData, identityMethod, email])



  // Send magic link and start polling

  const sendMagic = async () => {

    try {

      setIdentityError(null)

      const em = email.trim().toLowerCase()

      if (!em || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {

        setIdentityError('Enter a valid email')

        return

      }

      if (!cart?.id) {

        setIdentityError('Cart not ready for verification')

        return

      }

      setMagicSending(true)

      const state = `checkout-${cart.id}`

      const mr = await fetch('/api/auth/magic/send', {

        method: 'POST', headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ email: em, state, cartId: cart.id })

      })

      const mj = await mr.json().catch(() => ({}))

      if (!mr.ok || mj?.ok !== true) {

        throw new Error(mapIdentityError('magic-send', mj?.error, mr.status))

      }

      setMagicSent(true)

      // Start polling for status

      if (magicPollTimerRef.current) clearInterval(magicPollTimerRef.current)

      let attempts = 0

      magicPollTimerRef.current = setInterval(async () => {

        attempts += 1

        try {

          const url = `/api/auth/magic/status?email=${encodeURIComponent(em)}&state=${encodeURIComponent(state)}`

          const sr = await fetch(url)

          const sj = await sr.json().catch(() => ({}))

          if (sj?.verified) {

            clearInterval(magicPollTimerRef.current)

            magicPollTimerRef.current = null

            setMagicVerified(true)

            // Checkout verify - include phone and formData for customer creation
            const fullName = (formData.name || '').trim()
            const nameParts = fullName.split(/\s+/).filter(Boolean)
            const firstName = nameParts[0] || 'Customer'
            const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : ''

            const verifyPayload: any = {
              email: em,
              cartId: cart.id,
              phone: formData.contactNumber || phone || '',
              formData: {
                first_name: firstName,
                last_name: lastName,
                phone: formData.contactNumber || phone || '',
                address: {
                  address_1: formData.address,
                  city: formData.city,
                  postal_code: formData.postalCode,
                  province: formData.state,
                  country_code: 'in',
                  phone: formData.contactNumber || phone || ''
                }
              }
            }

            const cr = await fetch('/api/auth/session/checkout/verify', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(verifyPayload)
            })

            const cj = await cr.json().catch(() => ({}))

            if (cr.ok && cj?.ok === true) {

              const customerIdValue = String(cj.customerId || '');

              setCustomerId(customerIdValue)

              // Store customerId using hybrid storage (Option C)

              try {

                await setCustomerIdHybrid(customerIdValue);

              } catch (storageError) {

                console.error('[Checkout] Failed to set customer ID:', storageError);

              }


              setPurchaseReady(true)



              // Update NextAuth session with the customerId to trigger automatic login
              try {
                const identifierValue = (identityMethod === 'email')
                  ? (em || '').trim().toLowerCase()
                  : (phone || '').trim();

                if (identifierValue) {
                  console.log('[CHECKOUT][MAGIC][AUTO_LOGIN][START]', {
                    identityMethod,
                    identifierLength: identifierValue.length,
                    customerId: customerIdValue?.substring(0, 15) + '...'
                  })

                  // Use proper async/await instead of Promise chaining
                  const { signIn } = await import('next-auth/react')

                  const result = await signIn('session', {
                    identifier: identifierValue,
                    customerId: String(cj.customerId || ''),
                    redirect: false
                  })

                  if (result?.ok) {
                    console.log('[CHECKOUT][MAGIC][AUTO_LOGIN][SUCCESS]', {
                      identityMethod,
                      customerId: customerIdValue?.substring(0, 15) + '...'
                    })
                  } else {
                    console.error('[CHECKOUT][MAGIC][AUTO_LOGIN][FAILED]', {
                      identityMethod,
                      error: result?.error,
                      status: result?.status
                    })
                  }
                } else {
                  console.warn('[CHECKOUT][MAGIC][AUTO_LOGIN][SKIPPED]', {
                    reason: 'no_identifier',
                    identityMethod
                  })
                }
              } catch (sessionError: any) {
                console.error('[CHECKOUT][MAGIC][AUTO_LOGIN][EXCEPTION]', {
                  error: sessionError?.message || String(sessionError),
                  stack: sessionError?.stack
                })
              }

            } else {

              setIdentityError(mapIdentityError('checkout-verify', cj?.error, cr.status))

            }

          }

        } catch { }

        // Stop after ~5 minutes or 150 attempts at 2s

        if (attempts >= 150) {

          clearInterval(magicPollTimerRef.current)

          magicPollTimerRef.current = null

        }

      }, 2000)

    } catch (e: any) {

      setIdentityError(e?.message || mapIdentityError('magic-send'))

    } finally {

      setMagicSending(false)

    }

  }



  // Auto-submit when OTP is complete
  useEffect(() => {
    if (otpCode.length === 6 && /^\d{6}$/.test(otpCode) && !otpVerifying) {
      if (autoSubmitTimerRef.current) {
        clearTimeout(autoSubmitTimerRef.current)
      }
      autoSubmitTimerRef.current = setTimeout(() => {
        verifyOtp()
      }, 300)
    }
    return () => {
      if (autoSubmitTimerRef.current) {
        clearTimeout(autoSubmitTimerRef.current)
      }
    }
  }, [otpCode, otpVerifying, verifyOtp])

  // Cleanup polling on unmount and clean up localStorage on successful order

  useEffect(() => {

    return () => {

      if (magicPollTimerRef.current) clearInterval(magicPollTimerRef.current)

    }

  }, [])



  // Clean up form data from localStorage when order is successfully placed

  const cleanupFormData = () => {

    try {

      localStorage.removeItem('checkout_form')

      localStorage.removeItem('magic_verification_success')


    } catch (e) {


    }

  }



  // Cashfree payment handler

  const handleCashfreePay = async () => {

    showLoading();

    try {

      if (!cart || !cart.id || cartItems.length === 0) {

        hideLoading();
        alert('Your cart is empty.');

        return;

      }

      if (!(window as any).Cashfree) {

        hideLoading();
        alert('Cashfree SDK not loaded');

        return;

      }

      setCashfreeLoading(true)

      // GATE 1: Validate customer ID exists (BLOCKING)
      // CRITICAL FIX: Re-check hybrid storage as fallback if state is empty (timing issue)
      // Optimization: Cache the result to avoid repeated API calls
      let actualCustomerId = customerId
      if (!actualCustomerId && !customerIdFetched) {
        console.warn('[CASHFREE] Customer ID not in state, checking hybrid storage...')
        try {
          const result = await getCustomerIdHybrid()
          if (result.ok && result.customerId) {
            actualCustomerId = result.customerId
            setCustomerId(actualCustomerId) // Update state for next time
            setCustomerIdFetched(true) // Mark as fetched to avoid repeated calls
            console.log('[CASHFREE] Retrieved customer ID from hybrid storage:', actualCustomerId)
          } else {
            setCustomerIdFetched(true) // Mark as attempted even if failed
          }
        } catch (error) {
          console.error('[CASHFREE] Failed to retrieve customer ID from hybrid storage:', error)
          setCustomerIdFetched(true) // Mark as attempted even if error
        }
      } else if (actualCustomerId && !customerIdFetched) {
        // If we have customerId in state, mark it as fetched
        setCustomerIdFetched(true)
      }

      if (!actualCustomerId) {
        console.warn('[CASHFREE] Customer ID required')
        hideLoading()
        setAuthModalMessage('Please complete identity verification before payment. Use phone OTP or email magic link in the Identity Verification section.')
        setAuthModalOpen(true)
        setCashfreeLoading(false)
        return
      }

      console.log('[CASHFREE] Customer ID present:', !!actualCustomerId)

      // GATE 2: Associate customer with cart (BLOCKING with retries)
      const associateCustomerWithRetry = async (retries = 3): Promise<boolean> => {
        for (let attempt = 0; attempt <= retries; attempt++) {
          try {
            const response = await fetch('/api/checkout/customer/associate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                cartId: cart.id,
                customerId: actualCustomerId,
                email: (purchaseReady && identityMethod === 'email') ? email?.trim().toLowerCase() : undefined,
                phone: formData.contactNumber || phone || undefined
              }),
            })

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({ error: 'unknown' }))
              throw new Error(`Association failed: ${errorData.error || response.statusText}`)
            }

            const data = await response.json()
            if (data.fallback === true || data.ok === false) {
              throw new Error(`Association not completed: ${data.adminError || data.message || 'Backend association failed'}`)
            }

            return true
          } catch (error: any) {
            if (attempt < retries) {
              const delay = 500 * Math.pow(2, attempt)
              await new Promise(resolve => setTimeout(resolve, delay))
            } else {
              throw error
            }
          }
        }
        return false
      }

      try {
        await associateCustomerWithRetry(3)
      } catch (error: any) {
        console.error('[CASHFREE] Customer association failed:', error?.message)
        alert('Failed to link your account to the cart. Please refresh the page and try again.')
        setCashfreeLoading(false)
        return
      }

      // GATE 3: Verify customer association (BLOCKING)
      try {
        const { medusaApiClient } = await import('../../utils/medusaApiClient')
        const cartAfterAssociation = await medusaApiClient.getCart(cart.id)
        const verifiedCustomerId = (cartAfterAssociation as any).customer_id

        if (verifiedCustomerId !== actualCustomerId) {
          console.error('[CASHFREE] Cart verification failed: customer mismatch')
          alert('Cart verification failed. Please refresh the page and try again.')
          setCashfreeLoading(false)
          return
        }
      } catch (error: any) {
        console.error('[CASHFREE] Cart verification error:', error?.message)
        alert('Failed to verify cart. Please refresh the page and try again.')
        setCashfreeLoading(false)
        return
      }

      // 0) Prepare Medusa cart: update addresses/email, add shipping, initiate payment collection

      try {

        const { medusaApiClient } = await import('../../utils/medusaApiClient')



        // Derive shipping address and email (same logic as manual flow)

        const fullName = (formData.name || '').trim()

        const nameParts = fullName.split(/\s+/).filter(Boolean)

        const firstName = nameParts[0] || 'Customer'

        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : ''



        const digitsPhone = (formData.contactNumber || phone || '').toString().replace(/\D/g, '')

        const emailForCart = (purchaseReady && identityMethod === 'email' && (email || '').trim())

          ? (email || '').trim().toLowerCase()

          : undefined



        await medusaApiClient.updateCart(cart.id, {

          ...(emailForCart ? { email: emailForCart } : {}),

          shipping_address: {

            first_name: firstName,

            last_name: lastName,

            address_1: formData.address,

            city: formData.city,

            postal_code: formData.postalCode,

            province: formData.state,

            country_code: 'in',

            phone: digitsPhone || undefined,

          },

        })



        // Ensure at least one shipping method is attached

        let optionIdToUse = selectedShippingOptionId || null

        if (!optionIdToUse) {

          try {

            const options = await medusaApiClient.getShippingOptionsForCart(cart.id)

            const cheapest = (options || []).slice().sort((a: any, b: any) => Number(a.amount ?? 0) - Number(b.amount ?? 0))[0]

            if (cheapest) optionIdToUse = cheapest.id

          } catch { }

        }

        if (optionIdToUse) {

          try { await medusaApiClient.addShippingMethod(cart.id, optionIdToUse) } catch { }

        }



        // Initiate payment collection/sessions (v2 requirement)

        try { await medusaApiClient.createPaymentSessions(cart.id) } catch { }

      } catch (prepError) {
      }

      // Customer sync moved to AFTER Cashfree order creation (see line ~2797)



      // SECURITY: Validate prices before initiating payment

      try {

        const validationResponse = await fetch('/api/checkout/validate-pricing', {

          method: 'POST',

          headers: { 'Content-Type': 'application/json' },

          body: JSON.stringify({

            cartId: cart.id,

            selectedShippingOptionId: selectedShippingOptionId || undefined,

            clientTotal: total,

            clientShipping: effectiveShippingAmount,

            clientSubtotal: subtotal,

            clientTax: taxes

          })

        })



        const validationResult = await validationResponse.json()



        if (!validationResult.valid) {

          console.error('[CHECKOUT] Price validation failed', {

            cartId: cart.id,

            discrepancies: validationResult.discrepancies,

            serverPrices: validationResult.serverPrices,

            clientPrices: validationResult.clientPrices

          })



          alert(

            'Price validation failed. The cart prices may have changed. Please refresh the page and try again.'

          )

          setCashfreeLoading(false)

          return

        }



        console.log('[CHECKOUT] Price validation passed', {

          cartId: cart.id,

          serverTotal: validationResult.serverPrices.total

        })

      } catch (validationError) {

        console.error('[CHECKOUT] Price validation error', validationError)

        // SECURITY FIX C1: Fail closed — do not proceed if price validation cannot be performed
        // Server-side create-order also enforces this, but defense-in-depth is correct practice

        alert('Unable to verify prices. Please refresh the page and try again.')

        setCashfreeLoading(false)

        return

      }



      // Ensure two decimals for INR

      const orderAmount = Number(Number(total || 0).toFixed(2))



      const digitsPhone = (phone || '').replace(/\D/g, '')

      const emailToSend = (purchaseReady && identityMethod === 'email' && (email || '').trim())

        ? (email || '').trim().toLowerCase()

        : ''



      // SECURITY FIX H2: Order ID is now generated SERVER-SIDE with crypto.randomUUID()
      // No more predictable client-side Date.now() IDs
      const resp = await fetch('/api/create-order', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({

          orderAmount,

          cartId: cart.id,

          customer: {

            id: actualCustomerId || undefined,

            name: formData.name || 'Customer',

            email: emailToSend,

            phone: (formData.contactNumber || digitsPhone || '').toString()

          }

        })

      })

      const data = await resp.json().catch(() => ({}))

      // Use server-generated order ID
      const orderId = (data as any)?.order_id || (data as any)?.cf_order_id

      if (!resp.ok) {
        // Handle authentication errors specifically
        if (resp.status === 403 && data?.error === 'authentication_required') {
          setAuthModalMessage('You must verify your identity before making a payment. Please complete the Identity Verification section using OTP, Magic Link, or Login.')
          setAuthModalOpen(true)
          return
        }

        alert('Failed to create Cashfree order. Please try again.')

        return

      }

      // 0.5) Sync Customer Profile (CRITICAL FIX: Ensure name is updated before payment)
      // Moved here so orderId is available for complete audit trail
      if (actualCustomerId && formData.name) {
        try {
          const fullName = (formData.name || '').trim()
          const nameParts = fullName.split(/\s+/).filter(Boolean)
          const firstName = nameParts[0] || 'Customer'
          const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : ''

          console.log('[CASHFREE] Syncing customer profile before payment redirect:', { orderId })

          await fetch('/api/checkout/customer/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customerId: actualCustomerId,
              cartId: cart.id,
              orderId, // Now available - Cashfree order ID
              formData: {
                first_name: firstName,
                last_name: lastName,
                phone: formData.contactNumber || phone,
                address: {
                  address_1: formData.address,
                  city: formData.city,
                  postal_code: formData.postalCode,
                  province: formData.state,
                  country_code: 'in',
                  phone: formData.contactNumber || phone
                }
              },
              identityMethod: identityMethod === 'login' ? undefined : identityMethod,
              whatsapp_authenticated: identityMethod === 'phone',
              email_authenticated: identityMethod === 'email'
            })
          })
        } catch (syncError) {
          console.error('[CASHFREE] Customer sync failed:', syncError)
          // Non-blocking - continue to payment even if sync fails
        }
      }



      const paymentSessionId = (data as any)?.payment_session_id

      if (!paymentSessionId) {

        alert('No payment_session_id returned from server')

        return

      }



      // SECURITY FIX C7: Cart ID mapping is stored server-side in HMAC-signed mapping
      // No more client-side sessionStorage/localStorage (spoofable)



      const cashfree = (window as any).Cashfree({ mode: (process.env.NEXT_PUBLIC_CASHFREE_ENV as any) || 'sandbox' })

      cashfree.checkout({ paymentSessionId, redirectTarget: '_self' })


    } catch (e: any) {


      alert(e?.message || 'Cashfree payment failed to start')

    } finally {

      setCashfreeLoading(false)

    }

  }



  const goToOrderConfirmation = React.useCallback((orderId?: string) => {

    // Protection removed - backend guard handles duplicate prevention

    // Clean up form data since order was successful

    cleanupFormData()

    router.push(orderId ? `/order-confirmation?order_id=${encodeURIComponent(orderId)}` : '/order-confirmation')

  }, [router, clearCartSilently])



  // Handle form submission

  const handleSubmit = async (e: React.FormEvent) => {

    e.preventDefault();

    if (!cart || !cart.id || cartItems.length === 0) {


      return;

    }



    // Validate address before proceeding

    const addressValidation = validateIndianAddress({

      name: formData.name,

      address: formData.address,

      city: formData.city,

      state: formData.state,

      postalCode: formData.postalCode,

      contactNumber: formData.contactNumber

    });



    if (!addressValidation.valid) {

      // Set all errors

      const errorMap: Record<string, string> = {};

      addressValidation.errors.forEach((error) => {

        // Try to map errors to specific fields

        if (error.toLowerCase().includes('name')) errorMap.name = error;

        else if (error.toLowerCase().includes('address')) errorMap.address = error;

        else if (error.toLowerCase().includes('city')) errorMap.city = error;

        else if (error.toLowerCase().includes('state')) errorMap.state = error;

        else if (error.toLowerCase().includes('postal') || error.toLowerCase().includes('pin')) errorMap.postalCode = error;

        else if (error.toLowerCase().includes('phone') || error.toLowerCase().includes('contact')) errorMap.contactNumber = error;

      });



      setFormErrors(errorMap);



      // Show alert with first error

      alert(`Please fix the following errors:\n\n${addressValidation.errors.join('\n')}`);

      return;

    }



    // Show warnings if any (don't block submission)

    if (addressValidation.warnings.length > 0) {

      const proceed = confirm(

        `Warning:\n\n${addressValidation.warnings.join('\n')}\n\nDo you want to proceed anyway?`

      );

      if (!proceed) return;

    }

    if ((cart as any)?.completed_at) {

      // If the cart is already completed, attempt to route to the thank-you page instead of clearing

      try {

        // Prefer previously stored order result

        const raw = sessionStorage.getItem('order_result')

        if (raw) {

          const parsed = JSON.parse(raw)

          if (parsed?.orderId) {

            goToOrderConfirmation(parsed.orderId)

            return

          }

        }

      } catch { }



      // If we have a verified customer, fetch their latest order and route there

      try {

        if (customerId) {

          const res = await fetch(`/api/account/orders`)

          const data = await res.json().catch(() => ({}))

          const orders = Array.isArray(data?.orders) ? data.orders : []

          if (orders.length > 0) {

            // Pick the most recent order by created_at

            orders.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())

            const latest = orders[0]

            if (latest?.id) {

              try {

                sessionStorage.setItem('order_result', JSON.stringify({ orderId: latest.id, displayId: latest.display_id, timestamp: Date.now() }))

              } catch { }

              goToOrderConfirmation(latest.id)

              return

            }

          }

        }

      } catch { }



      // Fallback: route without id and let the page use snapshot/cart

      goToOrderConfirmation()

      return

    }

    // For authenticated users, we can set purchaseReady to true immediately

    if (status === 'authenticated' && !purchaseReady) {

      setPurchaseReady(true);

      // Don't show alert for authenticated users

      // Continue with checkout process

    }



    // Update the check that prevents submission

    if (!isReadyToPay) {
      setAuthModalMessage('Please verify your identity to continue. Use phone OTP or email magic link in the Identity Verification section.')
      setAuthModalOpen(true)

      return

    }



    // If Cashfree is selected, redirect to hosted checkout instead of manual payment

    if (paymentMethod === 'cashfree') {

      await handleCashfreePay()

      return

    }



    // Orchestrate checkout using backend (cheapest shipping, manual payment)

    try {

      // Persist a lightweight snapshot before we finalize, so the thank-you page can render even if order fetch lags

      try {

        const ttlMs = 10 * 60 * 1000

        const snapshot = {

          data: {

            items: cartItems,

            totals: {

              subtotal,

              shipping: Number(effectiveShippingAmount || 0),

              taxes,

              total,

            },

            customer: {

              name: formData.name,

              contactNumber: formData.contactNumber,

              address: formData.address,

              city: formData.city,

              state: formData.state,

              postalCode: formData.postalCode,

            },

            shippingSelection: {

              optionId: selectedShippingOptionId,

              amount: Number(effectiveShippingAmount || 0),

            },

          },

          expiresAt: Date.now() + ttlMs,

        }

        sessionStorage.setItem('order_checkout_snapshot', JSON.stringify(snapshot))

      } catch { }



      // Derive placeholder email when using phone verification

      const placeholderEmailForPhone = (identityMethod === 'phone' && phone.trim()) ? `${phone.replace(/\D/g, '')}@guest.local` : undefined;



      // Debug: Log checkout data before processing




      const result = await processCheckout({

        cartId: cart.id,

        // Pass customer ID for sync

        customerId: customerId || undefined,

        // Pass the identity method used for authentication

        identityMethod: identityMethod === 'login' ? undefined : identityMethod,

        cartUpdate: {

          email: (purchaseReady && identityMethod === 'email' && email.trim())

            ? email.trim().toLowerCase()

            : placeholderEmailForPhone,

          // Email is optional in the current form; if needed, add an email field later

          shipping_address: (() => {

            // Parse single name field into first_name and last_name

            const fullName = (formData.name || '').trim()

            const nameParts = fullName.split(/\s+/).filter(Boolean)

            const firstName = nameParts[0] || 'Customer'

            const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : ''



            return {

              first_name: firstName,

              last_name: lastName,

              address_1: formData.address,

              city: formData.city,

              postal_code: formData.postalCode,

              province: formData.state,

              country_code: 'in',

              phone: formData.contactNumber || undefined,

            }

          })(),

        },

        // Checkout form data for customer sync

        checkoutFormData: (() => {

          // Parse single name field into first_name and last_name

          const fullName = (formData.name || '').trim()

          const nameParts = fullName.split(/\s+/).filter(Boolean)

          const firstName = nameParts[0] || 'Customer'

          const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : ''



          return {

            first_name: firstName,

            last_name: lastName,

            phone: formData.contactNumber || '',

            address: {

              address_1: formData.address,

              city: formData.city,

              postal_code: formData.postalCode,

              province: formData.state,

              country_code: 'in',

              phone: formData.contactNumber,

            },

          }

        })(),

        strategy: 'cheapest',

        useManualPayment: true,

        selectedShippingAmount: effectiveShippingAmount,

        selectedOptionIds: selectedShippingOptionId ? [selectedShippingOptionId] : [],

      });



      if (result.success && result.order) {

        // Persist lightweight result and redirect immediately to thanks page

        try {

          sessionStorage.setItem('order_result', JSON.stringify({

            orderId: result.order.id,

            displayId: result.order.display_id,

            timestamp: Date.now(),

          }));

        } catch { }

        // Set protection first to prevent races, then navigate

        goToOrderConfirmation(result.order.id);



        // Fire-and-forget post-purchase side effects without blocking navigation

        setTimeout(async () => {

          // Customer sync is now handled by the checkout orchestrator




          // 2) Programmatic sign-in

          try {

            const identifierValue = (identityMethod === 'email')

              ? (email || '').trim().toLowerCase()

              : (phone || '').trim()



            // Store customerId in sessionStorage for passkey detection

            if (customerId) {

              try {

                await setCustomerIdHybrid(customerId);

              } catch (storageError) {

                console.error('[Checkout] Failed to set customer ID:', storageError);

              }

            }



            import('next-auth/react').then(({ signIn }) => {

              signIn('session', { identifier: identifierValue, customerId: customerId || undefined, redirect: false })

                .then(() => { })

                .catch(() => { })

            }).catch(() => { })

          } catch { }

        }, 0)



        return;

      }



      // Fallbacks when checkout fails

      // Handle authentication errors
      if (result.error?.message?.includes('authentication_required') ||
        result.error?.message?.includes('identity verification')) {
        setAuthModalMessage('You must verify your identity before placing an order. Please complete the Identity Verification section using OTP, Magic Link, or Login.')
        setAuthModalOpen(true)
        return
      }

      if (result.error?.step === 'cart-completed') {

        // Attempt to recover latest order and route to thank-you

        try {

          if (customerId) {

            const res = await fetch(`/api/account/orders`)

            const data = await res.json().catch(() => ({}))

            const orders = Array.isArray(data?.orders) ? data.orders : []

            if (orders.length > 0) {

              orders.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())

              const latest = orders[0]

              if (latest?.id) {

                try {

                  sessionStorage.setItem('order_result', JSON.stringify({ orderId: latest.id, displayId: latest.display_id, timestamp: Date.now() }))

                } catch { }

                goToOrderConfirmation(latest.id)

                return

              }

            }

          }

        } catch { }

        // As a last resort, route without id so the page uses the snapshot/cart

        goToOrderConfirmation()

        return

      }

      try {

        const msg = String(result.error?.message || '').toLowerCase()

        if (msg.includes('idempotency')) { }

      } catch { }



      // General recovery attempt: try to locate a recent order for this verified customer and navigate

      try {

        if (customerId) {

          const res = await fetch(`/api/account/orders`)

          const data = await res.json().catch(() => ({}))

          const orders = Array.isArray(data?.orders) ? data.orders : []

          if (orders.length > 0) {

            orders.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())

            const latest = orders[0]

            if (latest?.id) {

              try {

                sessionStorage.setItem('order_result', JSON.stringify({ orderId: latest.id, displayId: latest.display_id, timestamp: Date.now() }))

              } catch { }

              goToOrderConfirmation(latest.id)

              return

            }

          }

        }

      } catch { }



      // As a final fallback, route to thank-you without id so snapshot renders

      goToOrderConfirmation()

      return

    } catch (error: any) {


      alert(error?.message || 'Unexpected error during checkout');

    }

  };



  // Handle "Verify Now" button click in auth modal - scroll to identity verification section
  const handleScrollToVerification = () => {
    if (identityVerificationRef.current) {
      identityVerificationRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      })
      // Add a subtle highlight effect
      identityVerificationRef.current.style.transition = 'box-shadow 0.3s ease'
      identityVerificationRef.current.style.boxShadow = '0 0 0 4px rgba(220, 38, 38, 0.2)'
      setTimeout(() => {
        if (identityVerificationRef.current) {
          identityVerificationRef.current.style.boxShadow = 'none'
        }
      }, 2000)
    } else {
      // If identity verification section is not visible (e.g., user is authenticated but session expired),
      // refresh the page to show the section or redirect to login
      window.location.reload()
    }
  }

  // Handle login submission

  const handleLoginSubmit = async () => {

    try {

      console.log('[Checkout Login] Starting login process')

      setIdentityError(null)

      // Force immediate render so loading screen appears before async work
      flushSync(() => {
        setLoginProcessing(true)
        setLoginStatusText('Checking your credentials...')
      })

      if (!loginIdentifier.trim()) {

        setIdentityError('Please enter your email or phone number')

        return

      }



      const identifier = loginIdentifier.trim()

      const isEmail = identifier.includes('@')

      console.log('[Checkout Login] Identifier:', identifier, 'isEmail:', isEmail)



      // Check if user has a passkey registered

      const policyRes = await fetch('/api/auth/passkey/policy', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify(isEmail ? { email: identifier } : { phone: identifier })

      })



      const policy = await policyRes.json().catch(() => ({}))

      console.log('[Checkout Login] Passkey policy:', policy)



      // If user has a passkey, attempt passkey authentication first

      if (policyRes.ok && policy?.hasPasskey) {

        // Check if platform authenticator is available

        const isAvailable = (window as any).PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable

        if (typeof isAvailable === 'function') {

          const available = await isAvailable()

          console.log('[Checkout Login] Platform authenticator available:', available)

          if (available) {
            setLoginStatusText('Authenticating with passkey...')
            // Fetch passkey request options

            const optionsRes = await fetch('/api/auth/passkey/options', {

              method: 'POST',

              headers: { 'Content-Type': 'application/json' },

              body: JSON.stringify(isEmail ? { email: identifier } : { phone: identifier })

            })



            if (optionsRes.ok) {

              const { options, userId: canonicalUserId } = await optionsRes.json()

              console.log('[Checkout Login] Got passkey options, userId:', canonicalUserId)



              // Use the authenticate function from the hook

              const { data, error } = await authenticate(options)

              console.log('[Checkout Login] Authenticate result - error:', error, 'data:', !!data)



              if (!error && data) {
                setLoginStatusText('Verifying your identity...')
                // Verify passkey assertion

                const verifyRes = await fetch('/api/auth/passkey/verify', {

                  method: 'POST',

                  headers: { 'Content-Type': 'application/json' },

                  body: JSON.stringify({

                    ...data,

                    userId: canonicalUserId,

                    ...(isEmail ? { email: identifier } : { phone: identifier })

                  })

                })



                const verifyResult = await verifyRes.json().catch(() => ({}))

                console.log('[Checkout Login] Verify result:', verifyResult, 'status:', verifyRes.status)



                if (verifyRes.ok) {
                  setLoginStatusText('Setting up your account...')
                  // Successful passkey authentication (proceed even if comboRequired for checkout flow)

                  // Ensure customer exists (same as login page)

                  const checkoutVerifyRes = await fetch('/api/account/customer/ensure', {

                    method: 'POST',

                    headers: { 'Content-Type': 'application/json' },

                    body: JSON.stringify(isEmail ? { email: identifier } : { phone: identifier })

                  })



                  const checkoutVerifyResult = await checkoutVerifyRes.json().catch(() => ({}))

                  console.log('[Checkout Login] Customer ensure result:', checkoutVerifyResult)



                  if (checkoutVerifyRes.ok && checkoutVerifyResult?.customerId) {

                    const customerIdValue = String(checkoutVerifyResult.customerId || '')

                    setCustomerId(customerIdValue)

                    // Store customerId in sessionStorage for passkey detection

                    try {

                      await setCustomerIdHybrid(customerIdValue);

                    } catch (storageError) {

                      console.error('[Checkout] Failed to set customer ID:', storageError);

                    }

                    setPurchaseReady(true)



                    setLoginStatusText('Creating your session...')
                    // Sign in with NextAuth session (same as login page but no redirect)

                    const { signIn } = await import('next-auth/react')

                    await signIn('session', {

                      identifier: identifier,

                      customerId: customerIdValue,

                      hasPasskey: true,

                      redirect: false

                    })



                    setIdentityError('✅ Login successful with passkey!')

                    return

                  } else {

                    throw new Error('Failed to get customer information')

                  }

                } else {

                  throw new Error('Passkey verification failed')

                }

              } else {

                throw new Error('Passkey authentication cancelled or failed')

              }

            } else {

              throw new Error('Failed to get passkey options')

            }

          } else {

            throw new Error('Passkey not available on this device')

          }

        }

      } else {
        // No passkey registered - show OTP/email forms
        if (isEmail) {
          setEmail(identifier)
          setIdentityMethod('email')
        } else {
          setPhone(identifier)
          setIdentityMethod('phone')
        }
        return
      }

    } catch (e: any) {

      console.error('[Checkout Login] Error:', e)

      setIdentityError(e?.message || 'Login failed. Please try again.')

      setPurchaseReady(false)

      setCustomerId(null)

    } finally {

      setLoginProcessing(false)

    }

  }



  // Loading or empty cart states - prevent proceeding with no items

  if (loading || magicLinkProcessing) {

    return (

      <div

        className="relative flex size-full min-h-screen flex-col bg-white overflow-x-hidden"

        style={{ fontFamily: '"Inter", "Public Sans", "Noto Sans", sans-serif' }}

      >

        <div className="layout-container flex h-full grow flex-col">

          <div className="w-full pt-16 sm:pt-20 md:pt-24 lg:pt-28 pb-8 sm:pb-12 md:pb-16">

            <div className={styles.container}>

              <h1 className={styles.title}>Checkout</h1>

              <div className="text-gray-600">

                {magicLinkProcessing ? 'Processing magic link verification...' : 'Loading your cart...'}

              </div>

            </div>

          </div>

        </div>

      </div>

    );

  }



  // Check if cart is empty

  if (!cart || cartItems.length === 0) {

    return (

      <div

        className="relative flex size-full min-h-screen flex-col bg-white overflow-x-hidden"

        style={{ fontFamily: '"Inter", "Public Sans", "Noto Sans", sans-serif' }}

      >

        <div className="layout-container flex h-full grow flex-col">

          <div className="w-full pt-16 sm:pt-20 md:pt-24 lg:pt-28 pb-8 sm:pb-12 md:pb-16">

            <div className={styles.container}>

              <h1 className={styles.title}>Checkout</h1>

              <div>

                {cart && (cart as any)?.completed_at ? (

                  <>

                    <div className="text-gray-600 mb-4">This cart has already been processed.</div>

                    <div className="flex gap-2">

                      <button

                        className={styles.placeOrderButton}

                        onClick={() => {

                          // Attempt to recover by finding the latest order for this customer

                          if (customerId) {

                            fetch(`/api/account/orders`)

                              .then(res => res.json())

                              .then(data => {

                                const orders = Array.isArray(data?.orders) ? data.orders : []

                                if (orders.length > 0) {

                                  // Sort by created_at descending

                                  orders.sort((a: any, b: any) =>

                                    new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()

                                  )

                                  const latest = orders[0]

                                  if (latest?.id) {

                                    router.push(`/order-confirmation?order_id=${encodeURIComponent(latest.id)}`)

                                  }

                                }

                              })

                              .catch(() => {

                                router.push('/order-confirmation')

                              })

                          } else {

                            router.push('/order-confirmation')

                          }

                        }}

                      >

                        Retry Cart Recovery

                      </button>

                      <Link href="/products">

                        <button className={styles.placeOrderButton}>Browse Products</button>

                      </Link>

                    </div>

                  </>

                ) : (

                  <>

                    <div className="text-gray-600">Your cart is empty.</div>

                    <Link href="/products">

                      <button className={styles.placeOrderButton}>Browse Products</button>

                    </Link>

                  </>

                )}

              </div>

            </div>

          </div>

        </div>

      </div>

    );

  }



  return (

    <div

      className="relative flex size-full min-h-screen flex-col bg-white overflow-x-hidden"
      style={{ paddingTop: '100px', fontFamily: '"Inter", "Public Sans", "Noto Sans", sans-serif' }}

    >

      <Script

        src="https://sdk.cashfree.com/js/v3/cashfree.js"

        strategy="afterInteractive"

        onLoad={() => setCashfreeSdkLoaded(true)}

      />

      <div className="layout-container flex h-full grow flex-col">

        {/* Header is now in root layout - progress bar feature removed to avoid state management complexity */}



        <div className="w-full pt-16 sm:pt-20 md:pt-24 lg:pt-28 pb-8 sm:pb-12 md:pb-16">

          <div className={styles.container}>

            {/* Breadcrumb Navigation */}

            <div className={styles.breadcrumb}>

              <Link href="/">Home</Link>

              <span> / </span>

              <span>Checkout</span>

            </div>



            <h1 className={styles.title}>Checkout</h1>



            <form onSubmit={handleSubmit}>



              {/* Shipping Information Section */}

              <div className={styles.section}>

                <h2 className={styles.sectionTitle}>Shipping Information</h2>

                {/* Original progress bar that will be replaced by sticky one when scrolled */}

                <div className={styles.formDivider} ref={progressBarRef}>

                  <div

                    className={styles.formDividerProgress}

                    style={{ width: `${formProgress}%` }}

                  ></div>

                </div>



                <div className={styles.formGroup}>

                  <label htmlFor="name" className={styles.label}>Name</label>

                  <input

                    type="text"

                    id="name"

                    name="name"

                    className={`${styles.input} ${formErrors.name ? styles.inputError : ''}`}

                    value={formData.name}

                    onChange={handleInputChange}

                    onBlur={handleFieldBlur}

                    placeholder="Enter your name"

                    required

                  />

                  {formErrors.name && (

                    <div className={styles.fieldError}>{formErrors.name}</div>

                  )}

                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="address" className={styles.label}>Address</label>
                  <input
                    type="text"
                    id="address"
                    name="address"
                    className={`${styles.input} ${formErrors.address ? styles.inputError : ''}`}
                    value={formData.address}
                    onChange={handleInputChange}
                    onBlur={handleFieldBlur}
                    placeholder="Enter your address"
                    required
                  />
                  {formErrors.address && (
                    <div className={styles.fieldError}>{formErrors.address}</div>
                  )}
                </div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="city" className={styles.label}>City</label>
                    <input
                      type="text"
                      id="city"
                      name="city"
                      className={`${styles.input} ${formErrors.city ? styles.inputError : ''}`}
                      value={formData.city}
                      onChange={handleInputChange}
                      onBlur={handleFieldBlur}
                      placeholder="Enter your city"
                      required
                    />
                    {formErrors.city && (
                      <div className={styles.fieldError}>{formErrors.city}</div>
                    )}
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="state" className={styles.label}>State</label>
                    <input
                      type="text"
                      id="state"
                      name="state"
                      className={`${styles.input} ${formErrors.state ? styles.inputError : ''}`}
                      value={formData.state}
                      onChange={handleInputChange}
                      onBlur={handleFieldBlur}
                      placeholder="Enter your state"
                      required
                    />
                    {formErrors.state && (
                      <div className={styles.fieldError}>{formErrors.state}</div>
                    )}
                  </div>
                </div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="postalCode" className={styles.label}>Postal Code</label>
                    <input
                      type="text"
                      id="postalCode"
                      name="postalCode"
                      className={`${styles.input} ${formErrors.postalCode ? styles.inputError : ''}`}
                      value={formData.postalCode}
                      onChange={handleInputChange}
                      onBlur={handleFieldBlur}
                      placeholder="Enter your postal code"
                      required
                    />
                    {formErrors.postalCode && (
                      <div className={styles.fieldError}>{formErrors.postalCode}</div>
                    )}
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="contactNumber" className={styles.label}>Contact Number</label>
                    <input
                      type="text"
                      id="contactNumber"
                      name="contactNumber"
                      className={`${styles.input} ${formErrors.contactNumber ? styles.inputError : ''}`}
                      value={formData.contactNumber}
                      onChange={handleInputChange}
                      onBlur={handleFieldBlur}
                      placeholder="Enter your contact number"
                      required
                    />
                    {formErrors.contactNumber && (
                      <div className={styles.fieldError}>{formErrors.contactNumber}</div>
                    )}
                  </div>
                </div>
              </div>
              {/* Shipping Method Section */}
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Shipping Method</h2>
                <div className={styles.shippingOptions}>
                  {(shippingOptions || []).map((opt) => (
                    <div key={opt.id} className={styles.shippingOption}>
                      <input
                        type="radio"
                        id={`ship_${opt.id}`}
                        name="shippingOptionId"
                        value={opt.id}
                        checked={selectedShippingOptionId === opt.id}
                        onChange={handleShippingOptionIdChange}
                        className={styles.radioInput}
                      />
                      <label htmlFor={`ship_${opt.id}`} className={styles.radioLabel}>
                        <div className={styles.shippingOptionDetails}>
                          <div className={styles.shippingOptionName}>
                            {opt.name || 'Shipping'}{opt.estimate ? ` (${opt.estimate})` : ''}
                          </div>
                          <div className={styles.shippingOptionPrice}>
                            {opt.amount > 0 ?
                              new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(Number(opt.amount))
                              : 'Free'}
                          </div>
                        </div>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              {/* Payment Information Section */}
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Payment Information</h2>
                <div className={styles.paymentOptions}>
                  <div className={styles.paymentOption}>
                    <input
                      type="radio"
                      id="creditCard"
                      name="paymentMethod"
                      value="creditCard"
                      checked={paymentMethod === 'creditCard'}
                      onChange={handlePaymentMethodChange}
                      className={styles.radioInput}
                    />
                    <label htmlFor="creditCard" className={styles.radioLabel}>
                      Credit Card
                    </label>
                  </div>
                  <div className={styles.paymentOption}>
                    <input
                      type="radio"
                      id="paypal"
                      name="paymentMethod"
                      value="paypal"
                      checked={paymentMethod === 'paypal'}
                      onChange={handlePaymentMethodChange}
                      className={styles.radioInput}
                    />
                    <label htmlFor="paypal" className={styles.radioLabel}>
                      PayPal
                    </label>
                  </div>
                  <div className={styles.paymentOption}>
                    <input
                      type="radio"
                      id="upi"
                      name="paymentMethod"
                      value="upi"
                      checked={paymentMethod === 'upi'}
                      onChange={handlePaymentMethodChange}
                      className={styles.radioInput}
                    />
                    <label htmlFor="upi" className={styles.radioLabel}>
                      UPI
                    </label>
                  </div>
                  <div className={styles.paymentOption}>
                    <input
                      type="radio"
                      id="cashfree"
                      name="paymentMethod"
                      value="cashfree"
                      checked={paymentMethod === 'cashfree'}
                      onChange={handlePaymentMethodChange}
                      className={styles.radioInput}
                    />
                    <label htmlFor="cashfree" className={styles.radioLabel}>
                      Cashfree (Hosted Checkout)
                    </label>
                  </div>
                </div>
                {paymentMethod === 'creditCard' && (
                  <div className={styles.paymentDetails}>
                    <div className={styles.formGroup}>
                      <label htmlFor="cardNumber" className={styles.label}>Card Number</label>
                      <input
                        type="text"
                        id="cardNumber"
                        name="cardNumber"
                        className={styles.input}
                        value={paymentDetails.cardNumber}
                        onChange={handlePaymentDetailsChange}
                        placeholder="Enter card number"
                        required
                      />
                    </div>
                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label htmlFor="expiryDate" className={styles.label}>Expiration Date</label>
                        <input
                          type="text"
                          id="expiryDate"
                          name="expiryDate"
                          className={styles.input}
                          value={paymentDetails.expiryDate}
                          onChange={handlePaymentDetailsChange}
                          placeholder="MM/YY"
                          required
                        />
                      </div>
                      <div className={styles.formGroup}>
                        <label htmlFor="cvv" className={styles.label}>CVV</label>
                        <input
                          type="text"
                          id="cvv"
                          name="cvv"
                          className={styles.input}
                          value={paymentDetails.cvv}
                          onChange={handlePaymentDetailsChange}
                          placeholder="Enter CVV"
                          required
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* Identity Verification Section - hide after successful verification or auth */}
              {status !== 'authenticated' && !purchaseReady && (
                <div ref={identityVerificationRef} className={styles.section}>
                  <h2 className={styles.sectionTitle}>Identity Verification</h2>
                  {identityError && (
                    <div className={`mb-3 p-3 rounded-md ${identityError.startsWith('✅') ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                      {identityError}
                    </div>
                  )}
                  <div className={styles.paymentOptions}>
                    <div className={styles.paymentOption}>
                      <input
                        type="radio"
                        id="identity_login"
                        name="identityMethod"
                        value="login"
                        checked={identityMethod === 'login'}
                        onChange={() => onIdentityMethodChange('login')}
                        className={styles.radioInput}
                      />
                      <label htmlFor="identity_login" className={styles.radioLabel}>Login - Log in if you have already account</label>
                    </div>
                    <div className={styles.paymentOption}>
                      <input
                        type="radio"
                        id="identity_phone"
                        name="identityMethod"
                        value="phone"
                        checked={identityMethod === 'phone'}
                        onChange={() => onIdentityMethodChange('phone')}
                        className={styles.radioInput}
                      />
                      <label htmlFor="identity_phone" className={styles.radioLabel}>WhatsApp Phone</label>
                    </div>
                    <div className={styles.paymentOption}>
                      <input
                        type="radio"
                        id="identity_email"
                        name="identityMethod"
                        value="email"
                        checked={identityMethod === 'email'}
                        onChange={() => onIdentityMethodChange('email')}
                        className={styles.radioInput}
                      />
                      <label htmlFor="identity_email" className={styles.radioLabel}>Email</label>
                    </div>
                  </div>
                  {identityMethod === 'login' ? (
                    <div>
                      <div className={styles.formGroup}>
                        <label htmlFor="loginIdentifier" className={styles.label}>Email or Phone Number</label>
                        <input
                          type="text"
                          id="loginIdentifier"
                          name="loginIdentifier"
                          className={styles.input}
                          value={loginIdentifier}
                          onChange={(e) => setLoginIdentifier(e.target.value)}
                          placeholder="Enter your email or phone number"
                          autoComplete="username webauthn"
                        />
                      </div>
                      <div className="flex gap-2 mb-2">
                        <button
                          type="button"
                          className={styles.placeOrderButton}
                          onClick={handleLoginSubmit}
                          disabled={loginProcessing || !loginIdentifier.trim()}
                        >
                          Login
                        </button>
                      </div>
                    </div>
                  ) : identityMethod === 'phone' ? (
                    <div>
                      <div className={styles.formGroup}>
                        <label htmlFor="phone" className={styles.label}>Phone Number (WhatsApp)</label>
                        <input
                          type="text"
                          id="phone"
                          name="phone"
                          className={styles.input}
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="e.g., +1 555 123 4567"
                        />
                      </div>
                      <div className="flex gap-2 mb-2">
                        <button type="button" className={styles.placeOrderButton} onClick={sendOtp} disabled={otpSending || !phone.trim()}>
                          {otpSending ? 'Sending...' : (otpSent ? 'Resend OTP' : 'Send OTP')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className={styles.formGroup}>
                        <label htmlFor="email" className={styles.label}>Email</label>
                        <input
                          type="email"
                          id="email"
                          name="email"
                          className={styles.input}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                        />
                      </div>
                      <div className="flex gap-2 mb-2">
                        <button type="button" className={styles.placeOrderButton} onClick={sendMagic} disabled={magicSending || !email.trim()}>
                          {magicSending ? 'Sending...' : (magicSent ? 'Resend Magic Link' : 'Send Magic Link')}
                        </button>
                      </div>
                      {magicSent && !magicVerified && (
                        <div className="text-gray-600">We sent a link to your email. Click it and return here; we are checking every few seconds...</div>
                      )}
                      {magicVerified && (
                        <div className="text-green-600">Email verified.</div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {/* Order Summary Section */}
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Order Summary</h2>
                {/* Order items */}
                <div className={styles.orderItems}>
                  {cartItems.map(item => (
                    <div key={item.id} className={styles.orderItem}>
                      <div className={styles.orderItemDetails}>
                        <img
                          src={(item?.thumbnail ?? item?.variant?.product?.thumbnail ?? '/placeholder-image.jpg')}
                          alt={(item?.title ?? 'Cart item')}
                          className={styles.orderItemImage}
                        />
                        <div>
                          <p className={styles.orderItemName}>{item?.title ?? 'Item'}</p>
                          <p className={styles.orderItemQuantity}>Quantity: {item.quantity}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Price summary */}
                <div className={styles.priceSummary}>
                  <div className={styles.summaryRow}>
                    <span className={styles.summaryLabel}>Subtotal</span>
                    <span className={styles.summaryValue}>{PriceCalculationService.formatCurrency(subtotal, cart?.currency_code)}</span>
                  </div>
                  <div className={styles.summaryRow}>
                    <span className={styles.summaryLabel}>Shipping</span>
                    <span className={styles.summaryValue}>{shipping}</span>
                  </div>
                  <div className={styles.summaryRow}>
                    <span className={styles.summaryLabel}>Taxes</span>
                    <span className={styles.summaryValue}>{PriceCalculationService.formatCurrency(taxes, cart?.currency_code)}</span>
                  </div>
                  <div className={styles.totalRow}>
                    <span className={styles.totalLabel}>Total</span>
                    <span className={styles.totalValue}>{PriceCalculationService.formatCurrency(total, cart?.currency_code)}</span>
                  </div>
                </div>
                {/* Verification status near payment button */}
                {status !== 'authenticated' && !purchaseReady && magicSent && (
                  <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, fontSize: 14, lineHeight: 1.5, background: magicVerified ? '#f0fff4' : '#fffff0', border: `1px solid ${magicVerified ? '#c6f6d5' : '#fefcbf'}`, color: magicVerified ? '#276749' : '#744210' }}>
                    {magicVerified
                      ? 'Email verified — setting up your account...'
                      : 'We sent a verification link to your email. Click it and return here — we check every few seconds.'}
                  </div>
                )}
                {paymentMethod === 'cashfree' ? (
                  <button
                    type="button"
                    className={styles.placeOrderButton}
                    onClick={handleCashfreePay}
                    disabled={!cashfreeSdkLoaded || cashfreeLoading}
                  >
                    Secure Payment – {PriceCalculationService.formatCurrency(total, cart?.currency_code)}
                  </button>
                ) : (
                  <button
                    type="submit"
                    className={styles.placeOrderButton}
                    disabled={!isReadyToPay}
                  >
                    Place Order
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Authentication Required Modal */}
      <AuthRequiredModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onVerifyNow={handleScrollToVerification}
        message={authModalMessage}
      />

      {/* OTP Modal */}
      <LoadingScreen
        show={loginProcessing}
        statusText={loginStatusText}
        imagesFolder="/loading-animations"
        shaderEffect="smoke"
      />
      {showOtpModal && (
        <div className={loginStyles.modalOverlay}>
          <div className={loginStyles.modal}>
            <div className={loginStyles.modalHeader}>
              <h2 className={loginStyles.modalTitle}>Verify with WhatsApp OTP</h2>
              <p className={loginStyles.modalDescription}>A 6-digit code has been sent to your WhatsApp number.</p>
            </div>
            <div className={loginStyles.otpInputContainer}>
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <input
                  key={index}
                  ref={(el) => { otpInputRefs.current[index] = el }}
                  className={loginStyles.otpInput}
                  maxLength={1}
                  type="text"
                  inputMode="numeric"
                  autoFocus={index === 0}
                  value={otpCode[index] || ''}
                  onChange={(e) => handleOtpInputChange(index, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(index, e)}
                />
              ))}
            </div>
            <button
              className={loginStyles.verifyBtn}
              onClick={verifyOtp}
              disabled={otpVerifying || otpCode.length !== 6}
            >
              {otpVerifying ? 'Verifying...' : 'Verify'}
            </button>
            <div className={loginStyles.modalActions}>
              <button
                className={loginStyles.modalLink}
                onClick={sendOtp}
                disabled={otpSending}
              >
                {otpSending ? 'Sending...' : 'Resend OTP'}
              </button>
              <button
                className={loginStyles.modalLink}
                onClick={() => {
                  setShowOtpModal(false)
                  setOtpCode('')
                }}
              >
                Change Number
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




