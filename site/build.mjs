// ault3d.io site builder — no dependencies, just Node 18+.
//   npm run build         -> builds ./dist from "Website Pages/2D Version"
//   npm run dev           -> builds, then serves http://localhost:4321 and rebuilds on changes
//
// Content rules are documented in "Website Pages/2D Version/README.md".
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, cpSync, existsSync, statSync, watch } from "node:fs";
import { join, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const SITE = dirname(fileURLToPath(import.meta.url));
const REPO = join(SITE, "..");
const CONTENT = join(REPO, "Website Pages", "2D Version");
const OUT = join(REPO, "dist");

const IMG = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"]);
const VID = new Set([".mp4", ".webm", ".mov"]);
const LINK_LABELS = { steam: "View on Steam", itch: "Play on itch.io", youtube: "Watch on YouTube", artstation: "ArtStation", website: "Visit website", download: "Download" };

// ---------- helpers ----------
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const stripNum = (name) => name.replace(/^\d+[\s._-]*/, "");
const leadNum = (name) => (name.match(/^(\d+)/) ? Number(name.match(/^(\d+)/)[1]) : null);
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
const isHidden = (name) => name.startsWith(".") || name.startsWith("_");
const urlPath = (...parts) => "/" + parts.map((p) => encodeURIComponent(p)).join("/");

// Front matter: simple "key: value" lines between --- fences. Lists: comma-separated.
function parseMd(text) {
  text = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const meta = {};
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (m) {
    for (const line of m[1].split("\n")) {
      if (/^\s*#/.test(line) || !line.includes(":")) continue;
      const i = line.indexOf(":");
      const k = line.slice(0, i).trim().toLowerCase();
      let v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (v === "true") v = true;
      else if (v === "false") v = false;
      if (v !== "") meta[k] = v;
    }
    text = text.slice(m[0].length);
  }
  return { meta, body: text.trim() };
}

// Small Markdown subset: paragraphs, ## headings, **bold**, *italic*, [links](url), - lists, line breaks.
function inline(s) {
  return esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+|\/[^)\s]*)\)/g, (_, t, u) => `<a href="${u}"${u.startsWith("http") ? ' target="_blank" rel="noopener"' : ""}>${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}
function md(body) {
  if (!body) return "";
  return body
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n");
      if (/^#{1,3}\s/.test(lines[0])) {
        const level = lines[0].match(/^#+/)[0].length;
        const rest = lines.slice(1).join("\n");
        return `<h${level + 1}>${inline(lines[0].replace(/^#+\s*/, ""))}</h${level + 1}>${rest ? md(rest) : ""}`;
      }
      if (lines.every((l) => /^\s*[-*]\s/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s/, ""))}</li>`).join("")}</ul>`;
      return `<p>${lines.map(inline).join("<br>")}</p>`;
    })
    .join("\n");
}

// captions.txt: "filename: caption" per line (# comments allowed). Matches with or without extension.
function readCaptions(dir) {
  const f = join(dir, "captions.txt");
  const map = new Map();
  if (!existsSync(f)) return map;
  for (const line of readFileSync(f, "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#") || !line.includes(":")) continue;
    const i = line.indexOf(":");
    const key = line.slice(0, i).trim().toLowerCase();
    map.set(key, line.slice(i + 1).trim());
  }
  return map;
}
const captionFor = (caps, file) => caps.get(file.toLowerCase()) ?? caps.get(basename(file, extname(file)).toLowerCase()) ?? "";

// A .txt file (other than captions.txt) holds a video link. First non-comment line is the URL, an optional second is the caption.
function parseVideoTxt(file) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const url = lines[0] || "";
  let m;
  if ((m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/))) return { provider: "youtube", id: m[1], caption: lines[1] || "" };
  if ((m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/))) return { provider: "vimeo", id: m[1], caption: lines[1] || "" };
  return null; // empty / placeholder / unknown link: skipped
}

// ---------- read content ----------
function readMedia(dir, file, slug, rel, caps) {
  const ext = extname(file).toLowerCase();
  const src = urlPath(slug, ...rel, file);
  const copy = { from: join(dir, file), to: join(OUT, slug, ...rel, file) };
  if (IMG.has(ext)) return { item: { type: "image", src, caption: captionFor(caps, file), alt: captionFor(caps, file) || stripNum(basename(file, ext)).replace(/[-_]+/g, " ") }, copy };
  if (VID.has(ext)) return { item: { type: "loop", src, caption: captionFor(caps, file) }, copy };
  if (ext === ".txt" && file.toLowerCase() !== "captions.txt") {
    const v = parseVideoTxt(join(dir, file));
    return v ? { item: { type: "video", ...v, caption: v.caption || captionFor(caps, file) } } : {};
  }
  return {};
}

