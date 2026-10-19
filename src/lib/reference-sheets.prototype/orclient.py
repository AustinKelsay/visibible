"""Minimal OpenRouter client for the reference-sheets prototype, with a hard spend cap.

The API key is read from the env file given by OR_ENV_FILE (default: the main
checkout's .env.local) into this process's environment only. It is never
printed, logged or written anywhere.
"""
import json
import os
import threading
import time
import urllib.error
import urllib.request

ENV_FILE = os.environ.get("OR_ENV_FILE", "/Users/plebdev/Desktop/Projects/visibible/.env.local")
BASE = "https://openrouter.ai/api/v1"
DATA = os.environ.get("RS_DATA", "/Users/plebdev/rs-data-20261019")
LEDGER = os.path.join(DATA, "ledger.jsonl")
SPEND_CAP = float(os.environ.get("RS_SPEND_CAP", "3.00"))

_lock = threading.Lock()
_reserved = 0.0


class BudgetExceeded(RuntimeError):
    pass


def load_key():
    if os.environ.get("OPENROUTER_API_KEY"):
        return
    for line in open(ENV_FILE, encoding="utf-8"):
        line = line.strip()
        if line.startswith("OPENROUTER_API_KEY="):
            os.environ["OPENROUTER_API_KEY"] = line.split("=", 1)[1].strip().strip('"').strip("'")
            return
    raise SystemExit("OPENROUTER_API_KEY not found")


def spent():
    """Sum of usage.cost over every ledger record so far (all runs share one ledger)."""
    if not os.path.exists(LEDGER):
        return 0.0
    total = 0.0
    for line in open(LEDGER, encoding="utf-8"):
        try:
            total += json.loads(line).get("cost") or 0.0
        except json.JSONDecodeError:
            continue
    return total


def reserve(estimate):
    """Reserve an estimated cost before a call. Raises if the cap would be exceeded."""
    global _reserved
    with _lock:
        s = spent()
        if s + _reserved + estimate > SPEND_CAP:
            raise BudgetExceeded(
                f"spend cap ${SPEND_CAP:.2f} would be exceeded: spent ${s:.4f}, reserved ${_reserved:.4f}, next ${estimate:.4f}"
            )
        _reserved += estimate


def release(estimate):
    global _reserved
    with _lock:
        _reserved -= estimate


def _req(method, path, body=None, timeout=600):
    load_key()
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Authorization", "Bearer " + os.environ["OPENROUTER_API_KEY"])
    req.add_header("Content-Type", "application/json")
    req.add_header("X-Title", "visibible-prototype-reference-sheets")
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            status = r.status
    except urllib.error.HTTPError as e:
        raw = e.read()
        status = e.code
    except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
        raw = json.dumps({"error": f"{type(e).__name__}: {e}"}).encode()
        status = 0
    elapsed = time.time() - t0
    try:
        payload = json.loads(raw)
    except Exception:  # noqa: BLE001
        payload = {"raw": raw.decode("utf-8", "replace")[:2000]}
    return status, payload, elapsed


def chat(body, timeout=900):
    return _req("POST", "/chat/completions", body, timeout=timeout)


def generation(gen_id):
    return _req("GET", "/generation?id=" + gen_id)


def append_ledger(rec):
    with _lock:
        with open(LEDGER, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec) + "\n")
