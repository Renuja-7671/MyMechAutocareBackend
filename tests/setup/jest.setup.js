// tests/setup/jest.setup.js (add near top)
jest.doMock("@supabase/supabase-js", () =>
  require("../unit/__mocks__/@supabase/supabase-js")
);
