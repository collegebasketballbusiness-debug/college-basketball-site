// sitemap.xml: tells search engines about the home page and every team page.
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
    xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  }
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
  res.end(xml);
}
