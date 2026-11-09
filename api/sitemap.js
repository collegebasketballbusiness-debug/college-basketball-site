// sitemap.xml: tells search engines about the home page, every team page and every game recap.
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
      for (const g of games) if (g.s === "final" && g.id && g.a && g.h)
        urls.push(`<url><loc>${SITE}/game/${g.id}/${slug(g.a[1])}-vs-${slug(g.h[1])}</loc>${g.d ? `<lastmod>${g.d}</lastmod>` : ""}<changefreq>monthly</changefreq><priority>0.6</priority></url>`);
    } catch { /* team pages still go out */ }
    xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  }
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
  res.end(xml);
}
