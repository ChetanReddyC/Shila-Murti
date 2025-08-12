let client: typeof import('prom-client') | null = null

export async function getMetricsClient() {
  if (client) return client
  client = await import('prom-client')
  client.collectDefaultMetrics()
  return client
}

export async function getCounter(opts: { name: string; help: string; labelNames?: string[] }) {
  const c = await getMetricsClient()
  const existing = (c.register.getSingleMetric(opts.name) as any) || null
  if (existing) return existing
  const Counter = c.Counter
  return new Counter(opts)
}

export async function getHistogram(opts: { name: string; help: string; labelNames?: string[]; buckets?: number[] }) {
  const c = await getMetricsClient()
  const existing = (c.register.getSingleMetric(opts.name) as any) || null
  if (existing) return existing
  const Histogram = c.Histogram
  return new Histogram(opts)
}


