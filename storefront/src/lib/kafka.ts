type EventPayload = Record<string, unknown>

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || '').split(',').filter(Boolean)
const KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID || 'storefront-auth'

let producerReady = false
let kafkaDisabled = false

export async function kafkaEmit(topic: string, payload: EventPayload): Promise<void> {
  // Skip if no brokers configured or previously disabled due to errors
  if (KAFKA_BROKERS.length === 0 || kafkaDisabled) return
  
  try {
    // Lightweight dynamic import to avoid bundling on edge
    const { Kafka } = await import('kafkajs')
    const kafka = new Kafka({ 
      clientId: KAFKA_CLIENT_ID, 
      brokers: KAFKA_BROKERS,
      connectionTimeout: 3000, // 3 second timeout
      requestTimeout: 5000, // 5 second request timeout
      retry: {
        initialRetryTime: 100,
        retries: 2 // Only retry twice
      }
    })
    const producer = kafka.producer()
    
    if (!producerReady) {
      await producer.connect()
      producerReady = true
    }
    
    await producer.send({ topic, messages: [{ value: JSON.stringify(payload) }] })
    await producer.disconnect()
  } catch (error: any) {
    // Log the error but don't throw - this prevents Kafka issues from breaking the app
    
    // If it's a connection error, disable Kafka for this session to prevent spam
    if (error.message?.includes('ENOTFOUND') || error.message?.includes('Connection timeout')) {
      kafkaDisabled = true
      producerReady = false
    }
  }
}


