// sitemap.xml: tells search engines about the home page, every team page, every game recap and previews for the coming week.
import { readFileSync } from "node:fs";
import { join } from "node:path";

// read a site file from the deployment, or fetch it from the live site if it wasn't bundled
async function siteFile(name) {
  try { return readFileSync(join(process.cwd(), name), "utf8") }
  catch { const r = await fetch(`https://collegebasketball.news/${name}`); if (!r.ok) throw new Error(name); return r.text() }
}

const SITE = "https://collegebasketball.news";
let xml = null;

export default async function handler(req, res) {
  if (!xml) {
    const w = {};
    new Function("window", await siteFile("teams.js"))(w);
    const slugs = [...new Set(Object.values(w.TEAM_SLUGS || {}))].sort();
    const urls = [`<url><loc>${SITE}/</loc><changefreq>always</changefreq><priority>1.0</priority></url>`,
      ...slugs.map(s => `<url><loc>${SITE}/team/${s}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`)];
    // a recap page for every finished game this season
    const slug = s => String(s).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    try {
      const games = JSON.parse(await siteFile("season.json")).games || [];
      const soon = Date.now() + 7 * 864e5;
      for (const g of games) {
        if (!g.id || !g.a || !g.h) continue;
        const loc = `${SITE}/game/${g.id}/${slug(g.a[1])}-vs-${slug(g.h[1])}`;
        if (g.s === "final") urls.push(`<url><loc>${loc}</loc>${g.d ? `<lastmod>${g.d}</lastmod>` : ""}<changefreq>monthly</changefreq><priority>0.6</priority></url>`);
        else if (+g.t && +g.t * 1000 > Date.now() - 864e5 && +g.t * 1000 < soon) urls.push(`<url><loc>${loc}</loc><changefreq>hourly</changefreq><priority>0.7</priority></url>`); // previews for the coming week
      }
    } catch { /* team pages still go out */ }
    xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  }
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
  res.end(xml);
}
