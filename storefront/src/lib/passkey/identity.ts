export function resolvePrimaryIdentifier(input: { phone?: string; email?: string }): { userId: string; username: string } {
  const phone = input.phone && input.phone.trim()
  if (phone) {
    const digits = phone.replace(/\D/g, '')
    const normalized = digits ? `+${digits}` : phone
    return { userId: normalized, username: normalized }
  }
  const email = (input.email || '').trim().toLowerCase()
  return { userId: email, username: email }
}


