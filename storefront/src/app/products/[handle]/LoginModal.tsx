'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { signIn } from 'next-auth/react';
import { usePasskey, PublicKeyRequestOptionsJSON } from '@/hooks/usePasskey';
import { setCustomerId as setCustomerIdHybrid } from '../../../utils/hybridCustomerStorage';
import LoadingScreen from '@/components/LoadingScreen';
import modalStyles from './LoginModal.module.css';

interface LoginModalProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

type Identifier = { email?: string; phone?: string };
type Step = 'identifier' | 'otp' | 'magic-sent' | 'success';

// ── Helpers (same as login page) ──
async function fetchPasskeyRequestOptions(identifier: Identifier): Promise<{ options: PublicKeyRequestOptionsJSON; userId: string } | null> {
    try {
        const res = await fetch('/api/auth/passkey/options', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...identifier, userId: identifier.email || identifier.phone }),
        });
        if (!res.ok) return null;
        return (await res.json()) as any;
    } catch {
        return null;
    }
}

async function verifyPasskey(assertion: unknown, identifier: Identifier, canonicalUserId: string): Promise<{ comboRequired?: boolean; token?: string; credentialId?: string }> {
    const res = await fetch('/api/auth/passkey/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ...(typeof assertion === 'object' && assertion ? (assertion as Record<string, unknown>) : {}),
            userId: canonicalUserId,
            ...identifier,
        }),
    });
    if (!res.ok) throw new Error('Passkey verification failed');
    const result = await res.json();
    return { ...result, comboRequired: false };
}

/**
 * LoginModal — inline auth popup with passkey conditional UI + phone OTP + email magic link.
 * Mirrors the exact passkey detection flow from /login page.
 */
