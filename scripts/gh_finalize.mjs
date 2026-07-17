/* Finalize the API push: compute blob shas locally (deterministic, same as
   remote), create the tree directly, upload any blobs GitHub reports missing,
   then commit + update ref.  GH_TOKEN required. */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const REPO = "MaShAn1027/tenfold-store";
const BRANCH = "main";
const TOKEN = process.env.GH_TOKEN;
const API = `https://api.github.com/repos/${REPO}`;
const headers = { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" };

async function gh(path, opts = {}, tries = 5) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(API + path, { headers, ...opts });
      const text = await res.text();
      let j;
      try { j = JSON.parse(text); } catch { throw new Error(`non-JSON ${res.status}: ${text.slice(0, 80)}`); }
      if (!res.ok) { const e = new Error(`${res.status} ${j.message}`); e.status = res.status; e.body = j; throw e; }
      return j;
    } catch (e) {
      if (i >= tries || e.status === 404 || e.status === 422) throw e;
      console.log(`  retry ${i}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

const files = execSync("git ls-files", { encoding: "utf8" }).trim().split("\n");
const entries = files.map((f) => ({
  path: f, mode: "100644", type: "blob",
  sha: execSync(`git hash-object "${f}"`, { encoding: "utf8" }).trim(),
}));
console.log(`${entries.length} 个文件，先直接尝试建 tree…`);

async function uploadBlob(f) {
  const content = readFileSync(f);
  await gh("/git/blobs", { method: "POST", body: JSON.stringify({ content: content.toString("base64"), encoding: "base64" }) });
}

let tree;
for (let round = 1; round <= 6; round++) {
  try {
    tree = await gh("/git/trees", { method: "POST", body: JSON.stringify({ tree: entries }) });
    break;
  } catch (e) {
    // GitHub names one missing blob at a time in the error; verify each entry instead
    console.log(`tree 失败（${e.message}），第 ${round} 轮补传缺失 blob…`);
    let missing = 0, idx = 0;
    async function worker() {
      while (idx < entries.length) {
        const en = entries[idx++];
        try {
          await gh(`/git/blobs/${en.sha}`, {}, 2);
        } catch (err) {
          if (err.status === 404) { missing++; await uploadBlob(en.path); console.log(`  补传 ${en.path}`); }
        }
      }
    }
    await Promise.all(Array.from({ length: 6 }, worker));
    console.log(`  本轮补传 ${missing} 个`);
    if (!missing && round > 1) throw new Error("无缺失但 tree 仍失败");
  }
}

console.log("tree:", tree.sha);
const parent = await gh(`/git/refs/heads/${BRANCH}`);
const msg = execSync("git log -1 --pretty=%B", { encoding: "utf8" }).trim();
const commit = await gh("/git/commits", {
  method: "POST",
  body: JSON.stringify({ message: msg + "\n\n(pushed via Git Data API)", tree: tree.sha, parents: [parent.object.sha] }),
});
const res = await fetch(`${API}/git/refs/heads/${BRANCH}`, { method: "PATCH", headers, body: JSON.stringify({ sha: commit.sha, force: true }) });
console.log(res.ok ? `✓ ${BRANCH} → ${commit.sha}` : `✗ ref 失败 ${res.status}`);
