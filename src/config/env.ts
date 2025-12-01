import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Environment variables schema with validation
 * All required environment variables are defined and validated here
 */
const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  API_VERSION: z.string().default('v1'),

  // Frontend URL (for CORS)
  FRONTEND_URL: z.string().url().optional().default('http://localhost:5173'),

  // Clerk Authentication (optional for initial setup)
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_PUBLISHABLE_KEY: z.string().optional(),

  // Supabase Database (optional for initial setup)
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Stripe Payments (optional for initial setup)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRODUCT_ID_BASIC: z.string().optional(),
  STRIPE_PRODUCT_ID_PRO: z.string().optional(),
  STRIPE_PRODUCT_ID_ENTERPRISE: z.string().optional(),
  STRIPE_PRICE_ID_BASIC: z.string().optional(),
  STRIPE_PRICE_ID_PRO: z.string().optional(),
  STRIPE_PRICE_ID_ENTERPRISE: z.string().optional(),

  // Resend Email (optional for initial setup)
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),

  // UploadThing (optional for initial setup)
  UPLOADTHING_SECRET: z.string().optional(),
  UPLOADTHING_APP_ID: z.string().optional(),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

/**
 * Parse and validate environment variables
 * Throws an error if validation fails
 */
function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const env = validateEnv();

/**
 * Type-safe environment configuration
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Helper to check if we're in production
 */
export const isProduction = env.NODE_ENV === 'production';

/**
 * Helper to check if we're in development
 */
export const isDevelopment = env.NODE_ENV === 'development';

/**
 * Helper to check if we're in staging
 */
export const isStaging = env.NODE_ENV === 'staging';

/**
 * Helper to check if we're in test
 */
export const isTest = env.NODE_ENV === 'test';
