// tests/setup/globalSetup.js
const { execSync } = require('child_process');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

module.exports = async () => {
  // Construct the absolute path to your .env.test file
  const envPath = path.resolve(__dirname, '../../.env.test');

  // Check if the file exists before we try to read it
  if (!fs.existsSync(envPath)) {
    throw new Error('Error: The .env.test file was not found in the project root. Please create it.');
  }

  // Manually read the .env.test file and parse its contents
  const testEnv = dotenv.parse(fs.readFileSync(envPath));

  // Check that the DATABASE_URL is actually in the file
  if (!testEnv.DATABASE_URL) {
    throw new Error('Error: The DATABASE_URL variable is missing from your .env.test file.');
  }
  
  console.log('\nApplying migrations to the test database...');
  // Add a log to confirm which database we are targeting
  console.log(`Target: ${testEnv.DATABASE_URL.split('@')[1]}`); 

  try {
    // This is the key change: we create a new environment for the command
    // and explicitly set DATABASE_URL to the one from our .env.test file.
    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      env: {
        ...process.env, // Inherit all other environment variables
        DATABASE_URL: testEnv.DATABASE_URL, // Force the correct database URL
      },
    });
    console.log('Test database is ready.');
  } catch (error) {
    console.error('Failed to set up the test database. Please check the DATABASE_URL in .env.test and that the database is accessible.', error);
    process.exit(1); // Stop if migrations fail
  }
};