function readProject(folder) {
  const dir = join(CONTENT, folder);
  const files = readdirSync(dir).filter((f) => !isHidden(f)).sort(natural);
  const projectMd = files.find((f) => f.toLowerCase() === "project.md");
  const { meta, body } = projectMd ? parseMd(readFileSync(join(dir, projectMd), "utf8")) : { meta: {}, body: "" };
  if (meta.hidden === true || meta.draft === true) return null;

  const title = meta.title || stripNum(folder);
  const slug = meta.slug ? slugify(meta.slug) : slugify(title);
  const caps = readCaptions(dir);
  const blocks = [];
  const copies = [];
  let cover = null;

  for (const f of files) {
    const full = join(dir, f);
    const lower = f.toLowerCase();
    if (lower === "project.md" || lower === "captions.txt" || lower === "readme.md") continue;
    if (statSync(full).isDirectory()) {
      // A subfolder = one masonry section. Optional _section.md gives it a heading/intro.
      const sub = readdirSync(full).filter((x) => !isHidden(x) || x === "_section.md").sort(natural);
      const subCaps = readCaptions(full);
      const items = [];
      for (const s of sub) {
        if (s === "_section.md" || statSync(join(full, s)).isDirectory()) continue;
        const { item, copy } = readMedia(full, s, slug, [f], subCaps);
        if (item) items.push(item);
        if (copy) copies.push(copy);
      }
      const sec = existsSync(join(full, "_section.md")) ? parseMd(readFileSync(join(full, "_section.md"), "utf8")) : { meta: {}, body: "" };
      if (items.length || sec.body) blocks.push({ type: "group", title: sec.meta.title || "", html: md(sec.body), columns: Number(sec.meta.columns) || null, items });
      continue;
    }
    const ext = extname(f).toLowerCase();
    if (ext === ".md") {
      const { meta: m, body: b } = parseMd(readFileSync(full, "utf8"));
      blocks.push({ type: "text", title: m.title || "", html: md(b) });
      continue;
    }
    const { item, copy } = readMedia(dir, f, slug, [], caps);
    if (copy) copies.push(copy);
    if (!item) continue;
    if (/^cover\./i.test(f)) { cover = item.src; continue; } // cover image: home grid only
    blocks.push(item);
  }
  if (!cover) {
    const first = blocks.flatMap((b) => (b.type === "group" ? b.items : [b])).find((b) => b.type === "image");
    cover = first?.src || null;
  }

  const list = (v) => (Array.isArray(v) ? v : v ? String(v).split(",").map((x) => x.trim()).filter(Boolean) : []);
  const links = Object.keys(LINK_LABELS).filter((k) => meta[k]).map((k) => ({ type: k, url: meta[k], label: meta[`${k}_label`] || LINK_LABELS[k] }));

  return {
    folder, slug, title, cover, blocks, copies, links,
    year: meta.year || "",
    status: meta.status || "",
    summary: meta.summary || "",
    role: meta.role || "",
    studio: meta.studio || "",
    tools: list(meta.tools),
    order: meta.order != null ? Number(meta.order) : leadNum(folder) ?? 999,
    intro: md(body),
  };
}

function readSite() {
  const f = join(CONTENT, "_about.md");
  const { meta, body } = existsSync(f) ? parseMd(readFileSync(f, "utf8")) : { meta: {}, body: "" };
  const socials = ["artstation", "linkedin", "instagram", "youtube", "x", "bluesky", "itch", "github"]
    .filter((k) => meta[k])
    .map((k) => ({ label: { x: "X", itch: "itch.io", linkedin: "LinkedIn", youtube: "YouTube", artstation: "ArtStation", github: "GitHub", bluesky: "Bluesky", instagram: "Instagram" }[k], url: meta[k] }));
  return {
    name: meta.name || "Aidan Ault",
    role: meta.role || "3D Generalist",
    email: meta.email || "aidan@ault3d.io",
    url: "https://ault3d.io",
    description: meta.description || "I'm Aidan, a 3D Generalist with Industrial Design roots and a career of bringing ideas to life. I work in Rhino, Blender and Unity.",
    tools: meta.tools ? String(meta.tools).split(",").map((t) => t.trim()) : [],
    aboutHtml: md(body),
    socials,
  };
}

