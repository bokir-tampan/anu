#!/usr/bin/env python3
"""llm_hunt.py — uji apakah gateway benar-benar melayani LLM (bukan cuma etalase),
lalu klasifikasikan apakah farmable (register bebas verify / ada bonus / open relay).

Klasifikasi hasil (field "verdict"):
  open_relay        chat 200 TANPA API key -> langsung pakai
  farm_bonus        register sukses & quota awal > 0 -> farm beneran untung
  farmable_noverify register terbuka, tanpa email verify & tanpa turnstile (bonus ?)
  oauth_free        ada oauth gratis (github/linuxdo/wechat/telegram/oidc)
  needs_key         hidup, tapi wajib key dan tidak ada jalur daftar
  showcase          model LLM terdaftar tapi semua gagal saat dites
  dead              tidak ada respons / bukan gateway

Pemakaian:
  python llm_hunt.py --file targets.txt --workers 60 --output llm_results.jsonl
  python llm_hunt.py --file targets.txt --farm --output llm_results.jsonl
"""
import argparse
import json
import random
import re
import socket
import string
import time
import urllib.error
import urllib.request
import concurrent.futures as cf

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "application/json, text/html;q=0.9,*/*;q=0.8"}

LLM = re.compile(r"(gpt|chatgpt|claude|gemini|deepseek|qwen|glm|llama|mistral|grok|kimi|"
                 r"moonshot|sonnet|opus|haiku|o1|o3|o4|instruct|reason|thinking|flash|"
                 r"yi-|ernie|doubao|hunyuan|step-|minimax|spark|nova|command-r)", re.I)
NOTLLM = re.compile(r"(embed|rerank|tts|whisper|image|imagen|dall|flux|sdxl|sd3|video|sora|"
                    r"veo\d?|kling|seedance|jimeng|hailuo|runway|pika|moderation|ocr|"
                    r"audio|speech|upscal|music|suno|real-?esrgan)", re.I)
BONUS = re.compile(r"(free|gratis|bonus|credit|赠送|免费|白嫖|签到|试用|送\s*\d|额度|"
                   r"注册即送|每日签到)", re.I)


# ---------------------------------------------------------------- http helpers
def http(url, payload=None, key=None, timeout=25, headers=None):
    h = dict(UA)
    if headers:
        h.update(headers)
    if key:
        h["Authorization"] = "Bearer " + key
    data = json.dumps(payload).encode() if payload is not None else None
    if data is not None:
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=h,
                                 method="POST" if data is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read(600000).decode("utf-8", "ignore")
    except urllib.error.HTTPError as e:
        try:
            return e.code, e.read(60000).decode("utf-8", "ignore")
        except Exception:
            return e.code, ""
    except Exception as e:
        return 0, str(e)[:100]


def base_of(ip, port):
    return "http://%s:%s" % (ip, port)


def tcp_open(ip, port, timeout=3):
    """Filter cepat: host mati jangan dibuahi 3x HTTP timeout."""
    try:
        with socket.create_connection((ip, int(port)), timeout=timeout):
            return True
    except Exception:
        return False


# ---------------------------------------------------------------- discovery
def models_for(ip, port):
    """Return (models, status_seen). status 401/403 = gateway hidup tapi butuh key."""
    b = base_of(ip, port)
    seen = 0
    for path in ("/v1/models", "/api/v1/models", "/models"):
        st, body = http(b + path, timeout=12)
        seen = st if st in (200, 401, 403) else seen
        if st != 200 or not body.strip().startswith(("{", "[")):
            continue
        try:
            d = json.loads(body)
        except Exception:
            continue
        items = d if isinstance(d, list) else (d.get("data") or d.get("models") or [])
        out = []
        for m in items:
            if isinstance(m, dict):
                mid = m.get("id") or m.get("name") or m.get("model")
            else:
                mid = str(m)
            if mid:
                out.append(mid)
        if out:
            return out, 200
    return [], seen


def pick_llm(models):
    good = [m for m in models if LLM.search(m) and not NOTLLM.search(m)]
    good.sort(key=lambda m: (1 if re.search(r"(embed|rerank)", m, re.I) else 0,
                             1 if re.search(r"free|mini|flash|air|lite", m, re.I) else 0,
                             len(m)))
    return good


