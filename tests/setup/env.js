// tests/setup/env.js
// Ensure environment variables are present before any module import that
// checks process.env at module load time (setupFiles runs before tests are required).

process.env.NODE_ENV = process.env.NODE_ENV || "test";
// These are safe dummy values for unit tests — they prevent modules from throwing
// on import. They won't cause any real network calls when using the manual mock.
process.env.SUPABASE_URL =
  process.env.SUPABASE_URL || "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY || "fake-service-key";
