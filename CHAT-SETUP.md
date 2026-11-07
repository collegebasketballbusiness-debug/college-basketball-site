# Turning on the live game chat

The chat code is already on your site but stays hidden until it's connected to Supabase, the free service that stores accounts and messages. This takes about 15 minutes. You don't write any code.

---

## Part 1 — Create your Supabase project

1. Go to **supabase.com** and click **Start your project**. Choose **Continue with GitHub** and use the same GitHub account as your site.
2. Click **New project**.
   - **Organization:** your personal one, on the **Free** plan.
   - **Project name:** `cbb-chat`
   - **Database password:** click **Generate a password**, then copy it somewhere safe. You'll rarely need it.
   - **Region:** **East US** (or whichever US region is listed first).
3. Click **Create new project** and wait 1–2 minutes while it sets up.

## Part 2 — Set up the database

4. In the left sidebar, click **SQL Editor**, then **New query** (or the **+** button).
5. Open `supabase-setup.sql` from your files, copy **everything**, and paste it into the editor.
6. Click **Run** (bottom right). If Supabase warns that the query has "destructive operations," click to run it anyway. Those lines just make the setup safe to run twice.
7. You should see **"Success. No rows returned."**

## Part 3 — Sign-in settings

8. In the left sidebar, go to **Authentication → Sign In / Providers** (sometimes just **Providers**), and open **Email**.
   - Make sure Email is **enabled**.
   - Turn **off** "Confirm email," then click **Save**.
   - Why: Supabase's built-in email sender only sends a handful of emails per hour and is meant for testing. With confirmation off, people can chat right after signing up. You can switch to a real email service later.
9. Go to **Authentication → URL Configuration**.
   - **Site URL:** `https://college-basketball-site.vercel.app`, then click **Save**.

## Part 4 — Connect your site

10. Click the **gear icon (Project Settings)** at the bottom of the sidebar.
    - Under **Data API**, copy the **Project URL**. It looks like `https://abcdefghij.supabase.co`.
    - Under **API Keys**, copy the **anon / public** key. If you see tabs, it's under **Legacy API Keys**, and it's a long string starting with `eyJ`. If there's no legacy tab, copy the **Publishable key** instead.
    - **Never copy the `service_role` or "secret" key.** That one must stay private.
11. On GitHub, open **chat-config.js**, click the pencil, and paste the two values between the quotes:
    ```js
    window.CHAT_CONFIG = {
      url: "https://abcdefghij.supabase.co",
      anonKey: "eyJhbGciOi..."
    };
    ```
    Then commit. Vercel updates the site in about a minute.

## Part 5 — Make yourself the admin

12. Open your site, tap any game, click **Open chat → Create account**, and sign up with the username you want.
13. Back in Supabase, go to **SQL Editor → New query**, paste this (with your username), and click **Run**:
    ```sql
    update public.profiles set is_admin = true where username = 'YOUR_USERNAME';
    ```
14. Reload your site. You'll see an **Admin** tag next to your name, plus **Delete** and **Ban** on every message, and a red count on any message people have reported.

---

## Moderating day to day

- **Delete a message:** hover over it (tap on a phone) and click **Delete**. It disappears for everyone instantly.
- **Ban someone:** click **Ban**, then click again to confirm. They can still read but can no longer post.
- **Reports:** messages that people reported show a red "1 report" tag (visible only to admins).

Handy SQL (run in **SQL Editor**):

```sql
-- See every report, newest first
select r.created_at, m.game_id, m.username, m.body
from public.reports r join public.messages m on m.id = r.message_id
order by r.created_at desc;

-- Unban someone
update public.profiles set banned = false where username = 'THEIR_USERNAME';

-- Add another admin
update public.profiles set is_admin = true where username = 'THEIR_USERNAME';

-- Block another word
insert into public.banned_words (word) values ('newword');

-- Delete someone's account and all their messages (for privacy requests)
delete from auth.users where id = (select id from public.profiles where username = 'THEIR_USERNAME');
```

## Good to know

- **Free plan:** plenty for a site your size. Supabase may pause a free project that goes about a week with no activity. If that happens, you'll get an email and can restore it with one click in the dashboard.
- **Turning chat off:** empty the two values in `chat-config.js` and commit. The chat disappears; messages stay saved.
- **Built-in protections:** sign-ups require a 3–20 character username, an age check (13+) and agreement to the rules. The database itself enforces the word filter, the 3-second slow mode, bans, and who can delete what, so nobody can get around them by editing the website code.