// ---------- templates ----------
function layout(site, projects, { title, description, body, path = "/", ogImage }) {
  const fullTitle = title ? `${title} — ${site.name}` : `${site.name} — ${site.role}`;
  const nav = [["/", "Work"], ["/about/", "About"], ["/contact/", "Contact"]]
    .map(([href, label]) => {
      const current = href === "/" ? path === "/" || projects.some((p) => path === `/${p.slug}/`) : path === href;
      return `<a href="${href}"${current ? ' aria-current="page"' : ""}>${label}</a>`;
    })
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || site.description)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description || site.description)}">
${ogImage ? `<meta property="og:image" content="${site.url}${ogImage}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${site.url}${path}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@300;400;700&family=Inter:wght@500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
<header class="site-header">
  <a class="logo" href="/">${esc(site.name)}<span class="sep">|</span><span class="role">${esc(site.role)}</span></a>
  <nav class="site-nav">${nav}</nav>
</header>
<main>
${body}
</main>
<footer class="site-footer">
  <a href="#top" class="to-top" onclick="window.scrollTo({top:0,behavior:'smooth'});return false;">↑ Back to top</a>
  <p>© ${new Date().getFullYear()} ${esc(site.name)} · <a href="mailto:${esc(site.email)}">${esc(site.email)}</a></p>
</footer>
<script src="/assets/site.js" defer></script>
</body>
</html>`;
}

const figure = (b) => {
  const cap = b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : "";
  if (b.type === "image") return `<figure><a href="${b.src}" class="lb" data-lightbox data-caption="${esc(b.caption)}"><img src="${b.src}" alt="${esc(b.alt)}" loading="lazy" decoding="async"></a>${cap}</figure>`;
  if (b.type === "loop") return `<figure><video src="${b.src}" autoplay loop muted playsinline preload="metadata"></video>${cap}</figure>`;
  if (b.type === "video") {
    const src = b.provider === "youtube" ? `https://www.youtube-nocookie.com/embed/${b.id}?rel=0` : `https://player.vimeo.com/video/${b.id}`;
    return `<figure><div class="ratio"><iframe src="${src}" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="${esc(b.caption || "Video")}"></iframe></div>${cap}</figure>`;
  }
  return "";
};

function renderBlocks(blocks) {
  return blocks
    .map((b) => {
      if (b.type === "text") return `<section class="block block-text">${b.title ? `<h2>${esc(b.title)}</h2>` : ""}${b.html}</section>`;
      if (b.type === "group") {
        const n = b.columns || (b.items.length <= 1 ? 1 : b.items.length === 2 || b.items.length === 4 ? 2 : 3);
        const head = b.title || b.html ? `<header class="group-head">${b.title ? `<h2>${esc(b.title)}</h2>` : ""}${b.html}</header>` : "";
        return `<section class="block block-group">${head}<div class="masonry cols-${n}">${b.items.map(figure).join("")}</div></section>`;
      }
      return `<div class="block block-full">${figure(b)}</div>`;
    })
    .join("\n");
}

