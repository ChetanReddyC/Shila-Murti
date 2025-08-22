'use client';

import React, { useState, useEffect, useRef } from 'react';
import Header from '../../components/Header';
import styles from './checkoutPage.module.css';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '../../contexts/CartContext';
import { processCheckout } from '../../utils/checkoutOrchestrator';

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, loading, refreshCart, clearCart, setOrderConfirmationProtection, clearCartSilently } = useCart();

  // Ensure we have fresh cart data when entering checkout
  useEffect(() => {
    refreshCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Shipping method selection is driven by backend option ids

  // Payment method state
  const [paymentMethod, setPaymentMethod] = useState('creditCard');
  
  // Payment details
  const [paymentDetails, setPaymentDetails] = useState({
    cardNumber: '',
    expiryDate: '',
    cvv: ''
  });

  // Identity method and state (Task 2)
  const [identityMethod, setIdentityMethod] = useState<'phone' | 'email'>('phone')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [identityError, setIdentityError] = useState<string | null>(null)

  // OTP flow state
  const [otpSending, setOtpSending] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpVerifying, setOtpVerifying] = useState(false)

  // Magic link flow state
  const [magicSending, setMagicSending] = useState(false)
  const [magicSent, setMagicSent] = useState(false)
  const [magicVerified, setMagicVerified] = useState(false)
  const magicPollTimerRef = useRef<any>(null)

  // Purchase readiness gate
  const [purchaseReady, setPurchaseReady] = useState(false)
  const [customerId, setCustomerId] = useState<string | null>(null)
  // Persist readiness across refresh with a short TTL (5 minutes)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('checkout_identity')
      if (raw) {
        const data = JSON.parse(raw)
        if (data && data.expiresAt && data.expiresAt > Date.now()) {
          setPurchaseReady(Boolean(data.purchaseReady))
          setCustomerId(data.customerId || null)
          if (typeof data.identityMethod === 'string') setIdentityMethod(data.identityMethod)
          if (typeof data.phone === 'string') setPhone(data.phone)
          if (typeof data.email === 'string') setEmail(data.email)
        } else {
          sessionStorage.removeItem('checkout_identity')
        }
      }
    } catch {}
  }, [])
  useEffect(() => {
    try {
      const ttlMs = 5 * 60 * 1000
      const blob = {
        purchaseReady,
        customerId,
        identityMethod,
        phone,
        email,
        expiresAt: Date.now() + ttlMs,
      }
      sessionStorage.setItem('checkout_identity', JSON.stringify(blob))
    } catch {}
  }, [purchaseReady, customerId, identityMethod, phone, email])

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

  // Helpers for currency formatting (INR as per cart page)
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(Number(amount || 0));
  };

  const subtotal = Number(cart?.subtotal ?? 0);
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
        console.warn('[Checkout] Failed to load shipping options', e)
      }
    }
    load()
  }, [cart?.id])

  // Use the backend option amount when we have a selected option; fallback to backend shipping_total
  const selectedOptionAmount = (() => {
    const found = shippingOptions.find((o) => o.id === selectedShippingOptionId)
    return typeof found?.amount === 'number' ? Number(found.amount) : undefined
  })()
  const effectiveShippingAmount = typeof selectedOptionAmount === 'number' ? selectedOptionAmount : backendShippingAmount

  const shipping = effectiveShippingAmount > 0 ? formatCurrency(effectiveShippingAmount) : 'Free';
  const taxes = Number(cart?.tax_total ?? 0);

  // Always compute total on the client to reflect selected shipping immediately
  const total = subtotal + effectiveShippingAmount + taxes;

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
  const onIdentityMethodChange = (method: 'phone' | 'email') => {
    setIdentityMethod(method)
    setIdentityError(null)
    setOtpSending(false)
    setOtpSent(false)
    setOtpCode('')
    setOtpVerifying(false)
    setMagicSending(false)
    setMagicSent(false)
    setMagicVerified(false)
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
    } catch (e: any) {
      setIdentityError(e?.message || mapIdentityError('otp-send'))
    } finally {
      setOtpSending(false)
    }
  }

  // Verify OTP, then checkout-verify
  const verifyOtp = async () => {
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
      const cr = await fetch('/api/auth/session/checkout/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, cartId: cart.id })
      })
      const cj = await cr.json().catch(() => ({}))
      if (!cr.ok || cj?.ok !== true) {
        throw new Error(mapIdentityError('checkout-verify', cj?.error, cr.status))
      }
      setCustomerId(String(cj.customerId || ''))
      setPurchaseReady(true)
    } catch (e: any) {
      setIdentityError(e?.message || mapIdentityError('otp-verify'))
      setPurchaseReady(false)
      setCustomerId(null)
    } finally {
      setOtpVerifying(false)
    }
  }

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
        body: JSON.stringify({ email: em, state })
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
            // Checkout verify
            const cr = await fetch('/api/auth/session/checkout/verify', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: em, cartId: cart.id })
            })
            const cj = await cr.json().catch(() => ({}))
            if (cr.ok && cj?.ok === true) {
              setCustomerId(String(cj.customerId || ''))
              setPurchaseReady(true)
            } else {
              setIdentityError(mapIdentityError('checkout-verify', cj?.error, cr.status))
            }
          }
        } catch {}
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

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (magicPollTimerRef.current) clearInterval(magicPollTimerRef.current)
    }
  }, [])

  const goToOrderConfirmation = React.useCallback((orderId?: string) => {
    try { setOrderConfirmationProtection(true) } catch {}
    router.push(orderId ? `/order-confirmation?order_id=${encodeURIComponent(orderId)}` : '/order-confirmation')
  }, [router, setOrderConfirmationProtection, clearCartSilently])

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cart || !cart.id || cartItems.length === 0) {
      console.warn('[Checkout] Cannot submit without a valid cart and items');
      return;
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
      } catch {}

      // If we have a verified customer, fetch their latest order and route there
      try {
        if (customerId) {
          const res = await fetch(`/api/account/orders?customer_id=${encodeURIComponent(customerId)}`)
          const data = await res.json().catch(() => ({}))
          const orders = Array.isArray(data?.orders) ? data.orders : []
          if (orders.length > 0) {
            // Pick the most recent order by created_at
            orders.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
            const latest = orders[0]
            if (latest?.id) {
              try {
                sessionStorage.setItem('order_result', JSON.stringify({ orderId: latest.id, displayId: latest.display_id, timestamp: Date.now() }))
              } catch {}
              goToOrderConfirmation(latest.id)
              return
            }
          }
        }
      } catch {}

      // Fallback: route without id and let the page use snapshot/cart
      goToOrderConfirmation()
      return
    }
    if (!purchaseReady) {
      alert('Please verify your identity to continue. Use phone OTP or email magic link in the Identity Verification section.')
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
      } catch {}

      // Derive placeholder email when using phone verification
      const placeholderEmailForPhone = (identityMethod === 'phone' && phone.trim()) ? `${phone.replace(/\D/g, '')}@guest.local` : undefined;

      // Debug: Log checkout data before processing
      console.log('[Checkout] Processing checkout with data:', {
        cartId: cart.id,
        customerId: customerId,
        hasFormData: !!(formData.name),
        cartUpdate: {
          hasEmail: !!(purchaseReady && identityMethod === 'email' && email.trim()),
        },
        formData: {
          name: formData.name,
          parsedNames: (() => {
            const fullName = (formData.name || '').trim()
            const nameParts = fullName.split(/\s+/).filter(Boolean)
            return {
              first_name: nameParts[0] || 'Customer',
              last_name: nameParts.length > 1 ? nameParts.slice(1).join(' ') : '',
            }
          })(),
          phone: formData.contactNumber,
          address: formData.address,
          city: formData.city
        },
        purchaseReady,
        identityMethod
      })

      const result = await processCheckout({
        cartId: cart.id,
        // Pass customer ID for sync
        customerId: customerId,
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
        } catch {}
        // Set protection first to prevent races, then navigate
        goToOrderConfirmation(result.order.id);

        // Fire-and-forget post-purchase side effects without blocking navigation
        setTimeout(() => {
          // Customer sync is now handled by the checkout orchestrator
          console.log('[Checkout] Customer profile sync handled by orchestrator')

          // 2) Programmatic sign-in
          try {
            const identifierValue = (identityMethod === 'email')
              ? (email || '').trim().toLowerCase()
              : (phone || '').trim()
            import('next-auth/react').then(({ signIn }) => {
              signIn('session', { identifier: identifierValue, customerId: customerId || undefined, redirect: false })
                .then(() => { try { console.info('[Metrics] post_purchase_login_success_total++') } catch {} })
                .catch((e) => { console.warn('[Checkout] signIn failed (non-blocking):', e); try { console.info('[Metrics] post_purchase_login_failure_total++') } catch {} })
            }).catch(() => {})
          } catch {}
        }, 0)

        return;
      }

      // Fallbacks when checkout fails
      console.warn('[Checkout] Checkout failed at step:', result.error?.step, result);
      if (result.error?.step === 'cart-completed') {
        // Attempt to recover latest order and route to thank-you
        try {
          if (customerId) {
            const res = await fetch(`/api/account/orders?customer_id=${encodeURIComponent(customerId)}`)
            const data = await res.json().catch(() => ({}))
            const orders = Array.isArray(data?.orders) ? data.orders : []
            if (orders.length > 0) {
              orders.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
              const latest = orders[0]
              if (latest?.id) {
                try {
                  sessionStorage.setItem('order_result', JSON.stringify({ orderId: latest.id, displayId: latest.display_id, timestamp: Date.now() }))
                } catch {}
                goToOrderConfirmation(latest.id)
                return
              }
            }
          }
        } catch {}
        // As a last resort, route without id so the page uses the snapshot/cart
        goToOrderConfirmation()
        return
      }
      try {
        const msg = String(result.error?.message || '').toLowerCase()
        if (msg.includes('idempotency')) console.info('[Metrics] idempotency_replay_total++')
      } catch {}

      // General recovery attempt: try to locate a recent order for this verified customer and navigate
      try {
        if (customerId) {
          const res = await fetch(`/api/account/orders?customer_id=${encodeURIComponent(customerId)}`)
          const data = await res.json().catch(() => ({}))
          const orders = Array.isArray(data?.orders) ? data.orders : []
          if (orders.length > 0) {
            orders.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
            const latest = orders[0]
            if (latest?.id) {
              try {
                sessionStorage.setItem('order_result', JSON.stringify({ orderId: latest.id, displayId: latest.display_id, timestamp: Date.now() }))
              } catch {}
              goToOrderConfirmation(latest.id)
              return
            }
          }
        }
      } catch {}

      // As a final fallback, route to thank-you without id so snapshot renders
      goToOrderConfirmation()
      return
    } catch (error: any) {
      console.error('[Checkout] Unexpected error during checkout:', error);
      alert(error?.message || 'Unexpected error during checkout');
    }
  };

  // Loading or empty cart states - prevent proceeding with no items
  if (loading) {
    return (
      <div 
        className="relative flex size-full min-h-screen flex-col bg-white overflow-x-hidden" 
        style={{ fontFamily: '"Inter", "Public Sans", "Noto Sans", sans-serif' }}
      >
        <div className="layout-container flex h-full grow flex-col">
          <Header />
          <div className="w-full pt-16 sm:pt-20 md:pt-24 lg:pt-28 pb-8 sm:pb-12 md:pb-16">
            <div className={styles.container}>
              <h1 className={styles.title}>Checkout</h1>
              <div className="text-gray-600">Loading your cart...</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!cart || !cartItems || cartItems.length === 0) {
    return (
      <div 
        className="relative flex size-full min-h-screen flex-col bg-white overflow-x-hidden" 
        style={{ fontFamily: '"Inter", "Public Sans", "Noto Sans", sans-serif' }}
      >
        <div className="layout-container flex h-full grow flex-col">
          <Header />
          <div className="w-full pt-16 sm:pt-20 md:pt-24 lg:pt-28 pb-8 sm:pb-12 md:pb-16">
            <div className={styles.container}>
              <h1 className={styles.title}>Checkout</h1>
              <div className="flex flex-col items-center gap-4">
                <div className="text-gray-600">Your cart is empty.</div>
                <Link href="/products">
                  <button className={styles.placeOrderButton}>Browse Products</button>
                </Link>
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
      style={{ fontFamily: '"Inter", "Public Sans", "Noto Sans", sans-serif' }}
    >
      <div className="layout-container flex h-full grow flex-col">
        {/* Using the Header component */}
        <Header showProgress={isProgressBarSticky} progress={formProgress} />
        
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
                    className={styles.input} 
                    value={formData.name} 
                    onChange={handleInputChange} 
                    placeholder="Enter your name"
                    required 
                  />
                </div>
                
                <div className={styles.formGroup}>
                  <label htmlFor="address" className={styles.label}>Address</label>
                  <input 
                    type="text" 
                    id="address" 
                    name="address" 
                    className={styles.input} 
                    value={formData.address} 
                    onChange={handleInputChange} 
                    placeholder="Enter your address"
                    required 
                  />
                </div>
                
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="city" className={styles.label}>City</label>
                    <input 
                      type="text" 
                      id="city" 
                      name="city" 
                      className={styles.input} 
                      value={formData.city} 
                      onChange={handleInputChange} 
                      placeholder="Enter your city"
                      required 
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="state" className={styles.label}>State</label>
                    <input 
                      type="text" 
                      id="state" 
                      name="state" 
                      className={styles.input} 
                      value={formData.state} 
                      onChange={handleInputChange} 
                      placeholder="Enter your state"
                      required 
                    />
                  </div>
                </div>
                
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="postalCode" className={styles.label}>Postal Code</label>
                    <input 
                      type="text" 
                      id="postalCode" 
                      name="postalCode" 
                      className={styles.input} 
                      value={formData.postalCode} 
                      onChange={handleInputChange} 
                      placeholder="Enter your postal code"
                      required 
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="contactNumber" className={styles.label}>Contact Number</label>
                    <input 
                      type="text" 
                      id="contactNumber" 
                      name="contactNumber" 
                      className={styles.input} 
                      value={formData.contactNumber} 
                      onChange={handleInputChange} 
                      placeholder="Enter your contact number"
                      required 
                    />
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
              {/* Identity Verification Section (Task 2) */}
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Identity Verification</h2>
                {purchaseReady && (
                  <div className="mb-3 text-green-600">Identity verified​—you can now place your order.</div>
                )}
                {identityError && (
                  <div className="mb-3 text-red-600">{identityError}</div>
                )}
                <div className={styles.formRow}>
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
                {identityMethod === 'phone' ? (
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
                    {otpSent && (
                      <div className={styles.formGroup}>
                        <label htmlFor="otp" className={styles.label}>Enter OTP</label>
                        <input
                          type="text"
                          id="otp"
                          name="otp"
                          className={styles.input}
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value)}
                          placeholder="6-digit code"
                        />
                        <div className="mt-2">
                          <button type="button" className={styles.placeOrderButton} onClick={verifyOtp} disabled={otpVerifying || !otpCode}>
                            {otpVerifying ? 'Verifying...' : 'Verify'}
                          </button>
                        </div>
                      </div>
                    )}
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
                    <span className={styles.summaryValue}>{formatCurrency(subtotal)}</span>
                  </div>
                  
                  <div className={styles.summaryRow}>
                    <span className={styles.summaryLabel}>Shipping</span>
                    <span className={styles.summaryValue}>{shipping}</span>
                  </div>
                  
                  <div className={styles.summaryRow}>
                    <span className={styles.summaryLabel}>Taxes</span>
                    <span className={styles.summaryValue}>{formatCurrency(taxes)}</span>
                  </div>
                  
                  <div className={styles.totalRow}>
                    <span className={styles.totalLabel}>Total</span>
                    <span className={styles.totalValue}>{formatCurrency(total)}</span>
                  </div>
                </div>
                
                <button type="submit" className={styles.placeOrderButton} disabled={!purchaseReady}>
                  Place Order
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