const LoginModal: React.FC<LoginModalProps> = ({ open, onClose, onSuccess }) => {
    const { authenticate, authenticateConditional, isConditionalMediationAvailable } = usePasskey();

    // ── State ──
    const [step, setStep] = useState<Step>('identifier');
    const [identifier, setIdentifier] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [status, setStatus] = useState('');
    const [conditionalUIActive, setConditionalUIActive] = useState(false);

    // OTP state
    const [otpCode, setOtpCode] = useState('');
    const [otpSending, setOtpSending] = useState(false);
    const [otpVerifying, setOtpVerifying] = useState(false);
    const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
    const autoSubmitTimerRef = useRef<any>(null);

    // Loading screen state
    const [showLoadingScreen, setShowLoadingScreen] = useState(false);

    // Magic link state
    const [magicSending, setMagicSending] = useState(false);
    const magicPollTimerRef = useRef<any>(null);
    const magicStateRef = useRef('');

    // Ref to track if conditional UI was already started for this open cycle
    const conditionalUIStartedRef = useRef(false);

    // ── Reset on close ──
    useEffect(() => {
        if (!open) {
            setStep('identifier');
            setIdentifier('');
            setPhone('');
            setEmail('');
            setOtpCode('');
            setError('');
            setStatus('');
            setOtpSending(false);
            setOtpVerifying(false);
            setMagicSending(false);
            setShowLoadingScreen(false);
            setConditionalUIActive(false);
            conditionalUIStartedRef.current = false;
            if (magicPollTimerRef.current) clearInterval(magicPollTimerRef.current);
            if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
        }
    }, [open]);

    // ── Cleanup on unmount ──
    useEffect(() => {
        return () => {
            if (magicPollTimerRef.current) clearInterval(magicPollTimerRef.current);
            if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
        };
    }, []);

    // ──────────────────────────────────────────────────────────────
    // Conditional UI: Start listening for passkey autofill when
    // the modal opens — EXACT same approach as the /login page.
    //
    // Requirements for conditional mediation to work:
    //   1. Input with autoComplete="username webauthn" must be in DOM
    //   2. navigator.credentials.get({ mediation: 'conditional' })
    //      must be called AFTER the input is rendered
    //   3. Only one conditional mediation request can be active at a time
    // ──────────────────────────────────────────────────────────────
    useEffect(() => {
        let abortController: AbortController | null = null;

        const startConditionalUI = async () => {
            try {
                // Check if conditional mediation is supported
                const isSupported = await isConditionalMediationAvailable();
                if (!isSupported) {
                    console.log('[LoginModal ConditionalUI] Not supported on this browser');
                    return;
                }

                console.log('[LoginModal ConditionalUI] Starting conditional mediation...');
                setConditionalUIActive(true);

                // Create abort controller to cancel the request if needed
                abortController = new AbortController();

                // Get a generic challenge for conditional UI (doesn't need user identifier)
                const optionsRes = await fetch('/api/auth/passkey/options', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ conditionalUI: true }),
                    signal: abortController.signal,
                });

                if (!optionsRes.ok) {
                    console.warn('[LoginModal ConditionalUI] Failed to get options');
                    return;
                }

                const { options, userId: canonicalUserId } = await optionsRes.json();

                // Start conditional authentication (non-blocking, waits for user input)
                const { data, error: authError } = await authenticateConditional(options);

                if (authError) {
                    // User cancelled or no passkey available - this is normal, not an error
                    console.log('[LoginModal ConditionalUI] Not used:', authError);
                    return;
                }

                if (data) {
                    console.log('[LoginModal ConditionalUI] Passkey selected from autofill!');
                    setShowLoadingScreen(true);
                    setStatus('Authenticating with passkey...');

                    // Verify the passkey
                    const verifyRes = await fetch('/api/auth/passkey/verify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ...data,
                            userId: canonicalUserId,
                            conditionalUI: true,
                        }),
                    });

                    if (!verifyRes.ok) {
                        setShowLoadingScreen(false);
                        setError('Passkey authentication failed');
                        return;
                    }

                    const result = await verifyRes.json();
                    console.log('[LoginModal ConditionalUI] Verify response:', result);

                    // Extract identifier from result (email or phone)
                    const userIdentifier = result.email || result.phone || canonicalUserId;
                    console.log('[LoginModal ConditionalUI] Extracted userIdentifier:', userIdentifier);

                    // Mark passkey authentication success
                    try {
                        if (typeof window !== 'undefined') {
                            sessionStorage.setItem('hasPasskey', 'true');
                            if (result?.credentialId) {
                                sessionStorage.setItem('lastPasskeyCredential', result.credentialId);
                                sessionStorage.setItem('currentPasskeyCredential', result.credentialId);
                            }
                            const policyKey = `passkeyPolicy_${userIdentifier}`;
                            const cacheData = { hasPasskey: true, expiresAt: Date.now() + (60 * 60 * 1000) };
                            localStorage.setItem(policyKey, JSON.stringify(cacheData));
                            const registeredKey = `passkeyRegistered_${userIdentifier}`;
                            localStorage.setItem(registeredKey, JSON.stringify({ timestamp: Date.now() }));
                        }
                    } catch (storageError) {
                        console.warn('[LoginModal ConditionalUI] Failed to update storage:', storageError);
                    }

                    // Ensure customer & sign in
                    await completeAuth(userIdentifier, userIdentifier.includes('@') ? 'email' : 'phone', true);
                }
            } catch (err: any) {
                // AbortError is expected when modal closes or user navigates away
                if (err?.name !== 'AbortError') {
                    console.warn('[LoginModal ConditionalUI] Error:', err);
                }
            }
        };

        // Only run conditional UI if modal is open, on identifier step, and not already started
        if (open && step === 'identifier' && !conditionalUIStartedRef.current) {
            conditionalUIStartedRef.current = true;
            // Small delay to ensure the input with autoComplete="username webauthn" is rendered
            const timer = setTimeout(() => {
                startConditionalUI();
            }, 100);

            return () => {
                clearTimeout(timer);
                if (abortController) {
                    abortController.abort();
                }
                setConditionalUIActive(false);
            };
        }

        // Cleanup: abort the request if step changes away from identifier
        return () => {
            if (abortController) {
                abortController.abort();
            }
            setConditionalUIActive(false);
        };
    }, [open, step, isConditionalMediationAvailable, authenticateConditional]);

    const isEmail = identifier.includes('@');

    // ── Step 1: Continue with identifier ──
    const handleContinue = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const val = identifier.trim();
        if (!val) {
            setError('Please enter your phone number or email');
            return;
        }

        setShowLoadingScreen(true);
        setStatus('Checking sign-in options…');

        const id: Identifier = isEmail ? { email: val } : { phone: val };

        // ── Check if user has a passkey registered (explicit authentication) ──
        try {
            const policyRes = await fetch('/api/auth/passkey/policy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(id),
            });
            const policy = await policyRes.json().catch(() => ({}));

            if (policyRes.ok && policy?.hasPasskey) {
                const platAvailable = (window as any).PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable;
                if (typeof platAvailable === 'function') {
                    const available = await platAvailable();
                    if (available) {
                        setStatus('Authenticating with passkey…');

                        const fetched = await fetchPasskeyRequestOptions(id);
                        if (fetched) {
                            const { options, userId: canonicalUserId } = fetched;
                            const { data, error: authError } = await authenticate(options);

                            if (!authError && data) {
                                try {
                                    const result = await verifyPasskey(data, id, canonicalUserId);
                                    if (!result.comboRequired) {
                                        // Passkey succeeded — store flags
                                        try {
                                            if (typeof window !== 'undefined') {
                                                const identifierValue = id.email || id.phone || '';
                                                sessionStorage.setItem('hasPasskey', 'true');
                                                if (result?.credentialId) {
                                                    sessionStorage.setItem('lastPasskeyCredential', result.credentialId);
                                                    sessionStorage.setItem('currentPasskeyCredential', result.credentialId);
                                                }
                                                const policyKey = `passkeyPolicy_${identifierValue}`;
                                                const cacheData = { hasPasskey: true, expiresAt: Date.now() + (60 * 60 * 1000) };
                                                localStorage.setItem(policyKey, JSON.stringify(cacheData));
                                                const registeredKey = `passkeyRegistered_${identifierValue}`;
                                                localStorage.setItem(registeredKey, JSON.stringify({ timestamp: Date.now() }));
                                            }
                                        } catch { }

                                        await completeAuth(
                                            (id.email || id.phone) as string,
                                            isEmail ? 'email' : 'phone',
                                            true
                                        );
                                        return;
                                    }
                                } catch {
                                    // Passkey verification failed, fall through to OTP/magic link
                                    console.warn('[LoginModal] Passkey verification failed, falling back');
                                }
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.error('[LoginModal] Error checking passkey:', err);
        }

        setShowLoadingScreen(false);
        setStatus('');

        // ── Fall back to OTP / magic link ──
        if (isEmail) {
            setEmail(val);
            setMagicSending(true);
            setStatus('Sending magic link…');
            try {
                const state = `review-${Date.now()}`;
                magicStateRef.current = state;
                const res = await fetch('/api/auth/magic/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: val.toLowerCase(), state }),
                });
                const body = await res.json().catch(() => ({}));
                if (!res.ok || body?.ok !== true) {
                    throw new Error(body?.error || 'Failed to send magic link');
                }
                setStep('magic-sent');
                setStatus('Magic link sent! Check your email.');

                let attempts = 0;
                magicPollTimerRef.current = setInterval(async () => {
                    attempts++;
                    try {
                        const url = `/api/auth/magic/status?email=${encodeURIComponent(val.toLowerCase())}&state=${encodeURIComponent(state)}`;
                        const sr = await fetch(url);
                        const sj = await sr.json().catch(() => ({}));
                        if (sj?.verified) {
                            clearInterval(magicPollTimerRef.current);
                            magicPollTimerRef.current = null;
                            await completeAuth(val.toLowerCase(), 'email', false);
                        }
                    } catch { }
                    if (attempts >= 150) {
                        clearInterval(magicPollTimerRef.current);
                        magicPollTimerRef.current = null;
                        setError('Magic link expired. Please try again.');
                    }
                }, 2000);
            } catch (err: any) {
                setError(err?.message || 'Failed to send magic link');
            } finally {
                setMagicSending(false);
            }
        } else {
            setPhone(val);
            await sendOtp(val);
        }
    }, [identifier, isEmail, authenticate]);

    // ── Send OTP ──
    const sendOtp = async (phoneNumber: string) => {
        setError('');
        setOtpSending(true);
        setStatus('Sending OTP via WhatsApp…');
        try {
            const res = await fetch('/api/auth/otp/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: phoneNumber }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || body?.ok !== true) {
                throw new Error(body?.error || 'Failed to send OTP');
            }
            setStep('otp');
            setStatus('OTP sent! Check your WhatsApp.');
            setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
        } catch (err: any) {
            setError(err?.message || 'Failed to send OTP');
        } finally {
            setOtpSending(false);
        }
    };

    // ── OTP input handlers ──
    const handleOtpInputChange = (index: number, value: string) => {
        if (value.length <= 1 && /^\d*$/.test(value)) {
            const newArr = Array(6).fill('');
            const current = otpCode.padEnd(6, '');
            for (let i = 0; i < 6; i++) newArr[i] = current[i] || '';
            newArr[index] = value;
            const code = newArr.join('');
            setOtpCode(code);
            if (value.length === 1 && index < 5) {
                otpInputRefs.current[index + 1]?.focus();
            }
        }
    };

    const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
            otpInputRefs.current[index - 1]?.focus();
        }
    };

    // Auto-submit OTP
    useEffect(() => {
        if (otpCode.length === 6 && /^\d{6}$/.test(otpCode) && !otpVerifying && step === 'otp') {
            if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
            autoSubmitTimerRef.current = setTimeout(() => verifyOtp(), 300);
        }
        return () => { if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [otpCode, otpVerifying]);

    // ── Verify OTP ──
    const verifyOtp = useCallback(async () => {
        if (!otpCode || !/^\d{6}$/.test(otpCode)) {
            setError('Please enter a valid 6-digit OTP');
            return;
        }
        setError('');
        setOtpVerifying(true);
        setStatus('Verifying…');
        try {
            const vr = await fetch('/api/auth/otp/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, code: otpCode }),
            });
            const vj = await vr.json().catch(() => ({}));
            if (!vr.ok || vj?.ok !== true) throw new Error('Invalid OTP code');
            await completeAuth(phone, 'phone', false);
        } catch (err: any) {
            setError(err?.message || 'Failed to verify OTP');
            setOtpVerifying(false);
        }
    }, [otpCode, phone]);

    // ── Complete auth: ensure customer + signIn ──
    const completeAuth = async (identifierValue: string, type: 'phone' | 'email', hasPasskey: boolean) => {
        setShowLoadingScreen(true);
        setStatus('Signing you in…');
        try {
            const payload = type === 'email' ? { email: identifierValue } : { phone: identifierValue };
            const ensure = await fetch('/api/account/customer/ensure', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const ej = await ensure.json().catch(() => ({}));
            if (!ensure.ok || !ej?.customerId) throw new Error('Failed to create account');

            try { await setCustomerIdHybrid(String(ej.customerId)); } catch { }

            if (!hasPasskey) {
                try {
                    if (typeof window !== 'undefined') {
                        sessionStorage.setItem('hasPasskey', 'false');
                        sessionStorage.removeItem('lastPasskeyCredential');
                        sessionStorage.removeItem('currentPasskeyCredential');
                    }
                } catch { }
            }

            const signInResult = await signIn('session', {
                identifier: identifierValue,
                customerId: ej.customerId,
                hasPasskey,
                redirect: false,
            });

            if (signInResult?.ok) {
                setStep('success');
                setStatus('Signed in successfully!');
                setTimeout(() => {
                    onSuccess();
                    onClose();
                }, 800);
            } else {
                throw new Error(signInResult?.error || 'Failed to create session');
            }
        } catch (err: any) {
            setShowLoadingScreen(false);
            setError(err?.message || 'Sign in failed');
            setOtpVerifying(false);
        }
    };

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (magicPollTimerRef.current) clearInterval(magicPollTimerRef.current);
        };
    }, []);

    if (!open) return null;

    return (
        <>
        <LoadingScreen
            show={showLoadingScreen}
            duration={1200}
            imagesFolder="/loading-animations"
            shaderEffect="smoke"
        />
        <div className={modalStyles.overlay} onClick={onClose}>
            <div className={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
                {/* Close button */}
                <button className={modalStyles.closeBtn} onClick={onClose} aria-label="Close">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                <h3 className={modalStyles.title}>
                    {step === 'success' ? 'Welcome!' : 'Sign in to write a review'}
                </h3>
                <p className={modalStyles.subtitle}>
                    {step === 'identifier' && 'Enter your phone number or email to continue'}
                    {step === 'otp' && `We sent a 6-digit code to ${phone}`}
                    {step === 'magic-sent' && `Check your email at ${email}`}
                    {step === 'success' && 'You\'re all set!'}
                </p>

                {/* ── Step: Identifier ── */}
                {step === 'identifier' && (
                    <form onSubmit={handleContinue} className={modalStyles.form}>
                        <div className={modalStyles.field}>
                            <label htmlFor="login-modal-identifier" className={modalStyles.label}>
                                Email Address or Mobile Number
                            </label>
                            {/* 
                CRITICAL: autoComplete="username webauthn" is required for
                conditional mediation (passkey autofill) to work.
                The browser shows passkey suggestions in the dropdown
                when this input is focused.
              */}
                            <input
                                id="login-modal-identifier"
                                name="identifier"
                                type="text"
                                className={modalStyles.input}
                                value={identifier}
                                onChange={(e) => setIdentifier(e.target.value)}
                                placeholder="Enter your email or mobile"
                                autoComplete="username webauthn"
                                autoFocus
                                disabled={otpSending || magicSending}
                            />
                        </div>
                        <button
                            type="submit"
                            className={modalStyles.primaryBtn}
                            disabled={!identifier.trim() || otpSending || magicSending}
                        >
                            {otpSending || magicSending ? 'Sending…' : 'Continue'}
                        </button>
                    </form>
                )}

                {/* ── Step: OTP ── */}
                {step === 'otp' && (
                    <div className={modalStyles.form}>
                        <div className={modalStyles.otpContainer}>
                            {Array(6).fill(null).map((_, i) => (
                                <input
                                    key={i}
                                    ref={(el) => { otpInputRefs.current[i] = el; }}
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={1}
                                    className={modalStyles.otpInput}
                                    value={otpCode[i] || ''}
                                    onChange={(e) => handleOtpInputChange(i, e.target.value)}
                                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                                    disabled={otpVerifying}
                                    autoFocus={i === 0}
                                />
                            ))}
                        </div>

                        <button
                            type="button"
                            className={modalStyles.primaryBtn}
                            onClick={verifyOtp}
                            disabled={otpVerifying || otpCode.length < 6}
                        >
                            {otpVerifying ? 'Verifying…' : 'Verify'}
                        </button>

                        <button
                            type="button"
                            className={modalStyles.linkBtn}
                            onClick={() => sendOtp(phone)}
                            disabled={otpSending}
                        >
                            {otpSending ? 'Sending…' : 'Resend OTP'}
                        </button>
                    </div>
                )}

                {/* ── Step: Magic link sent ── */}
                {step === 'magic-sent' && (
                    <div className={modalStyles.form}>
                        <div className={modalStyles.magicWaiting}>
                            <div className={modalStyles.spinner} />
                            <p>Waiting for you to click the link in your email…</p>
                        </div>
                    </div>
                )}

                {/* ── Step: Success ── */}
                {step === 'success' && (
                    <div className={modalStyles.successContainer}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={modalStyles.successIcon}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <p>Signed in successfully!</p>
                    </div>
                )}

                {/* ── Status / Error ── */}
                {status && !error && step !== 'success' && (
                    <p className={modalStyles.status}>{status}</p>
                )}
                {error && (
                    <p className={modalStyles.error}>{error}</p>
                )}
            </div>
        </div>
        </>
    );
};

export default LoginModal;
