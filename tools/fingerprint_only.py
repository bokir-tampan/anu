#!/usr/bin/env python3
"""fingerprint_only — probe a list of ip:port for OpenAI-compatible /v1/models.

Lean: exactly ONE HTTP request per target (plus optional auth-less retry).
Input: file of ip:port lines (masscan output already reduced).
Output: hits.txt (lines: ip:port<TAB>model_csv) + stats to stderr.

Usage:
  python fingerprint_only.py --file shard.txt --workers 300 --timeout 3 --output hits.txt
"""
import argparse, json, socket, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36"

def probe(target, timeout):
    """Return dict on success else None."""
    ip, port = target
    url = f"http://{ip}:{port}/v1/models"
    try:
        req = Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
        with urlopen(req, timeout=timeout) as r:
            if r.status != 200:
                return None
            body = r.read(65536).decode("utf-8", "replace")
    except Exception:
        return None
    try:
        d = json.loads(body)
    except Exception:
        return None
    data = d.get("data") if isinstance(d, dict) else None
    if not isinstance(data, list) or not data:
        return None
    ids = []
    for m in data[:200]:
        if isinstance(m, dict) and m.get("id"):
            ids.append(str(m["id"]))
        elif isinstance(m, str):
            ids.append(m)
    if not ids:
        return None
    # Strong signal: openai-ish model list
    joined = ",".join(ids)
    return {"ip": ip, "port": int(port), "models": joined, "count": len(ids)}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True)
    ap.add_argument("--workers", type=int, default=300)
    ap.add_argument("--timeout", type=float, default=3.0)
    ap.add_argument("--output", default="hits.txt")
    a = ap.parse_args()

    targets = []
    for line in open(a.file):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        host, _, p = line.partition(":")
        if host.count(".") != 3 or not p.isdigit():
            continue
        targets.append((host, int(p)))

    print(f"[*] {len(targets)} targets, workers={a.workers}, timeout={a.timeout}", file=sys.stderr)
    hits = []
    done = 0
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        futs = [ex.submit(probe, t, a.timeout) for t in targets]
        for f in as_completed(futs):
            done += 1
            if done % 5000 == 0:
                el = time.time() - t0
                rate = done / el if el else 0
                eta = (len(targets) - done) / rate if rate else 0
                print(f"[*] {done}/{len(targets)} hits={len(hits)} rate={rate:.0f}/s eta={eta:.0f}s", file=sys.stderr)
            r = f.result()
            if r:
                hits.append(r)

    Path(a.output).write_text("\n".join(
        f"{h['ip']}:{h['port']}\t{h['count']}\t{h['models']}" for h in hits))
    print(f"[*] DONE hits={len(hits)} in {time.time()-t0:.0f}s -> {a.output}", file=sys.stderr)
    for h in hits[:20]:
        print(f"  {h['ip']}:{h['port']} n={h['count']} {h['models'][:120]}", file=sys.stderr)

if __name__ == "__main__":
    main()
