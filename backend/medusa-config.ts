import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      // Allow common localhost origins by default in development so CORS preflights succeed
      storeCors:
        process.env.STORE_CORS ??
        'http://localhost:3000,http://127.0.0.1:3000',
      adminCors:
        process.env.ADMIN_CORS ??
        'http://localhost:7000,http://127.0.0.1:7000,http://localhost:7001',
      authCors:
        process.env.AUTH_CORS ??
        'http://localhost:3000,http://127.0.0.1:3000',
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
    currencies: [
      {
        code: "inr",
        symbol: "₹",
        symbol_native: "₹",
        name: "Indian Rupee",
      },
    ],
  }
})
