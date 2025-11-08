// tests/__mocks__/@supabase/supabase-js.js
// This manual mock ensures no real network or Supabase calls happen during tests.

const uploadMock = jest.fn();
const getPublicUrlMock = jest.fn();
const removeMock = jest.fn();

const storageFromMock = jest.fn(() => ({
  upload: uploadMock,
  getPublicUrl: getPublicUrlMock,
  remove: removeMock,
}));

// Mocked createClient
const createClient = jest.fn(() => ({
  storage: {
    from: storageFromMock,
  },
}));

// Export mocks so test files can reset or inspect them
module.exports = {
  createClient,
  __mocks__: {
    uploadMock,
    getPublicUrlMock,
    removeMock,
    storageFromMock,
  },
};
