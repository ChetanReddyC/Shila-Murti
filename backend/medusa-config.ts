// import { loadEnv, defineConfig } from '@medusajs/framework/utils'

// loadEnv(process.env.NODE_ENV || 'development', process.cwd())

// module.exports = defineConfig({
//   projectConfig: {
//     databaseUrl: process.env.DATABASE_URL,
//     http: {
//       // Allow common localhost origins by default in development so CORS preflights succeed
//       storeCors:
//         process.env.STORE_CORS ??
//         'http://localhost:3000,http://127.0.0.1:3000',
//       adminCors:
//         process.env.ADMIN_CORS ??
//         'http://localhost:7000,http://127.0.0.1:7000,http://localhost:7001',
//       authCors:
//         process.env.AUTH_CORS ??
//         'http://localhost:3000,http://127.0.0.1:3000',
//       jwtSecret: process.env.JWT_SECRET || "supersecret",
//       cookieSecret: process.env.COOKIE_SECRET || "supersecret",
//       // AUTH_JWKS_URL is consumed by custom middlewares to verify JWTs from the storefront
//     },
//     currencies: [
//       {
//         code: "inr",
//         symbol: "₹",
//         symbol_native: "₹",
//         name: "Indian Rupee",
//       },
//     ],
//   },
//   jobs: {
//     // Enable scheduled job processing (works without Redis)
//     enabled: true,
//   },
// })

import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    databaseDriverOptions: {
      ssl: false,
    },
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
      // AUTH_JWKS_URL is consumed by custom middlewares to verify JWTs from the storefront
    },
    currencies: [
      {
        code: "inr",
        symbol: "₹",
        symbol_native: "₹",
        name: "Indian Rupee",
      },
    ],
  },
  jobs: {
    // Enable scheduled job processing (works without Redis)
    enabled: true,
  },

  // 👇👇 ADD THIS BLOCK 👇👇
  admin: {
    vite: (config) => {
      config.server = config.server || {}; // Ensure server object exists
      config.server.allowedHosts = [
        ...(config.server.allowedHosts || []),
        "admin.shilamurti.com",
      ];
      return config;
    },
  },
  // 👆👆 END OF NEW BLOCK 👆👆
})