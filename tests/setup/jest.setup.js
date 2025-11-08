// tests/setup/jest.setup.js - CORRECTED VERSION

// Increase the timeout for all tests
jest.setTimeout(30000); // 30 seconds

// Mock Supabase WITHOUT causing recursion - use inline mock instead of require
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      signUp: jest.fn().mockResolvedValue({ data: { user: { id: 'mock-user-id' } }, error: null }),
      signIn: jest.fn().mockResolvedValue({ data: { user: { id: 'mock-user-id' } }, error: null }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'mock-user-id' } }, error: null }),
    },
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({ data: { path: 'mock-path' }, error: null }),
        getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'http://mock-url.com/file.jpg' } }),
        remove: jest.fn().mockResolvedValue({ data: {}, error: null }),
        list: jest.fn().mockResolvedValue({ data: [], error: null }),
      })),
    },
  })),
}));

// Mock your Supabase service directly
jest.mock('../../src/services/supabaseService', () => ({
  uploadVehicleImage: jest.fn().mockResolvedValue('http://fake-url.com/fake-image.jpg'),
  deleteMultipleVehicleImages: jest.fn().mockResolvedValue(true),
  uploadServiceDocument: jest.fn().mockResolvedValue('http://fake-url.com/fake-document.pdf'),
}));

// Global test cleanup
afterAll(async () => {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  await prisma.$disconnect();
});