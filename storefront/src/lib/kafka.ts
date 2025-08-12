type EventPayload = Record<string, unknown>

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || '').split(',').filter(Boolean)
const KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID || 'storefront-auth'

let producerReady = false

export async function kafkaEmit(topic: string, payload: EventPayload): Promise<void> {
  if (KAFKA_BROKERS.length === 0) return
  // Lightweight dynamic import to avoid bundling on edge
  const { Kafka } = await import('kafkajs')
  const kafka = new Kafka({ clientId: KAFKA_CLIENT_ID, brokers: KAFKA_BROKERS })
  const producer = kafka.producer()
  if (!producerReady) {
    await producer.connect()
    producerReady = true
  }
  await producer.send({ topic, messages: [{ value: JSON.stringify(payload) }] })
  await producer.disconnect()
}


