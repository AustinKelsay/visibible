"""Billed image generation and vision checks for the reference-sheets prototype."""
import base64
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as c  # noqa: E402
import orclient  # noqa: E402

MODELS = {"flash": "google/gemini-3.1-flash-image", "lite": "google/gemini-3.1-flash-lite-image"}
ESTIMATE = {"flash": 0.09, "lite": 0.045}
CHECK_MODEL = "anthropic/claude-haiku-5.5"
RAW = os.path.join(orclient.DATA, "raw")
os.makedirs(RAW, exist_ok=True)


def data_url(path):
    ext = "jpeg" if path.endswith(".jpg") else "png"
    return f"data:image/{ext};base64," + base64.b64encode(open(path, "rb").read()).decode()


def to_jpeg(raw_path, out_path):
    if raw_path.endswith(".jpg"):
        os.replace(raw_path, out_path) if raw_path != out_path else None
        return
    subprocess.run(["/opt/homebrew/bin/magick", raw_path, "-quality", "90", out_path], check=True)


def generate(label, model_key, prompt, refs=(), aspect="16:9"):
    """One billed image call. Returns a ledger record; `file` is set on success."""
    est = ESTIMATE[model_key]
    orclient.reserve(est)
    content = [{"type": "text", "text": prompt}] + [{"type": "image_url", "image_url": {"url": data_url(r)}} for r in refs]
    body = {"model": MODELS[model_key], "messages": [{"role": "user", "content": content}],
            "modalities": ["image", "text"],
            "image_config": {"aspect_ratio": aspect, **({"image_size": "1K"} if model_key == "flash" else {})},
            "usage": {"include": True}}
    try:
        status, resp, elapsed = orclient.chat(body, timeout=300)
    finally:
        orclient.release(est)
    usage = resp.get("usage") or {}
    rec = {"label": label, "kind": "image", "model": MODELS[model_key], "status": status, "provider": resp.get("provider"),
           "seconds": round(elapsed, 1), "cost": usage.get("cost"), "prompt_tokens": usage.get("prompt_tokens"),
           "completion_tokens": usage.get("completion_tokens"), "prompt_chars": len(prompt), "refs": list(refs),
           "ts": time.strftime("%Y-%m-%dT%H:%M:%S")}
    url = None
    try:
        url = resp["choices"][0]["message"]["images"][0]["image_url"]["url"]
    except (KeyError, IndexError, TypeError):
        pass
    if status != 200 or not url or not url.startswith("data:image/"):
        rec["error"] = json.dumps(resp.get("error") or resp)[:300]
    else:
        head, b64 = url.split(",", 1)
        fmt = head.split("/")[1].split(";")[0]
        raw_path = os.path.join(RAW, f"{label}.{'jpg' if fmt in ('jpeg', 'jpg') else fmt}")
        with open(raw_path, "wb") as f:
            f.write(base64.b64decode(b64))
        rec["raw"] = raw_path
        rec["format"] = fmt
    orclient.append_ledger(rec)
    print(json.dumps({k: rec.get(k) for k in ("label", "status", "seconds", "cost", "error")}), flush=True)
    return rec


def vision_check(label, image_path, question, schema_name, schema, max_tokens=800):
    """Haiku looks at one image and answers a strict-JSON question. Returns (record, parsed)."""
    est = 0.004
    orclient.reserve(est)
    body = {"model": CHECK_MODEL,
            "messages": [{"role": "user", "content": [{"type": "text", "text": question},
                                                      {"type": "image_url", "image_url": {"url": data_url(image_path)}}]}],
            "response_format": {"type": "json_schema", "json_schema": {"name": schema_name, "strict": True, "schema": schema}},
            "provider": {"require_parameters": True, "order": ["anthropic"], "allow_fallbacks": False},
            "reasoning": {"effort": "none"}, "max_tokens": max_tokens, "usage": {"include": True}}
    try:
        status, resp, elapsed = orclient.chat(body, timeout=120)
    finally:
        orclient.release(est)
    usage = resp.get("usage") or {}
    content = ((resp.get("choices") or [{}])[0].get("message") or {}).get("content")
    parsed = None
    try:
        parsed = json.loads(content)
    except Exception:  # noqa: BLE001
        pass
    rec = {"label": label, "kind": "check", "model": CHECK_MODEL, "status": status, "seconds": round(elapsed, 1),
           "cost": usage.get("cost"), "prompt_tokens": usage.get("prompt_tokens"), "completion_tokens": usage.get("completion_tokens"),
           "valid_json": parsed is not None, "ts": time.strftime("%Y-%m-%dT%H:%M:%S")}
    if parsed is None:
        rec["error"] = json.dumps(resp.get("error") or content)[:300]
    orclient.append_ledger(rec)
    print(json.dumps({k: rec.get(k) for k in ("label", "status", "seconds", "cost", "error")}), flush=True)
    return rec, parsed
