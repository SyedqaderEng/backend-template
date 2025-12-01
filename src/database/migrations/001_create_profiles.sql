-- Migration: Create profiles table
-- Description: Initial profiles table for user data synced from Clerk
-- Created: 2024

-- Create custom types
CREATE TYPE subscription_status AS ENUM (
  'active',
  'cancelled',
  'past_due',
  'trialing',
  'incomplete',
  'incomplete_expired',
  'unpaid'
);

CREATE TYPE plan_type AS ENUM (
  'free',
  'basic',
  'pro',
  'enterprise'
);

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  -- Primary key (UUID)
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Clerk user ID (unique, used for syncing with Clerk)
  clerk_user_id TEXT NOT NULL UNIQUE,

  -- Basic user information
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,

  -- Subscription information
  plan plan_type NOT NULL DEFAULT 'free',
  subscription_status subscription_status,

  -- Stripe integration
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX idx_profiles_clerk_user_id ON profiles(clerk_user_id);
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_stripe_customer_id ON profiles(stripe_customer_id);
CREATE INDEX idx_profiles_plan ON profiles(plan);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to profiles table
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid()::text = clerk_user_id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid()::text = clerk_user_id)
  WITH CHECK (auth.uid()::text = clerk_user_id);

-- Policy: Service role can do everything (bypasses RLS anyway, but explicit)
-- Note: Service role key always bypasses RLS

-- Comments for documentation
COMMENT ON TABLE profiles IS 'User profiles synced from Clerk with subscription data';
COMMENT ON COLUMN profiles.clerk_user_id IS 'Unique identifier from Clerk authentication';
COMMENT ON COLUMN profiles.plan IS 'Current subscription plan level';
COMMENT ON COLUMN profiles.subscription_status IS 'Current Stripe subscription status';
