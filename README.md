# College Basketball site — how to put it online

This folder is your whole website. Live scores, box scores, play-by-play, the AP Top 25 and standings come from the free NCAA API (github.com/henrygd/ncaa-api), which reads NCAA.com. Hosting is free on Vercel's Hobby plan, which is meant for personal, non-commercial sites.

## What's in the folder

| File | What it is |
|---|---|
| `index.html` | The page layout and styling |
| `app.js` | Everything that loads and refreshes scores |
| `news.js` | The News tab stories. Edit this to post your own |
| `api/ncaa.js` | A small relay that fetches data from the NCAA API for your site |
| `package.json` | Tells Vercel how to run the relay. Leave as is |

## Put it online (about 15 minutes, no coding)

### 1. Make a GitHub account and upload the files
1. Go to github.com and sign up (free).
2. Click **+** (top right) → **New repository**. Name it something like `collegebasketball-site`. Leave it Public or pick Private, then click **Create repository**.
3. On the next page click **uploading an existing file**.
4. Unzip the folder on your computer, open it, select everything inside (including the `api` folder) and drag it onto the page.
5. Click **Commit changes**.

Check that the `api` folder shows up in the repository with `ncaa.js` inside. If you dragged files one at a time and the folder is missing, upload `api/ncaa.js` again by typing `api/ncaa.js` as the file name with **Add file → Create new file** and pasting its contents.

### 2. Connect it to Vercel
1. Go to vercel.com and choose **Sign up** → **Continue with GitHub**. Pick the free **Hobby** plan.
2. Click **Add New… → Project**, find your repository and click **Import**.
3. Leave every setting as it is and click **Deploy**.
4. After about a minute you get a link like `collegebasketball-site.vercel.app`. That's your live site.

### 3. (Optional) Use your own web address
In Vercel, open the project → **Settings → Domains** and add a domain you've bought (about $10–15 a year from any registrar). Vercel shows you exactly what to enter at the registrar.

## Making changes later
- **Post news:** edit `news.js` on GitHub (click the file → the pencil icon), save, and Vercel updates the site by itself within a minute.
- **Discord link:** it's in `index.html`. Search for `discord.gg`.
- Any change you commit on GitHub goes live automatically.

## Good to know
- Scores refresh every 20 seconds while someone has the page open.
- The free NCAA API's public server is a demo with a rate limit. The relay caches responses so your visitors share requests and don't hit the limit. If the site grows, you can run your own copy of the API (its GitHub page explains how with Docker) and point the site at it: in Vercel, **Settings → Environment Variables**, add `NCAA_API_BASE` with your server's address, then redeploy.
- If NCAA.com changes something, scores can stop until the API's author updates it. The site shows a notice and keeps retrying.
- At the start of the season, NCAA.com may still show last season's standings until conference play begins. The Standings tab shows the "Updated" date from NCAA.com.
- Data comes from NCAA.com, and their terms apply. Team logos aren't used because they're trademarked; the site shows team initials instead.
