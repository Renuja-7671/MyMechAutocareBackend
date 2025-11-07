// tests/setup/jest.setup.js

// Increase the timeout for all tests, especially for integration tests
// that connect to a remote database.
jest.setTimeout(30000); // 30 seconds