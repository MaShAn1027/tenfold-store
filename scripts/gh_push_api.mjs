/* Push the working tree to GitHub via the Git Data API — bypasses `git push`
   entirely (useful when the network kills receive-pack side-band).
   Swarm model: a concurrency pool uploads every blob in parallel, then one
   tree + one commit + one ref update finalize atomically.
   Usage: GH_TOKEN=... node scripts/gh_push_api.mjs */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const REPO = "MaShAn1027/tenfold-store";
const BRANCH = "main";
const TOKEN = process.env.GH_TOKEN;
if (!TOKEN) { console.error("需要 GH_TOKEN"); process.exit(1); }

const API = `https://api.github.com/repos/${REPO}`;
const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
};

async function gh(path, body, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(API + path, { method: body ? "POST" : "GET", headers, body: body && JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(`${res.status} ${j.message}`);
      return j;
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

const files = execSync("git ls-files", { encoding: "utf8" }).trim().split("\n");
console.log(`共 ${files.length} 个文件，蜂群并发上传 blob（并发=8）…`);

const blobs = new Array(files.length);
let done = 0, idx = 0;
async function worker(wid) {
  while (idx < files.length) {
    const i = idx++;
    const f = files[i];
    const content = readFileSync(f);
    const blob = await gh("/git/blobs", { content: content.toString("base64"), encoding: "base64" });
    blobs[i] = { path: f, mode: "100644", type: "blob", sha: blob.sha };
    if (++done % 25 === 0 || done === files.length) console.log(`  [${done}/${files.length}]`);
  }
}
await Promise.all(Array.from({ length: 8 }, (_, w) => worker(w)));

console.log("合成 tree…");
const tree = await gh("/git/trees", { tree: blobs });

const msg = execSync("git log -1 --pretty=%B", { encoding: "utf8" }).trim();
const parent = await gh(`/git/refs/heads/${BRANCH}`);
const commit = await gh("/git/commits", {
  message: msg + "\n\n(pushed via Git Data API)",
  tree: tree.sha,
  parents: [parent.object.sha],
});
console.log("commit:", commit.sha);

const res = await fetch(`${API}/git/refs/heads/${BRANCH}`, {
  method: "PATCH", headers, body: JSON.stringify({ sha: commit.sha, force: true }),
});
console.log(res.ok ? `✓ 已更新分支 ${BRANCH}` : `✗ ref 更新失败 ${res.status}`);
