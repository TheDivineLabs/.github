import { mkdir, writeFile } from "node:fs/promises";

const organization = "TheDivineLabs";
const token = process.env.GITHUB_TOKEN;
const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "divinelabs-profile",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

async function api(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${response.statusText}`);
  return response.json();
}

async function allPages(path) {
  const items = [];
  for (let page = 1; ; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const batch = await api(`${path}${separator}per_page=100&page=${page}`);
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}

const repos = await allPages(`/orgs/${organization}/repos?type=public&sort=updated`);
const languageTotals = new Map();
let releases = 0;

await Promise.all(repos.map(async (repo) => {
  const [languages, repoReleases] = await Promise.all([
    api(`/repos/${organization}/${repo.name}/languages`),
    allPages(`/repos/${organization}/${repo.name}/releases`),
  ]);
  releases += repoReleases.length;
  for (const [language, bytes] of Object.entries(languages)) {
    languageTotals.set(language, (languageTotals.get(language) || 0) + bytes);
  }
}));

const stars = repos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
const forks = repos.reduce((sum, repo) => sum + repo.forks_count, 0);
const languages = [...languageTotals.entries()].sort((a, b) => b[1] - a[1]);
const languageBytes = languages.reduce((sum, [, bytes]) => sum + bytes, 0) || 1;
const palette = ["#38BDF8", "#0EA5E9", "#2563EB", "#6366F1", "#22D3EE", "#60A5FA"];

const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const metric = (x, y, label, value, color = "#38BDF8") => `
  <g transform="translate(${x} ${y})">
    <rect width="184" height="72" rx="13" fill="#0B1220" stroke="#1E3A5F"/>
    <text x="16" y="29" class="label">${escapeXml(label)}</text>
    <text x="16" y="55" class="value" fill="${color}">${escapeXml(value)}</text>
  </g>`;

const achievement = (x, y, title, detail, icon) => `
  <g transform="translate(${x} ${y})">
    <rect width="204" height="72" rx="13" fill="#0B1220" stroke="#1E3A5F"/>
    <circle cx="34" cy="36" r="20" fill="#082F49" stroke="#0EA5E9"/>
    <text x="34" y="43" text-anchor="middle" class="icon">${icon}</text>
    <text x="64" y="31" class="achievement">${escapeXml(title)}</text>
    <text x="64" y="51" class="detail">${escapeXml(detail)}</text>
  </g>`;

let barX = 34;
const bars = languages.slice(0, 6).map(([language, bytes], index) => {
  const width = Math.max(3, Math.round((bytes / languageBytes) * 852));
  const rect = `<rect x="${barX}" y="250" width="${width}" height="10" fill="${palette[index]}"/>`;
  barX += width;
  return rect;
}).join("");

const legend = languages.slice(0, 4).map(([language, bytes], index) => {
  const percentage = ((bytes / languageBytes) * 100).toFixed(1);
  const x = 34 + index * 216;
  return `<circle cx="${x}" cy="286" r="5" fill="${palette[index]}"/><text x="${x + 12}" y="291" class="legend">${escapeXml(language)} ${percentage}%</text>`;
}).join("");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="920" height="316" viewBox="0 0 920 316" role="img" aria-labelledby="title desc">
  <title id="title">DivineLabs public organization metrics</title>
  <desc id="desc">Automatically updated public repository statistics and achievements.</desc>
  <style>
    text { font-family: Inter, Segoe UI, Arial, sans-serif; }
    .heading { fill: #E0F2FE; font-size: 15px; font-weight: 700; letter-spacing: 1.6px; }
    .label { fill: #64748B; font-size: 11px; font-weight: 700; letter-spacing: .8px; }
    .value { font-size: 22px; font-weight: 800; }
    .achievement { fill: #E0F2FE; font-size: 12px; font-weight: 700; }
    .detail { fill: #64748B; font-size: 11px; }
    .icon { fill: #7DD3FC; font-size: 16px; font-weight: 800; }
    .legend { fill: #94A3B8; font-size: 11px; }
  </style>
  <rect x="1" y="1" width="918" height="314" rx="18" fill="#070B13" stroke="#1E3A5F"/>
  <text x="34" y="35" class="heading">STATS</text>
  <text x="488" y="35" class="heading">ACHIEVEMENTS</text>
  ${metric(34, 52, "PUBLIC REPOSITORIES", repos.length)}
  ${metric(228, 52, "STARS", stars)}
  ${metric(34, 134, "FORKS", forks)}
  ${metric(228, 134, "RELEASES", releases)}
  ${achievement(488, 52, "OPEN SOURCE", `${repos.length} public repositories`, "◇")}
  ${achievement(702, 52, "RELEASE CRAFT", `${releases} published releases`, "↟")}
  ${achievement(488, 134, "COMMUNITY", `${stars + forks} stars and forks`, "✦")}
  ${achievement(702, 134, "MULTI STACK", `${languages.length} detected languages`, "⌁")}
  <text x="34" y="236" class="heading">LANGUAGES</text>
  <clipPath id="languageBar"><rect x="34" y="250" width="852" height="10" rx="5"/></clipPath>
  <g clip-path="url(#languageBar)">${bars}</g>
  ${legend}
  <text x="886" y="303" text-anchor="end" class="detail">public data · daily update</text>
</svg>`;

await mkdir("profile/assets", { recursive: true });
await writeFile("profile/assets/org-metrics.svg", svg, "utf8");
console.log(`Rendered ${repos.length} repositories, ${stars} stars, ${forks} forks and ${releases} releases.`);

