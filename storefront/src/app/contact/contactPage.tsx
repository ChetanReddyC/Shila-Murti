'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import styles from './contactPage.module.css';

const MAX_MESSAGE_LENGTH = 5000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
}

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const isSubmitting = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const clearStatusTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const dismissStatus = useCallback(() => {
    clearStatusTimeout();
    setStatus('idle');
    setErrorMessage('');
  }, [clearStatusTimeout]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'message' && value.length > MAX_MESSAGE_LENGTH) return;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear field error on change
    if (fieldErrors[name as keyof FieldErrors]) {
      setFieldErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const validate = (): boolean => {
    const errors: FieldErrors = {};
    if (!formData.name.trim()) errors.name = 'Name is required.';
    if (!formData.email.trim()) {
      errors.email = 'Email is required.';
    } else if (!EMAIL_REGEX.test(formData.email)) {
      errors.email = 'Please enter a valid email address.';
    }
    if (!formData.subject.trim()) errors.subject = 'Subject is required.';
    if (!formData.message.trim()) {
      errors.message = 'Message is required.';
    } else if (formData.message.trim().length < 10) {
      errors.message = 'Message must be at least 10 characters.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Guard against double submit
    if (isSubmitting.current) return;

    // Client-side validation
    if (!validate()) return;

    isSubmitting.current = true;
    clearStatusTimeout();
    setStatus('loading');
    setErrorMessage('');

    const controller = new AbortController();
    const fetchTimeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
        signal: controller.signal,
      });

      clearTimeout(fetchTimeout);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      setStatus('success');
      setFormData({ name: '', email: '', subject: '', message: '' });

      timeoutRef.current = setTimeout(() => setStatus('idle'), 5000);
    } catch (error) {
      clearTimeout(fetchTimeout);
      setStatus('error');
      if (error instanceof DOMException && error.name === 'AbortError') {
        setErrorMessage('Request timed out. Please try again.');
      } else {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to send message');
      }
      // Auto-clear error after 10 seconds
      timeoutRef.current = setTimeout(() => {
        setStatus('idle');
        setErrorMessage('');
      }, 10000);
    } finally {
      isSubmitting.current = false;
    }
  };

  const inputContainerClass = (field: keyof FieldErrors, base: string) =>
    `${base} ${fieldErrors[field] ? styles.inputContainerError : ''}`;

  return (
    <div
      className="relative min-h-screen w-full bg-white overflow-x-hidden"
      style={{ fontFamily: '"Inter", "Public Sans", "Noto Sans", sans-serif', paddingTop: '100px' }}
    >
      <div className="w-full flex justify-center bg-white pt-12">
        <div className="flex h-full grow flex-col w-full max-w-[1280px] px-4 sm:px-6 mx-auto">
          <div className="flex flex-1 w-full">
            <div className="flex flex-col w-full">
              <div className="w-full mt-6">
                <div className={styles.contactContainer}>
                  <div className={styles.contactContent}>
                    <div className={styles.contactHeader}>
                      <div className={styles.titleContainer}>
                        <h1 className={styles.contactTitle}>Contact Us</h1>
                      </div>
                    </div>

                    <form onSubmit={handleSubmit} className={styles.contactForm} noValidate>
                      {/* Name */}
                      <div className={styles.formGroup}>
                        <div className={styles.inputGroup}>
                          <div className={styles.labelContainer}>
                            <label htmlFor="name" className={styles.label}>Name</label>
                          </div>
                          <div className={inputContainerClass('name', styles.inputContainer)}>
                            <input
                              type="text"
                              id="name"
                              name="name"
                              value={formData.name}
                              onChange={handleChange}
                              placeholder="Your Name"
                              className={styles.input}
                              required
                              autoFocus
                              disabled={status === 'loading'}
                              aria-invalid={!!fieldErrors.name}
                              aria-describedby={fieldErrors.name ? 'name-error' : undefined}
                            />
                          </div>
                          {fieldErrors.name && (
                            <p id="name-error" className={styles.fieldError} role="alert">{fieldErrors.name}</p>
                          )}
                        </div>
                      </div>

                      {/* Email */}
                      <div className={styles.formGroup}>
                        <div className={styles.inputGroup}>
                          <div className={styles.labelContainer}>
                            <label htmlFor="email" className={styles.label}>Email</label>
                          </div>
                          <div className={inputContainerClass('email', styles.inputContainer)}>
                            <input
                              type="email"
                              id="email"
                              name="email"
                              value={formData.email}
                              onChange={handleChange}
                              placeholder="Your Email"
                              className={styles.input}
                              required
                              disabled={status === 'loading'}
                              aria-invalid={!!fieldErrors.email}
                              aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                            />
                          </div>
                          {fieldErrors.email && (
                            <p id="email-error" className={styles.fieldError} role="alert">{fieldErrors.email}</p>
                          )}
                        </div>
                      </div>

                      {/* Subject */}
                      <div className={styles.formGroup}>
                        <div className={styles.inputGroup}>
                          <div className={styles.labelContainer}>
                            <label htmlFor="subject" className={styles.label}>Subject</label>
                          </div>
                          <div className={inputContainerClass('subject', styles.inputContainer)}>
                            <input
                              type="text"
                              id="subject"
                              name="subject"
                              value={formData.subject}
                              onChange={handleChange}
                              placeholder="Subject"
                              className={styles.input}
                              required
                              disabled={status === 'loading'}
                              aria-invalid={!!fieldErrors.subject}
                              aria-describedby={fieldErrors.subject ? 'subject-error' : undefined}
                            />
                          </div>
                          {fieldErrors.subject && (
                            <p id="subject-error" className={styles.fieldError} role="alert">{fieldErrors.subject}</p>
                          )}
                        </div>
                      </div>

                      {/* Message */}
                      <div className={styles.formGroup}>
                        <div className={styles.inputGroup}>
                          <div className={styles.labelContainer}>
                            <label htmlFor="message" className={styles.label}>Message</label>
                          </div>
                          <div className={inputContainerClass('message', styles.textareaContainer)}>
                            <textarea
                              id="message"
                              name="message"
                              value={formData.message}
                              onChange={handleChange}
                              placeholder="Your message..."
                              className={styles.textarea}
                              rows={6}
                              maxLength={MAX_MESSAGE_LENGTH}
                              required
                              disabled={status === 'loading'}
                              aria-invalid={!!fieldErrors.message}
                              aria-describedby={
                                [fieldErrors.message ? 'message-error' : '', 'message-counter']
                                  .filter(Boolean)
                                  .join(' ') || undefined
                              }
                            />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            {fieldErrors.message ? (
                              <p id="message-error" className={styles.fieldError} role="alert">{fieldErrors.message}</p>
                            ) : <span />}
                            <span id="message-counter" className={styles.charCounter}>
                              {formData.message.length} / {MAX_MESSAGE_LENGTH}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Status messages - always rendered container for aria-live */}
                      <div className={styles.statusContainer} aria-live="polite" aria-atomic="true">
                        {status === 'success' && (
                          <div className={`${styles.alertMessage} ${styles.alertSuccess}`} role="alert">
                            <span><strong>Success!</strong> Your message has been sent successfully.</span>
                            <button
                              type="button"
                              className={styles.alertDismiss}
                              onClick={dismissStatus}
                              aria-label="Dismiss success message"
                            >
                              &times;
                            </button>
                          </div>
                        )}
                        {status === 'error' && (
                          <div className={`${styles.alertMessage} ${styles.alertError}`} role="alert">
                            <span><strong>Error!</strong> {errorMessage}</span>
                            <button
                              type="button"
                              className={styles.alertDismiss}
                              onClick={dismissStatus}
                              aria-label="Dismiss error message"
                            >
                              &times;
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Submit */}
                      <div className={styles.submitContainer}>
                        <button
                          type="submit"
                          className={styles.submitButton}
                          disabled={status === 'loading'}
                        >
                          {status === 'loading' && <span className={styles.spinner} aria-hidden="true" />}
                          {status === 'loading' ? 'Sending...' : 'Submit'}
                        </button>
                      </div>
                    </form>

                    <div className={styles.contactInfo}>
                      <div className={styles.contactInfoHeader}>
                        <h2 className={styles.contactInfoTitle}>Contact Information</h2>
                      </div>

                      <div className={styles.contactInfoItem}>
                        <p className={styles.contactInfoText}>Email: support@shilamurti.com</p>
                      </div>

                      <div className={styles.contactInfoItem}>
                        <p className={styles.contactInfoText}>Phone: +91 7013134891</p>
                      </div>

                      <div className={styles.contactInfoItem}>
                        <p className={styles.contactInfoText}>Address: Krishnapuram 8th road, Tadipatri, Anantapuramu, Andhra Pradesh, 515411</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 