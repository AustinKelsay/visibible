"""Minimal OpenRouter client for the whole-work reading measurements.

The API key is read from the env file given by OR_ENV_FILE (default: the main
checkout's .env.local) into this process's environment only. It is never
printed, logged or written anywhere.
"""
import json
import os
import time
import urllib.error
import urllib.request

ENV_FILE = os.environ.get("OR_ENV_FILE", ".env.local")
BASE = "https://openrouter.ai/api/v1"


def load_key():
    if os.environ.get("OPENROUTER_API_KEY"):
        return
    for line in open(ENV_FILE, encoding="utf-8"):
        line = line.strip()
        if line.startswith("OPENROUTER_API_KEY="):
            value = line.split("=", 1)[1].strip().strip('"').strip("'")
            os.environ["OPENROUTER_API_KEY"] = value
            return
    raise SystemExit("OPENROUTER_API_KEY not found")


def _req(method, path, body=None, timeout=600):
    load_key()
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Authorization", "Bearer " + os.environ["OPENROUTER_API_KEY"])
    req.add_header("Content-Type", "application/json")
    req.add_header("X-Title", "visibible-research-whole-work-reading")
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            status = r.status
    except urllib.error.HTTPError as e:
        raw = e.read()
        status = e.code
    except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
        # status 0 so the caller still writes a ledger record for the failed call
        raw = json.dumps({"error": f"{type(e).__name__}: {e}"}).encode()
        status = 0
    elapsed = time.time() - t0
    try:
        payload = json.loads(raw)
    except Exception:
        payload = {"raw": raw.decode("utf-8", "replace")[:2000]}
    return status, payload, elapsed


def get(path):
    return _req("GET", path)


def chat(body, timeout=900):
    return _req("POST", "/chat/completions", body, timeout=timeout)


def generation(gen_id):
    return _req("GET", "/generation?id=" + gen_id)


def chat_stream(body, timeout=1800):
    """Streamed chat completion; returns (status, assembled_response, seconds, first_token_seconds)."""
    load_key()
    body = {**body, "stream": True}
    req = urllib.request.Request(BASE + "/chat/completions", data=json.dumps(body).encode(), method="POST")
    req.add_header("Authorization", "Bearer " + os.environ["OPENROUTER_API_KEY"])
    req.add_header("Content-Type", "application/json")
    req.add_header("X-Title", "visibible-research-whole-work-reading")
    t0 = time.time()
    first = None
    parts, usage, finish, provider, gid, err = [], {}, None, None, None, None
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            status = r.status
            for raw in r:
                line = raw.decode("utf-8", "replace").strip()
                if not line or line.startswith(":") or not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    ev = json.loads(data)
                except Exception:
                    continue
                if "error" in ev:
                    err = ev["error"]
                gid = ev.get("id", gid)
                provider = ev.get("provider", provider)
                if ev.get("usage"):
                    usage = ev["usage"]
                for ch in ev.get("choices") or []:
                    delta = ch.get("delta") or {}
                    if delta.get("content"):
                        if first is None:
                            first = time.time() - t0
                        parts.append(delta["content"])
                    if ch.get("finish_reason"):
                        finish = ch["finish_reason"]
    except urllib.error.HTTPError as e:
        status = e.code
        try:
            return status, json.loads(e.read()), time.time() - t0, None
        except Exception:
            return status, {"error": "http error"}, time.time() - t0, None
    except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
        # keep what streamed so far, and report the error so a ledger record is still written
        status, err = 0, f"{type(e).__name__}: {e}"
    resp = {"id": gid, "provider": provider, "usage": usage,
            "choices": [{"message": {"content": "".join(parts) if parts else None}, "finish_reason": finish}]}
    if err:
        resp["error"] = err
        if status == 200:
            status = 0  # the stream reported an error after the 200 header; keep the partial content for diagnosis
    return status, resp, time.time() - t0, first
