// THE HOUSE — config
// Fill in the two values from your Supabase project.
// Settings > API in the Supabase dashboard.
// The anon key is safe to have in a public repo. It does nothing without the password.

window.HOUSE_CONFIG = {
  SUPABASE_URL: "PASTE_PROJECT_URL_HERE",
  SUPABASE_ANON_KEY: "PASTE_ANON_PUBLIC_KEY_HERE",

  // The one shared login both of you use. Create this user in Supabase > Authentication > Users.
  SHARED_EMAIL: "house@example.com",

  PEOPLE: ["Dwight", "Kander"]
};