function projectPage(site, projects, p, i) {
  const prev = projects[(i - 1 + projects.length) % projects.length];
  const next = projects[(i + 1) % projects.length];
  const facts = [p.role && ["Role", p.role], p.studio && ["Studio", p.studio], p.tools.length && ["Tools", p.tools.join(", ")]].filter(Boolean);
  const links = p.links.map((l) => `<a class="btn btn-${l.type}" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join("");
  const body = `<article class="project">
  <header class="project-head">
    <h1>${esc(p.title)}</h1>
    ${p.year || p.status ? `<p class="project-year">${esc(p.year)}${p.status === "wip" ? `${p.year ? " · " : ""}Work in progress` : ""}</p>` : ""}
    ${p.intro ? `<div class="project-intro">${p.intro}</div>` : ""}
    ${facts.length ? `<dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
    ${links ? `<div class="links">${links}</div>` : ""}
  </header>
  <div class="blocks">
${renderBlocks(p.blocks)}
  </div>
  ${projects.length > 1 ? `<nav class="pager">
    <a href="/${prev.slug}/" class="prev">← ${esc(prev.title)}</a>
    <a href="/" class="all">All work</a>
    <a href="/${next.slug}/" class="next">${esc(next.title)} →</a>
  </nav>` : `<nav class="pager"><span></span><a href="/" class="all">All work</a><span></span></nav>`}
</article>`;
  return layout(site, projects, { title: p.title, description: p.summary || undefined, body, path: `/${p.slug}/`, ogImage: p.cover });
}

const coverCard = (p) => `<a class="cover" href="/${p.slug}/">
  <div class="cover-img">${p.cover ? `<img src="${p.cover}" alt="" loading="lazy" decoding="async">` : ""}</div>
  <div class="cover-meta">
    <span class="cover-title">${esc(p.title)}${p.status === "wip" ? ' <span class="badge">WIP</span>' : ""}</span>
    ${p.year ? `<span class="cover-year">${esc(p.year)}</span>` : ""}
  </div>
</a>`;

// ---------- build ----------
function build() {
  const t0 = Date.now();
  if (!existsSync(CONTENT)) throw new Error(`Content folder not found: ${CONTENT}`);
  const site = readSite();
  const projects = readdirSync(CONTENT)
    .filter((f) => !isHidden(f) && statSync(join(CONTENT, f)).isDirectory())
    .map(readProject)
    .filter(Boolean)
    .sort((a, b) => a.order - b.order || natural(a.title, b.title));

  const slugs = new Set();
  for (const p of projects) {
    if (slugs.has(p.slug)) throw new Error(`Two projects share the address /${p.slug}/ — give one a different title or slug.`);
    slugs.add(p.slug);
  }

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  cpSync(join(SITE, "public"), OUT, { recursive: true });
  const write = (rel, html) => { const f = join(OUT, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, html); };

  for (const p of projects) for (const c of p.copies) { mkdirSync(dirname(c.to), { recursive: true }); cpSync(c.from, c.to); }

  write("index.html", layout(site, projects, { body: `<section class="covers">${projects.map(coverCard).join("\n")}</section>`, path: "/", ogImage: projects[0]?.cover }));
  projects.forEach((p, i) => write(`${p.slug}/index.html`, projectPage(site, projects, p, i)));
  write("about/index.html", layout(site, projects, {
    title: "About", path: "/about/",
    body: `<section class="page page-about"><h1>About</h1>${site.aboutHtml || `<p>${esc(site.description)}</p>`}
  ${site.tools.length ? `<p class="tools">${site.tools.map((t) => `<span>${esc(t)}</span>`).join("")}</p>` : ""}
  <p><a class="btn" href="/contact/">Get in touch</a></p></section>`,
  }));
  write("contact/index.html", layout(site, projects, {
    title: "Contact", path: "/contact/",
    body: `<section class="page page-contact"><h1>Contact</h1>
  <p>For work, collaborations or just to say hello:</p>
  <p class="email"><a href="mailto:${esc(site.email)}">${esc(site.email)}</a></p>
  ${site.socials.length ? `<ul class="socials">${site.socials.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`).join("")}</ul>` : ""}
</section>`,
  }));
  write("404.html", layout(site, projects, { title: "Not found", body: `<section class="page"><h1>Page not found</h1><p><a href="/">Back to the work</a></p></section>` }));

  console.log(`Built ${projects.length} project${projects.length === 1 ? "" : "s"} → dist/  (${Date.now() - t0} ms)`);
  for (const p of projects) console.log(`  /${p.slug}/  ${p.blocks.length} sections, ${p.copies.length} files`);
}

build();

// ---------- dev server ----------
if (process.argv.includes("--serve")) {
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime" };
  const port = Number(process.env.PORT) || 4321;
  http.createServer((req, res) => {
    let p = join(OUT, decodeURIComponent(req.url.split("?")[0]));
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
    if (!existsSync(p)) { res.writeHead(404, { "content-type": types[".html"] }); return res.end(readFileSync(join(OUT, "404.html"))); }
    res.writeHead(200, { "content-type": types[extname(p).toLowerCase()] || "application/octet-stream" });
    res.end(readFileSync(p));
  }).listen(port, () => console.log(`\nPreview: http://localhost:${port}  (rebuilds when content changes, Ctrl+C to stop)`));
  let timer;
  for (const d of [CONTENT, join(SITE, "public")]) {
    watch(d, { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(() => { try { build(); } catch (e) { console.error(e.message); } }, 300); });
  }
}
