type VaultSecret = { data?: { data?: Record<string, string> } }

const VAULT_ADDR = process.env.VAULT_ADDR
const VAULT_TOKEN = process.env.VAULT_TOKEN

export async function vaultRead(path: string): Promise<Record<string, string> | null> {
  if (!VAULT_ADDR || !VAULT_TOKEN) return null
  const url = `${VAULT_ADDR}/v1/${path}`
  const res = await fetch(url, { headers: { 'X-Vault-Token': VAULT_TOKEN } })
  if (!res.ok) return null
  const json = (await res.json().catch(() => ({}))) as VaultSecret
  return json?.data?.data ?? null
}


