// Live chat settings. Fill these in from Supabase → Project Settings → API (see CHAT-SETUP.md).
// Both values are safe to be public: the database rules in supabase-setup.sql decide what anyone can do.
// Leave them empty to turn the chat off.
window.CHAT_CONFIG = {
  url: "",      // Project URL, like "https://abcdefghijk.supabase.co"
  anonKey: ""   // the "anon" "public" key (a long string starting with "eyJ")
};
