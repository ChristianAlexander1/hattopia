#!/usr/bin/env python3
"""Incremental push to GitHub via the Git Database API.

Stages local changes, diffs the index against the REMOTE main tree, uploads
only new/changed blobs, then creates tree (with base_tree) + commit (parented
on remote main) and PATCHes refs/heads/main. Mirrors the workflow that worked
on 2026-10-15 ~04:00 WIB. Auth via custom.github surrogate (never logged).

Usage: gh_push_incremental.py /home/hatch/workspace/growtopia
"""
import base64
import json
import subprocess
import sys
import urllib.request

sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response

HOST = "api.github.com"
OWNER, REPO, BRANCH = "ChristianAlexander1", "hattopia", "main"
EXCLUDE = {".tunnel_down_reported"}  # ephemeral tunnel-watch marker, never pushed


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        raise RuntimeError("redirect refused")


def api(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"https://{HOST}{path}", data=data, method=method)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    if data:
        req.add_header("Content-Type", "application/json")
    add_surrogate_to_request(req, "custom.github", allowed_hosts=[HOST])
    try:
        with urllib.request.build_opener(NoRedirect()).open(req, timeout=120) as r:
            return read_json_response(r)
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code} on {method} {path}: {e.read().decode()[:500]}", file=sys.stderr)
        sys.exit(1)


def sh(*args, cwd):
    r = subprocess.run(args, cwd=cwd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"FAILED: {' '.join(args)}\n{r.stderr[:500]}", file=sys.stderr)
        sys.exit(1)
    return r.stdout


def main():
    repo = sys.argv[1]
    # Stage everything, then unstage junk explicitly.
    sh("git", "add", "-A", cwd=repo)
    sh("git", "reset", "-q", "--", ".tunnel_down_reported", cwd=repo)

    # Remote main state.
    ref = api("GET", f"/repos/{OWNER}/{REPO}/git/ref/heads/{BRANCH}")
    remote_commit = ref["object"]["sha"]
    commit_obj = api("GET", f"/repos/{OWNER}/{REPO}/git/commits/{remote_commit}")
    remote_tree_sha = commit_obj["tree"]["sha"]
    tree = api("GET", f"/repos/{OWNER}/{REPO}/git/trees/{remote_tree_sha}?recursive=1")
    remote = {t["path"]: t["sha"] for t in tree.get("tree", []) if t["type"] == "blob"}
    print(f"remote main {remote_commit[:7]}: {len(remote)} blobs", flush=True)

    # Local index state (path -> git blob sha; identical algorithm to GitHub's).
    local = {}
    for line in sh("git", "ls-files", "-s", cwd=repo).splitlines():
        meta, path = line.split("\t", 1)
        mode, sha, _stage = meta.split()
        if path in EXCLUDE:
            continue
        local[path] = (mode, sha)

    changed, deleted = [], []
    for path, (mode, sha) in local.items():
        if remote.get(path) != sha:
            changed.append((path, mode))
    for path in remote:
        if path not in local:
            deleted.append(path)
    print(f"changed/new: {len(changed)}, deleted: {len(deleted)}", flush=True)
    if not changed and not deleted:
        print("nothing to push")
        return

    entries = []
    for i, (path, mode) in enumerate(changed):
        with open(f"{repo}/{path}", "rb") as fh:
            content = base64.b64encode(fh.read()).decode()
        b = api("POST", f"/repos/{OWNER}/{REPO}/git/blobs",
                {"content": content, "encoding": "base64"})
        entries.append({"path": path,
                        "mode": "100755" if path.endswith(".sh") else "100644",
                        "type": "blob", "sha": b["sha"]})
        if (i + 1) % 40 == 0:
            print(f"  blobs {i+1}/{len(changed)}", flush=True)
    for path in deleted:
        entries.append({"path": path, "mode": "100644", "type": "blob", "sha": None})
    print("blobs done", flush=True)

    new_tree = api("POST", f"/repos/{OWNER}/{REPO}/git/trees",
                   {"base_tree": remote_tree_sha, "tree": entries})
    new_commit = api("POST", f"/repos/{OWNER}/{REPO}/git/commits",
                     {"message": "Hattopia: expansion blocks/seeds, gems, locks, client build v=20261015n",
                      "tree": new_tree["sha"], "parents": [remote_commit]})
    api("PATCH", f"/repos/{OWNER}/{REPO}/git/ref/heads/{BRANCH}",
        {"sha": new_commit["sha"], "force": False})
    print(f"pushed {BRANCH} @ {new_commit['sha'][:7]} "
          f"({len(changed)} upserted, {len(deleted)} deleted)")

    # Verify: remote path set must now equal local path set.
    verify_tree = api("GET", f"/repos/{OWNER}/{REPO}/git/trees/{new_tree['sha']}?recursive=1")
    remote_paths = {t["path"] for t in verify_tree.get("tree", []) if t["type"] == "blob"}
    local_paths = set(local)
    missing = local_paths - remote_paths
    extra = remote_paths - local_paths
    print(f"verify: remote={len(remote_paths)} local={len(local_paths)} "
          f"missing={len(missing)} extra={len(extra)}")
    if missing or extra:
        print(f"  MISSING: {sorted(missing)[:10]}", file=sys.stderr)
        print(f"  EXTRA: {sorted(extra)[:10]}", file=sys.stderr)
        sys.exit(1)
    print("verify OK: path sets match")


if __name__ == "__main__":
    main()