def status_probe(ip, port):
    """Khusus new-api / one-api: ambil konfigurasi registrasi + teks announcement."""
    st, body = http(base_of(ip, port) + "/api/status", timeout=12)
    if st != 200:
        return None
    try:
        d = json.loads(body)
    except Exception:
        return None
    d = d.get("data") if isinstance(d, dict) and isinstance(d.get("data"), dict) else d
    if not isinstance(d, dict):
        return None
    keep = ("system_name", "register_enabled", "email_verification", "turnstile_check",
            "github_oauth", "linuxdo_oauth", "wechat_login", "telegram_oauth",
            "oidc_enabled", "discord_oauth", "quota_per_unit", "usd_exchange_rate",
            "password_login", "password_register", "sms_verification", "top_up_link")
    info = {k: d.get(k) for k in keep if k in d}
    texts = []
    for a in (d.get("announcements") or []):
        c = a.get("content") if isinstance(a, dict) else str(a)
        texts.append(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", c or "")).strip())
    for f in (d.get("faq") or []):
        c = f.get("content") if isinstance(f, dict) else str(f)
        texts.append(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", c or "")).strip())
    info["announcements"] = [t[:400] for t in texts if t][:6]
    info["bonus_mention"] = [t[:200] for t in texts if BONUS.search(t)][:3]
    return info or None


# ---------------------------------------------------------------- live tests
def chat_test(ip, port, model, prompt, key=None, timeout=45):
    body = ""
    for stream in (False, True):
        st, body = http(base_of(ip, port) + "/v1/chat/completions",
                        {"model": model, "max_tokens": 24, "stream": stream,
                         "messages": [{"role": "user", "content": prompt}]},
                        key=key, timeout=timeout)
        if st != 200:
            return False, "HTTP %s %s" % (st, body[:90].replace("\n", " "))
        if body.lstrip().startswith("data:"):
            # SSE: ambil potongan content
            txt = ""
            for line in body.splitlines():
                if not line.startswith("data:"):
                    continue
                chunk = line[5:].strip()
                if chunk in ("", "[DONE]"):
                    continue
                try:
                    j = json.loads(chunk)
                except Exception:
                    continue
                d = (j.get("choices") or [{}])[0].get("delta") or {}
                txt += d.get("content") or d.get("reasoning_content") or ""
            if txt.strip():
                return True, txt.strip()[:100]
            continue
        try:
            j = json.loads(body)
        except Exception:
            return False, "non-json %s" % body[:80].replace("\n", " ")
        ch = (j.get("choices") or [{}])[0]
        msg = ch.get("message") or {}
        txt = (msg.get("content") or msg.get("reasoning_content") or "").strip()
        if txt:
            return True, txt[:100]
        err = j.get("error")
        if err:
            return False, str(err)[:110]
        # finish_reason tapi kosong -> coba stream sekali
        if stream:
            return False, "empty choices"
    return False, "empty choices"


def rand_user():
    return "u" + "".join(random.choices(string.ascii_lowercase + string.digits, k=9))


def register_probe(ip, port):
    """New API: daftar akun, login, ambil quota. Hanya jika register_enabled."""
    b = base_of(ip, port)
    u = rand_user()
    pw = "Zk" + "".join(random.choices(string.ascii_letters + string.digits, k=10))
    hdrs = {"Origin": b, "Referer": b + "/register", "Content-Type": "application/json"}

    st, body = http(b + "/api/user/register",
                    {"username": u, "password": pw, "password2": pw}, headers=hdrs)
    if not (st == 200 and '"success":true' in body.replace(" ", "")):
        return {"registered": False, "register_resp": body[:150]}

    st, body = http(b + "/api/user/login", {"username": u, "password": pw}, headers=hdrs)
    try:
        j = json.loads(body)
    except Exception:
        return {"registered": True, "username": u, "password": pw, "login": "parse fail"}
    d = j.get("data") or {}
    tok = d.get("access_token")
    uid = d.get("id") or (d.get("user") or {}).get("id")
    rec = {"registered": True, "username": u, "password": pw, "user_id": uid,
           "access_token": tok}

    quota = used = group = None
    if tok:
        h2 = {"New-Api-User": str(uid or "")}
        st, body = http(b + "/api/user/self", key=tok, headers=h2)
        try:
            sd = json.loads(body).get("data") or {}
            quota, used, group = sd.get("quota"), sd.get("used_quota"), sd.get("group")
            rec["display_name"] = sd.get("display_name")
        except Exception:
            rec["self_raw"] = body[:150]
    rec.update({"quota": quota, "used_quota": used, "group": group})

    # coba bikin key + reveal
    if tok:
        h2 = {"New-Api-User": str(uid or "")}
        st, body = http(b + "/api/token/", {"name": "hunt", "remain_quota": 0,
                                            "unlimited_quota": True, "expired_time": -1},
                        key=tok, headers=h2)
        rec["create_key"] = body[:120]
        st, body = http(b + "/api/token/?p=1&size=5", key=tok, headers=h2)
        try:
            it = (json.loads(body).get("data") or {}).get("items") or []
            if it:
                tid = it[0]["id"]
                st, body = http("%s/api/token/%s/key" % (b, tid), key=tok, headers=h2)
                if st == 200 and "sk-" in body:
                    rec["api_key"] = re.search(r"(sk-[A-Za-z0-9_\-]{10,})", body).group(1)
                rec["token_ids"] = [x.get("id") for x in it[:3]]
        except Exception:
            pass
    return rec


# ---------------------------------------------------------------- per host
def probe_line(line, prompt, farm, key, timeout):
    line = line.strip()
    if not line or line.startswith("#"):
        return None
    if ":" in line:
        ip, _, rest = line.partition(":")
        port = rest.split()[0]
    else:
        ip, port = line, "8000"
    rec = {"ip": ip, "port": port}
    t0 = time.time()

    if not tcp_open(ip, port, timeout=3):
        rec["verdict"] = "closed"
        return rec

    models, mstatus = models_for(ip, port)
    rec["n_models"] = len(models)
    if not models:
        st_info = status_probe(ip, port)
        if st_info:
            rec["newapi"] = st_info
        # gateway hidup tapi butuh key = masih kandidat farm
        if mstatus in (401, 403) or st_info:
            if st_info and st_info.get("register_enabled"):
                easy = not st_info.get("email_verification") and not st_info.get("turnstile_check")
                oauth = [k for k in ("github_oauth", "linuxdo_oauth", "wechat_login",
                                     "telegram_oauth", "oidc_enabled", "discord_oauth")
                         if st_info.get(k)]
                if oauth:
                    rec["verdict"] = "oauth_free"
                    rec["oauth"] = oauth
                elif easy:
                    rec["verdict"] = "farmable_noverify"
                else:
                    rec["verdict"] = "farmable_gated"
                if farm:
                    reg = register_probe(ip, port)
                    rec["register"] = reg
                    if reg.get("registered"):
                        rec["verdict"] = ("farm_bonus" if (reg.get("quota") or 0) > 0
                                          else "farmable_zero")
                    else:
                        rec["verdict"] = "register_blocked"
            else:
                rec["verdict"] = "needs_key"
            rec["ms"] = int((time.time() - t0) * 1000)
            return rec
        st, body = http(base_of(ip, port) + "/", timeout=10)
        if st == 0:
            rec["verdict"] = "dead"
            return rec
        rec["verdict"] = "not_gateway"
        m = re.search(r"<title>([^<]{0,70})</title>", body or "", re.I)
        rec["title"] = m.group(1).strip() if m else ""
        return rec

    st_info = status_probe(ip, port)
    if st_info:
        rec["newapi"] = st_info

    # 1) open relay?
    working, note = None, ""
    for m in pick_llm(models)[:3]:
        ok, note = chat_test(ip, port, m, prompt, timeout=timeout)
        if ok:
            working = m
            break
    if working:
        rec.update({"verdict": "open_relay", "working_model": working, "sample": note,
                    "ms": int((time.time() - t0) * 1000)})
        return rec

    # upstream hidup tapi kredit/kuota habis = masih bisa dipakai kalau diisi key
    low = (note or "").lower()
    if any(k in low for k in ("requires approximately", "insufficient quota",
                              "no credit", "out of credit", "余额", "额度不足", "credit balance")):
        rec["verdict"] = "needs_credit"
        rec["note"] = note
        rec["ms"] = int((time.time() - t0) * 1000)
        return rec

    # 2) farmable?
    info = st_info or {}
    oauth = [k for k in ("github_oauth", "linuxdo_oauth", "wechat_login",
                         "telegram_oauth", "oidc_enabled", "discord_oauth") if info.get(k)]
    if oauth:
        rec["oauth"] = oauth

    if farm and info.get("register_enabled"):
        reg = register_probe(ip, port)
        rec["register"] = reg
        if reg.get("registered") and (reg.get("quota") or 0) > 0:
            rec["verdict"] = "farm_bonus"
        elif reg.get("registered"):
            rec["verdict"] = "farmable_zero"
        else:
            rec["verdict"] = "register_blocked"
    elif info.get("register_enabled"):
        easy = not info.get("email_verification") and not info.get("turnstile_check")
        rec["verdict"] = "farmable_noverify" if easy else "farmable_gated"
        if oauth:
            rec["verdict"] = "oauth_free"
    elif info:
        rec["verdict"] = "needs_key"
    else:
        rec["verdict"] = "showcase"
    rec["note"] = note
    rec["ms"] = int((time.time() - t0) * 1000)
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True, help="IP atau IP:PORT per baris")
    ap.add_argument("--workers", type=int, default=60)
    ap.add_argument("--timeout", type=int, default=45, help="timeout chat per model")
    ap.add_argument("--key", default=None, help="API key untuk uji ber-key")
    ap.add_argument("--farm", action="store_true", help="bikin akun + cek bonus (hati-hati)")
    ap.add_argument("--prompt", default="Reply with exactly: PONG")
    ap.add_argument("--output", default="llm_results.jsonl")
    a = ap.parse_args()

    lines = [l for l in open(a.file) if l.strip() and not l.startswith("#")]
    print("[*] %d target, %d workers, farm=%s" % (len(lines), a.workers, a.farm))
    t0 = time.time()
    hits = []
    with cf.ThreadPoolExecutor(a.workers) as ex:
        for r in ex.map(lambda l: probe_line(l, a.prompt, a.farm, a.key, a.timeout), lines):
            if r:
                hits.append(r)
                print("[%-16s] %s:%s models=%d %s" % (
                    r.get("verdict"), r["ip"], r["port"], r.get("n_models", 0),
                    (r.get("working_model") or r.get("note") or r.get("title") or "")[:70]))

    with open(a.output, "w") as fh:
        for r in hits:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")

    order = ["open_relay", "farm_bonus", "oauth_free", "farmable_noverify",
             "farmable_gated", "farmable_zero", "needs_credit", "needs_key", "showcase",
             "register_blocked", "not_gateway", "dead"]
    counts = {}
    for r in hits:
        counts[r.get("verdict", "?")] = counts.get(r.get("verdict", "?"), 0) + 1

    print("\n=== RINGKASAN ===")
    print("target %d | respons %d | durasi %.0fs" % (len(lines), len(hits), time.time() - t0))
    for k in order:
        if counts.get(k):
            print("  %-18s %d" % (k, counts[k]))

    usable = [r for r in hits if r.get("verdict") in ("open_relay", "farm_bonus", "oauth_free")]
    with open("llm_summary.txt", "w") as fh:
        fh.write("LLM gateway scan: %d target, %d respons\n\n" % (len(lines), len(hits)))
        for k in order:
            if counts.get(k):
                fh.write("%-18s %d\n" % (k, counts[k]))
        fh.write("\n--- LAYAK PAKAI ---\n")
        for r in usable:
            fh.write("%s:%s  %s  %s\n" % (r["ip"], r["port"], r.get("verdict"),
                                          r.get("working_model") or
                                          json.dumps(r.get("newapi", {}).get("bonus_mention"))))
        if not usable:
            fh.write("(tidak ada)\n")
        fh.write("\n--- SEMUA YANG PUNYA MODEL ---\n")
        for r in sorted(hits, key=lambda x: -x.get("n_models", 0))[:40]:
            fh.write("%s:%s models=%d verdict=%s %s\n" % (
                r["ip"], r["port"], r.get("n_models", 0), r.get("verdict"),
                (r.get("working_model") or r.get("note") or "")[:60]))
    print("\n-> %s / llm_summary.txt" % a.output)


if __name__ == "__main__":
    main()
