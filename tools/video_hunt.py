#!/usr/bin/env python3
"""Uji apakah gateway benar-benar bisa generate video, bukan cuma pajang model."""
import argparse, json, re, socket, sys, time, urllib.request, urllib.error
import concurrent.futures as cf

VID = re.compile(r"\b(video|sora|veo\d?|kling|seedance|jimeng|hailuo|runway|pika|ltx"
                 r"|mochi|cogvideo|pixverse|framepack|wan2\.[0-9]|grok-video"
                 r"|grok-imagine|agnes-video)\b", re.I)
NOTVID = re.compile(r"detector|ocr|chat$|instruct|t1\b|hy4|inkling|embedding|rerank", re.I)


def get(url, t=8):
    q = urllib.request.Request(url); q.add_header("User-Agent", "Mozilla/5.0")
    try:
        with urllib.request.urlopen(q, timeout=t) as y:
            return y.status, y.read(400_000).decode("utf-8", "ignore")
    except urllib.error.HTTPError as e:
        return e.code, e.read(20_000).decode("utf-8", "ignore")
    except Exception:
        return None, ""


def post(url, payload, t=150, key=None):
    q = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST")
    q.add_header("Content-Type", "application/json")
    q.add_header("User-Agent", "Mozilla/5.0")
    if key:
        q.add_header("Authorization", "Bearer " + key)
    try:
        with urllib.request.urlopen(q, timeout=t) as y:
            return y.status, y.read(2_000_000).decode("utf-8", "ignore")
    except urllib.error.HTTPError as e:
        return e.code, e.read(20_000).decode("utf-8", "ignore")
    except Exception as e:
        return None, str(e)[:120]


def models_for(ip, port):
    for path in ("/v1/models", "/api/v1/models"):
        st, body = get("http://%s:%d%s" % (ip, port, path))
        if st == 200:
            try:
                d = json.loads(body)
            except Exception:
                return []
            if isinstance(d, list):
                return [m.get("id") or m.get("name", "") for m in d if isinstance(m, dict)]
            if isinstance(d, dict):
                for k in ("data", "models"):
                    if isinstance(d.get(k), list):
                        return [m.get("id") or m.get("name", "") if isinstance(m, dict) else str(m)
                                for m in d[k]]
    return []


def video_models(ms):
    v = [m for m in ms if VID.search(m) and not NOTVID.search(m)]
    v.sort(key=lambda m: (0 if re.search(r"video|\.mp4|sora|veo|kling|seedance", m, re.I) else 1,
                          0 if not re.search(r"image|-img|preview", m, re.I) else 1,
                          len(m)))
    return v


def try_generate(ip, port, model, prompt, key=None, timeout=150):
    st, body = post("http://%s:%d/v1/chat/completions" % (ip, port),
                    {"model": model, "stream": True, "max_tokens": 4000,
                     "messages": [{"role": "user", "content": prompt}]},
                    t=timeout, key=key)
    if st != 200 or not body:
        return False, "HTTP %s" % st, None
    if len(body) < 200 and ("authorization" in body or 'code":-' in body):
        return False, body[:140].replace("\n", " "), None
    done = "100%" in body or "generated_video" in body or ".mp4" in body
    urls = re.findall(r'src="(http[^"]+\.mp4)"', body) or \
           re.findall(r'(https?://[^\s"\\\)\]]+\.mp4)', body)
    url = urls[0].replace("127.0.0.1", ip).replace("localhost", ip) if urls else None
    if done or url:
        return True, "generate OK", url
    return False, "hidup tapi bukan video (%d bytes)" % len(body), None


def one(line, prompt, key, gt):
    line = line.strip()
    if not line or line.startswith("#"):
        return None
    if ":" in line:
        ip, _, port = line.partition(":")
        port = int(port.split()[0])
    else:
        ip, port = line, 8000
    ms = models_for(ip, port)
    if not ms:
        return None
    vm = video_models(ms)
    if not vm:
        return None
    rec = {"ip": ip, "port": port, "n_models": len(ms), "video_models": vm}
    ok, note, url = False, "", None
    for m in vm[:3]:
        ok, note, url = try_generate(ip, port, m, prompt, key, gt)
        if ok:
            rec["works"] = True
            rec["working_model"] = m
            break
        if "authorization" in note or "no credits" in note.lower():
            break
    rec.update({"works": ok, "note": note, "sample_url": url})
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True, help="daftar IP atau IP:PORT per baris")
    ap.add_argument("--workers", type=int, default=100)
    ap.add_argument("--gen-timeout", type=int, default=150)
    ap.add_argument("--key", default=None)
    ap.add_argument("--prompt",
                    default="Generate a 5 second video: an orange cat jumps onto a wooden table")
    ap.add_argument("--output", default="video_results.jsonl")
    a = ap.parse_args()

    lines = [l for l in open(a.file) if l.strip() and not l.startswith("#")]
    print("[*] %d target, %d workers" % (len(lines), a.workers))

    found, t0 = [], time.time()
    with cf.ThreadPoolExecutor(a.workers) as ex:
        for rec in ex.map(lambda l: one(l, a.prompt, a.key, a.gen_timeout), lines):
            if rec:
                found.append(rec)
                tag = "BISA" if rec["works"] else "etalase"
                print("[%s] %s:%d %d model %s" %
                      (tag, rec["ip"], rec["port"], len(rec["video_models"]), rec["note"]))

    with open(a.output, "w") as fh:
        for r in found:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")

    work = [r for r in found if r.get("works")]
    print("\n=== RINGKASAN ===")
    print("target        : %d" % len(lines))
    print("punya model   : %d" % len(found))
    print("BENERAN jalan : %d" % len(work))
    print("durasi        : %.0fs" % (time.time() - t0))
    for r in work:
        print("  %s:%d  %s  -> %s" % (r["ip"], r["port"], r.get("working_model"),
                                       (r.get("sample_url") or "")[:140]))

    # ringkasan buat komentar PR
    with open("video_summary.txt", "w") as fh:
        fh.write("video-gateway scan: %d target, %d punya model video, %d BENERAN jalan\n\n"
                 % (len(lines), len(found), len(work)))
        for r in work:
            fh.write("%s:%d  %s\n   %s\n" % (r["ip"], r["port"], r.get("working_model"),
                                             r.get("sample_url") or ""))
        if not work:
            fh.write("(tidak ada yang lolos uji generate)\n")


if __name__ == "__main__":
    main()
