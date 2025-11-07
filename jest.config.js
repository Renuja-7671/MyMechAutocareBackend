// jest.config.js
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup/jest.setup.js"],

  // Add this line below
  globalSetup: "<rootDir>/tests/setup/globalSetup.js",

  verbose: true,
  collectCoverage: false, 
};