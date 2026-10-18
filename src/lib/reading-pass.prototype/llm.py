"""One schema-bound call to the recommended model, with a ledger record and the spend cap.

Model: Claude Haiku 5.5 on the Anthropic endpoint, reasoning off, strict JSON schema
(the research ticket's recommendation).
"""
import json
import os
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import orclient  # noqa: E402

MODEL = "anthropic/claude-haiku-5.5"
PRICE_IN, PRICE_OUT = 0.10e-6, 0.50e-6  # per token, under 100K prompt tokens
CHARS_PER_TOKEN = 2.7  # Claude's tokenizer counts about 1.46x o200k (research), o200k is about 4 chars per token
RUNS = os.path.join(orclient.DATA, "runs")
os.makedirs(RUNS, exist_ok=True)


def parse(content):
    if content is None:
        return None, "no content"
    text = content.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text
        text = text.rsplit("```", 1)[0]
    try:
        return json.loads(text), None
    except Exception as e:  # noqa: BLE001
        return None, f"{type(e).__name__}: {e}"[:200]


def estimate(system, user, out_tokens):
    return (len(system) + len(user)) / CHARS_PER_TOKEN * PRICE_IN + out_tokens * PRICE_OUT


def call(label, system, user, schema_name, schema, max_tokens=60000, out_estimate=8000):
    """Run one call; save <RUNS>/<label>.json (record, content, parsed, usage); append the ledger."""
    est = estimate(system, user, out_estimate)
    orclient.reserve(est)
    body = {
        "model": MODEL,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "response_format": {"type": "json_schema", "json_schema": {"name": schema_name, "strict": True, "schema": schema}},
        "provider": {"require_parameters": True, "order": ["anthropic"], "allow_fallbacks": False},
        "reasoning": {"effort": "none"},
        "max_tokens": max_tokens,
        "usage": {"include": True},
    }
    try:
        status, resp, elapsed = orclient.chat(body, timeout=1200)
    finally:
        orclient.release(est)
    choice = (resp.get("choices") or [{}])[0]
    msg = choice.get("message") or {}
    content = msg.get("content")
    parsed, err = parse(content) if status == 200 else (None, json.dumps(resp.get("error", resp))[:300])
    if parsed is not None:
        missing = [k for k in schema.get("required", []) if not isinstance(parsed, dict) or k not in parsed]
        if missing:
            parsed, err = None, f"JSON lacks required keys: {missing}"
    usage = resp.get("usage") or {}
    rec = {
        "label": label,
        "model": MODEL,
        "status": status,
        "provider": resp.get("provider"),
        "gen_id": resp.get("id"),
        "seconds": round(elapsed, 1),
        "finish_reason": choice.get("finish_reason"),
        "prompt_tokens": usage.get("prompt_tokens"),
        "completion_tokens": usage.get("completion_tokens"),
        "cost": usage.get("cost"),
        "valid_json": parsed is not None,
        "parse_error": err,
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    path = os.path.join(RUNS, f"{label}.json")
    n = 2
    while os.path.exists(path):  # never overwrite an earlier call's result
        path = os.path.join(RUNS, f"{label}__{n}.json")
        n += 1
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"record": rec, "system": system, "user_chars": len(user), "content": content, "parsed": parsed, "usage": usage},
                  f, indent=1, ensure_ascii=False)
    orclient.append_ledger(rec)
    print(json.dumps({k: rec[k] for k in ("label", "status", "seconds", "prompt_tokens", "completion_tokens", "cost", "valid_json", "parse_error", "finish_reason")}), flush=True)
    return rec, parsed, path


def call_all(jobs, max_parallel=8):
    """jobs: list of kwargs dicts for call(). Returns results in job order; raises on any failure."""
    results = [None] * len(jobs)
    errors = []
    sem = threading.Semaphore(max_parallel)

    def worker(i, kw):
        with sem:
            try:
                results[i] = call(**kw)
            except Exception as e:  # noqa: BLE001
                errors.append(f"{kw.get('label')}: {type(e).__name__}: {e}")

    threads = [threading.Thread(target=worker, args=(i, kw)) for i, kw in enumerate(jobs)]
    for t in threads:
        t.start()
        time.sleep(0.3)
    for t in threads:
        t.join()
    if errors:
        raise SystemExit("worker failures:\n" + "\n".join(errors))
    return results
