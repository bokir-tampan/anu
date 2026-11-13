#!/usr/bin/env python3
"""portscan.py — tahap 1 sebelum HTTP: cari (ip, port) terbuka dari CIDR.

Pakai asyncio supaya ribuan koneksi paralel tanpa thread overhead.
Contoh: 1,3 juta probe /16 selesai dalam ~10-15 menit di runner 4-core.

Output: satu "ip:port" per baris (stdout), siap jadi input llm_hunt.py.
"""
import argparse
import asyncio
import ipaddress
import sys
import time


async def probe(ip, port, sem, timeout):
    async with sem:
        try:
            fut = asyncio.open_connection(ip, port)
            reader, writer = await asyncio.wait_for(fut, timeout=timeout)
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass
            return "%s:%d" % (ip, port)
        except Exception:
            return None


async def run(targets, concurrency, timeout):
    sem = asyncio.Semaphore(concurrency)
    tasks = [asyncio.create_task(probe(ip, p, sem, timeout)) for ip, p in targets]
    out = []
    done = 0
    for coro in asyncio.as_completed(tasks):
        r = await coro
        done += 1
        if r:
            out.append(r)
            print(r, flush=True)
        if done % 100000 == 0:
            print("# progress %d/%d open=%d" % (done, len(tasks), len(out)),
                  file=sys.stderr, flush=True)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cidr", required=True)
    ap.add_argument("--ports", default="3000,3001,8000,8080,20128,5000,11434,1234,9000")
    ap.add_argument("--concurrency", type=int, default=1500)
    ap.add_argument("--timeout", type=float, default=2.0)
    a = ap.parse_args()

    ports = [int(p) for p in a.ports.split(",") if p.strip()]
    targets = []
    for c in a.cidr.split(","):
        c = c.strip()
        if not c:
            continue
        net = ipaddress.ip_network(c, strict=False)
        for ip in net.hosts():
            for p in ports:
                targets.append((str(ip), p))

    print("# %d probe, concurrency %d" % (len(targets), a.concurrency),
          file=sys.stderr, flush=True)
    t0 = time.time()
    out = asyncio.run(run(targets, a.concurrency, a.timeout))
    print("# SELESAI %d open / %d probe  %.0fs"
          % (len(out), len(targets), time.time() - t0), file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
