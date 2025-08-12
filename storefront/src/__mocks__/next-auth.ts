// Minimal NextAuth mock to expose a pass-through function for building handlers
export type NextAuthOptions = Record<string, unknown>

export default function NextAuth(_opts: NextAuthOptions) {
  // Return edge-style handlers for GET/POST tests
  const handler = async () => new Response('ok', { status: 200 })
  return handler as unknown as { GET: typeof handler; POST: typeof handler }
}


