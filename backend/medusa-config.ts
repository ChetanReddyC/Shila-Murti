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

// import { loadEnv, defineConfig } from '@medusajs/framework/utils'

// loadEnv(process.env.NODE_ENV || 'development', process.cwd())

// module.exports = defineConfig({
//   projectConfig: {
//     databaseUrl: process.env.DATABASE_URL,
//     databaseDriverOptions: {
//       ssl: false,
//     },
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


//   admin: {
//     vite: (config) => {
//       config.server = config.server || {}; // Ensure server object exists
//       config.server.allowedHosts = [
//         ...(config.server.allowedHosts || []),
//         "admin.shilamurti.com",
//       ];
//       return config;
//     },
//   },
//   // 👆👆 END OF NEW BLOCK 👆👆
// })

import { loadEnv, defineConfig } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    databaseDriverOptions: {
      ssl: false,
    },
    http: {
      /**
       * ✅ PROD + DEV CORS
       * - In production set STORE_CORS / ADMIN_CORS / AUTH_CORS env vars.
       * - If env vars are not set, we fallback to a safe list that includes your domains + localhost.
       */
      storeCors:
        process.env.STORE_CORS ??
        "https://shilamurti.com,https://www.shilamurti.com,http://localhost:3000,http://127.0.0.1:3000",

      adminCors:
        process.env.ADMIN_CORS ??
        "https://admin.shilamurti.com,http://localhost:7000,http://127.0.0.1:7000,http://localhost:7001",

      authCors:
        process.env.AUTH_CORS ??
        "https://shilamurti.com,https://www.shilamurti.com,http://localhost:3000,http://127.0.0.1:3000",

      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
      // AUTH_JWKS_URL is consumed by custom middlewares to verify JWTs from the storefront
    },
  },

  // (Optional) This mainly affects dev server behavior; safe to keep.
  admin: {
    vite: (config) => {
      config.server = config.server || {}
      config.server.allowedHosts = [
        ...(config.server.allowedHosts || []),
        "admin.shilamurti.com",
      ]
      return config
    },
  },

  // Google Cloud Storage configuration via S3-compatible API
  modules: [
    {
      resolve: "@medusajs/file-s3",
      options: {
        file_url: process.env.GCS_FILE_URL,
        access_key_id: process.env.GCS_ACCESS_KEY_ID,
        secret_access_key: process.env.GCS_SECRET_ACCESS_KEY,
        region: process.env.GCS_REGION || "auto",
        bucket: process.env.GCS_BUCKET,
        endpoint: "https://storage.googleapis.com",
        // GCS-specific: use path-style URLs
        additional_client_config: {
          forcePathStyle: true,
        },
      },
    },
  ],
})
