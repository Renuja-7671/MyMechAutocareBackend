// tests/__mocks__/@supabase/supabase-js.js
// Manual Jest mock for @supabase/supabase-js used by unit tests.
// Exports a createClient() that returns a client shaped like what your service expects.
// Also exposes __mocks__ so tests can inspect the jest.fn() mocks.

const uploadMock = jest.fn(); // used for storage upload
const getPublicUrlMock = jest.fn(); // used for getting public URL
const removeMock = jest.fn(); // used for deleting objects

// createClient mock - return shape expected by your service module
const createClient = jest.fn(() => {
  return {
    // If your code accesses supabase.storage.from(bucket).upload(...)
    storage: {
      from: jest.fn(() => ({
        upload: uploadMock,
        getPublicUrl: getPublicUrlMock,
        remove: removeMock,
      })),
    },

    // Provide `from()` for table operations if used (select/insert/update)
    from: jest.fn(() => ({
      select: jest.fn().mockResolvedValue({ data: [], error: null }),
      insert: jest.fn().mockResolvedValue({ data: [], error: null }),
      update: jest.fn().mockResolvedValue({ data: [], error: null }),
      delete: jest.fn().mockResolvedValue({ data: [], error: null }),
    })),

    // Minimal auth namespace (add more if your code uses it)
    auth: {
      signIn: jest.fn().mockResolvedValue({ data: null, error: null }),
      signUp: jest.fn().mockResolvedValue({ data: null, error: null }),
    },
  };
});

// Export the manual mock for Jest to pick up
module.exports = {
  createClient,
  // expose the internal jest.fn() mocks for assertions inside tests
  __mocks__: {
    uploadMock,
    getPublicUrlMock,
    removeMock,
  },
};
