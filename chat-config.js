// Live chat settings. Fill these in from Supabase → Project Settings → API (see CHAT-SETUP.md).
// Both values are safe to be public: the database rules in supabase-setup.sql decide what anyone can do.
// Leave them empty to turn the chat off.
window.CHAT_CONFIG = {
  url: "https://dpehfxkozkvceetwkbba.supabase.co",      // Project URL, like "https://abcdefghijk.supabase.co"
  anonKey: "sb_publishable_C_uc2r3fbhFvUtUwc9JvbA_hVEf0Fmc"   // the publishable key (or legacy "anon" key) (a long string starting with "eyJ")
};
