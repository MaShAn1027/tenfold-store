/* Finalize API push v2: find missing blobs via GraphQL oid lookup (no content
   download), upload only those, then tree + commit + ref.  GH_TOKEN required. */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const OWNER = "MaShAn1027", NAME = "tenfold-store", BRANCH = "main";
const TOKEN = process.env.GH_TOKEN;
const H = { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" };
const API = `https://api.github.com/repos/${OWNER}/${NAME}`;

async function req(url, opts, tries = 6) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: H, ...opts });
      const text = await res.text();
      let j; try { j = JSON.parse(text); } catch { throw new Error(`non-JSON ${res.status}`); }
      if (!res.ok) { const e = new Error(`${res.status} ${j.message}`); e.status = res.status; throw e; }
      return j;
    } catch (e) {
      if (i >= tries) throw e;
      console.log(`  retry ${i}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 2500 * i));
    }
  }
}

const files = execSync("git ls-files", { encoding: "utf8" }).trim().split("\n");
const entries = files.map((f) => ({
  path: f, mode: "100644", type: "blob",
  sha: execSync(`git hash-object "${f}"`, { encoding: "utf8" }).trim(),
}));
console.log(`${entries.length} 个文件，GraphQL 批查缺失 blob…`);

const missing = [];
for (let i = 0; i < entries.length; i += 80) {
  const batch = entries.slice(i, i + 80);
  const q = `query{repository(owner:"${OWNER}",name:"${NAME}"){${batch
    .map((e, k) => `b${k}:object(oid:"${e.sha}"){ ... on Blob { oid } }`)
    .join(" ")}}}`;
  const r = await req("https://api.github.com/graphql", { method: "POST", body: JSON.stringify({ query: q }) });
  batch.forEach((e, k) => { if (!r.data.repository[`b${k}`]) missing.push(e); });
  console.log(`  已核对 ${Math.min(i + 80, entries.length)}/${entries.length}，缺失累计 ${missing.length}`);
}

if (missing.length) {
  console.log(`补传 ${missing.length} 个缺失 blob…`);
  let idx = 0, done = 0;
  async function worker() {
    while (idx < missing.length) {
      const en = missing[idx++];
      const content = readFileSync(en.path);
      await req(`${API}/git/blobs`, { method: "POST", body: JSON.stringify({ content: content.toString("base64"), encoding: "base64" }) });
      console.log(`  [${++done}/${missing.length}] ${en.path}`);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
}

console.log("建 tree…");
const tree = await req(`${API}/git/trees`, { method: "POST", body: JSON.stringify({ tree: entries }) });
const parent = await req(`${API}/git/refs/heads/${BRANCH}`);
const msg = execSync("git log -1 --pretty=%B", { encoding: "utf8" }).trim();
const commit = await req(`${API}/git/commits`, {
  method: "POST",
  body: JSON.stringify({ message: msg + "\n\n(pushed via Git Data API)", tree: tree.sha, parents: [parent.object.sha] }),
});
const fin = await fetch(`${API}/git/refs/heads/${BRANCH}`, { method: "PATCH", headers: H, body: JSON.stringify({ sha: commit.sha, force: true }) });
console.log(fin.ok ? `✓ 完成：${BRANCH} → ${commit.sha}` : `✗ ref 失败 ${fin.status}`);
