'use client';

import React, { useState } from 'react';
import styles from './contactPage.module.css';

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMessage('');

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      setStatus('success');
      setFormData({
        name: '',
        email: '',
        subject: '',
        message: ''
      });

      // Reset success message after 5 seconds
      setTimeout(() => setStatus('idle'), 5000);
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to send message');
    }
  };

  return (
    <div
      className="relative min-h-screen w-full bg-white overflow-x-hidden"
      style={{ fontFamily: '"Inter", "Public Sans", "Noto Sans", sans-serif', paddingTop: '100px' }}
    >
      <div className="w-full flex justify-center bg-white pt-12">
        <div className="flex h-full grow flex-col w-full max-w-[1280px] px-4 sm:px-6 mx-auto">
          {/* Main content */}
          <div className="flex flex-1 w-full">
            <div className="flex flex-col w-full">
              {/* Contact Us section */}
              <div className="w-full mt-6">
                <div className={styles.contactContainer}>
                  <div className={styles.contactContent}>
                    <div className={styles.contactHeader}>
                      <div className={styles.titleContainer}>
                        <h1 className={styles.contactTitle}>Contact Us</h1>
                      </div>
                    </div>

                    <form onSubmit={handleSubmit} className={styles.contactForm}>
                      <div className={styles.formGroup}>
                        <div className={styles.inputGroup}>
                          <div className={styles.labelContainer}>
                            <label htmlFor="name" className={styles.label}>Name</label>
                          </div>
                          <div className={styles.inputContainer}>
                            <input
                              type="text"
                              id="name"
                              name="name"
                              value={formData.name}
                              onChange={handleChange}
                              placeholder="Your Name"
                              className={styles.input}
                              required
                              disabled={status === 'loading'}
                            />
                          </div>
                        </div>
                      </div>

                      <div className={styles.formGroup}>
                        <div className={styles.inputGroup}>
                          <div className={styles.labelContainer}>
                            <label htmlFor="email" className={styles.label}>Email</label>
                          </div>
                          <div className={styles.inputContainer}>
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
                            />
                          </div>
                        </div>
                      </div>

                      <div className={styles.formGroup}>
                        <div className={styles.inputGroup}>
                          <div className={styles.labelContainer}>
                            <label htmlFor="subject" className={styles.label}>Subject</label>
                          </div>
                          <div className={styles.inputContainer}>
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
                            />
                          </div>
                        </div>
                      </div>

                      <div className={styles.formGroup}>
                        <div className={styles.inputGroup}>
                          <div className={styles.labelContainer}>
                            <label htmlFor="message" className={styles.label}>Message</label>
                          </div>
                          <div className={styles.textareaContainer}>
                            <textarea
                              id="message"
                              name="message"
                              value={formData.message}
                              onChange={handleChange}
                              placeholder="Your message..."
                              className={styles.textarea}
                              rows={6}
                              required
                              disabled={status === 'loading'}
                            />
                          </div>
                        </div>
                      </div>

                      {status === 'success' && (
                        <div className="p-4 mb-4 text-sm text-green-800 rounded-lg bg-green-50" role="alert">
                          <span className="font-medium">Success!</span> Your message has been sent successfully.
                        </div>
                      )}

                      {status === 'error' && (
                        <div className="p-4 mb-4 text-sm text-red-800 rounded-lg bg-red-50" role="alert">
                          <span className="font-medium">Error!</span> {errorMessage}
                        </div>
                      )}

                      <div className={styles.submitContainer}>
                        <div className={styles.submitButtonContainer}>
                          <button
                            type="submit"
                            className={`${styles.submitButton} ${status === 'loading' ? 'opacity-70 cursor-not-allowed' : ''}`}
                            disabled={status === 'loading'}
                          >
                            <div className={styles.submitButtonContent}>
                              <span className={styles.submitButtonText}>
                                {status === 'loading' ? 'Sending...' : 'Submit'}
                              </span>
                            </div>
                          </button>
                        </div>
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
                        <p className={styles.contactInfoText}>Address: Krishnapuram 8th road, Tadipatri, Anantapuramu, Andhra Pradesh, 515411 </p>
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