export async function registerPasskey(userId: string, username: string): Promise<boolean> {
  const res = await fetch('/api/auth/passkey/register/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, username }),
  })
  if (!res.ok) throw new Error('options_failed')
  const { options } = await res.json()
  const b64ToBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
  const publicKey: PublicKeyCredentialCreationOptions = {
    ...options,
    challenge: b64ToBytes(options.challenge),
    user: { ...options.user, id: new TextEncoder().encode(options.user.id) },
    excludeCredentials: (options.excludeCredentials || []).map((c: any) => ({ ...c, id: b64ToBytes(c.id) })),
  }
  const cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential
  if (!cred) throw new Error('user_cancelled')
  const att = cred.response as AuthenticatorAttestationResponse
  const arrayBufferToBase64Url = (buf: ArrayBuffer) => {
    const bytes = new Uint8Array(buf)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i])
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  }
  const payload = {
    id: cred.id,
    rawId: arrayBufferToBase64Url(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: arrayBufferToBase64Url(att.clientDataJSON),
      attestationObject: arrayBufferToBase64Url(att.attestationObject),
      transports: (cred as any).response.getTransports?.() || [],
    },
  }
  const verify = await fetch('/api/auth/passkey/register/verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, credential: payload }),
  })
  if (!verify.ok) throw new Error('verify_failed')
  return true
}


