'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import styles from '../login/loginPage.module.css'

export default function SignupPage() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [error, setError] = useState('')

  // Prefill from query params (?email= or ?phone=) or sessionStorage (Back from login)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const email = params.get('email')
    const phone = params.get('phone')
    if (email) setIdentifier(email)
    else if (phone) setIdentifier(phone)
    try {
      const raw = sessionStorage.getItem('signupData')
      if (raw) {
        const d = JSON.parse(raw)
        if (d.firstName) setFirstName(d.firstName)
        if (d.lastName) setLastName(d.lastName)
      }
      const storedId = sessionStorage.getItem('identifier')
      if (storedId && !email && !phone) setIdentifier(storedId)
    } catch {}
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const f = firstName.trim(), l = lastName.trim(), id = identifier.trim()
    if (!f) return setError('First name is required')
    if (!l) return setError('Last name is required')
    if (!id) return setError('Email or phone number is required')
    if (id.includes('@') && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(id))
      return setError('Please enter a valid email address')

    sessionStorage.setItem('signupData', JSON.stringify({ firstName: f, lastName: l }))
    sessionStorage.setItem('identifier', id)
    sessionStorage.setItem('signupAutoAdvance', '1')
    window.location.href = '/login'
  }

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.container}>
        <h2 className={styles.title}>Create Account</h2>
        <form className={styles.loginForm} onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label htmlFor="firstName" className={styles.fieldLabel}>First Name</label>
            <input id="firstName" className={styles.input} type="text" placeholder="Enter your first name" value={firstName} onChange={e => setFirstName(e.target.value)} required />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="lastName" className={styles.fieldLabel}>Last Name</label>
            <input id="lastName" className={styles.input} type="text" placeholder="Enter your last name" value={lastName} onChange={e => setLastName(e.target.value)} required />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="signupIdentifier" className={styles.fieldLabel}>Email Address or Mobile Number</label>
            <input id="signupIdentifier" className={styles.input} type="text" placeholder="Enter your email or mobile" value={identifier} onChange={e => setIdentifier(e.target.value)} required />
          </div>
          <div className={styles.formGroup}>
            <button className={styles.primaryBtn} type="submit" disabled={!firstName.trim() || !lastName.trim() || !identifier.trim()}>
              Continue
            </button>
          </div>
        </form>
        {error && <p className={`${styles.infoMessage} ${styles.error}`}>{error}</p>}
        <p className={styles.signupText}>
          Already have an account?{' '}
          <Link href="/login" className={styles.signupLink}>Log in</Link>
        </p>
      </div>
    </div>
  )
}
