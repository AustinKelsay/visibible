"""Run the reading-pass prompt over one input with several models in parallel.

Usage: python -I run_extract.py <label> <input.txt> <work> <part> <unit_kind> <outdir> <model_key> [<model_key> ...]

Each response is saved to <outdir>/<label>__<model_key>.json (content, parsed JSON,
usage, timing). Every call is appended to /tmp/wwr-data/ledger.jsonl. No key is
printed or saved.
"""
import json
import os
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import orclient  # noqa: E402
import prompt  # noqa: E402

MODELS = {
    "nemotron-3-super-free": {"model": "nvidia/nemotron-3-super-120b-a12b:free", "reasoning": {"enabled": False}, "temperature": 0},
    "nemotron-3-super-free-stream": {"model": "nvidia/nemotron-3-super-120b-a12b:free", "reasoning": {"enabled": False}, "temperature": 0, "stream": True},
    "nemotron-3.5-super-vl-free-stream": {"model": "nvidia/nemotron-3.5-super-vl:free", "reasoning": {"enabled": False}, "temperature": 0, "stream": True},
    "deepseek-v4.1-flash-stream": {"model": "deepseek/deepseek-v4.1-flash", "reasoning": {"effort": "none"}, "temperature": 0, "provider": {"sort": "price"}, "stream": True},
    "nemotron-3-super-free-stream-noschema": {"model": "nvidia/nemotron-3-super-120b-a12b:free", "reasoning": {"enabled": False}, "temperature": 0, "stream": True, "no_schema": True},
    "nemotron-3.5-super-vl-free": {"model": "nvidia/nemotron-3.5-super-vl:free", "reasoning": {"enabled": False}, "temperature": 0},
    "deepseek-v4.1-flash": {"model": "deepseek/deepseek-v4.1-flash", "reasoning": {"effort": "none"}, "temperature": 0, "provider": {"sort": "price"}},
    "deepseek-v4.1-flash-low": {"model": "deepseek/deepseek-v4.1-flash", "reasoning": {"effort": "low"}, "temperature": 0, "provider": {"sort": "price"}},
    "gemini-3.1-flash-lite": {"model": "google/gemini-3.1-flash-lite", "reasoning": {"effort": "none"}, "temperature": 0},
    "gemini-3.5-flash-lite": {"model": "google/gemini-3.5-flash-lite", "reasoning": {"effort": "minimal"}, "temperature": 0},
    "gemini-3.8-flash": {"model": "google/gemini-3.8-flash", "reasoning": {"effort": "low"}, "temperature": 0},
    "claude-haiku-5.5": {"model": "anthropic/claude-haiku-5.5", "reasoning": {"effort": "none"}, "provider": {"order": ["anthropic"], "allow_fallbacks": False}},
    "gpt-5.6-luna": {"model": "openai/gpt-5.6-luna", "reasoning": {"effort": "none"}},
    "qwen3.8-flash": {"model": "qwen/qwen3.8-flash", "reasoning": {"enabled": False}, "temperature": 0},
    "glm-5.3-flash": {"model": "z-ai/glm-5.3-flash", "reasoning": {"effort": "low"}, "temperature": 0, "provider": {"sort": "price"}},
}

LEDGER = os.environ.get("WWR_DATA", "/tmp/wwr-data") + "/ledger.jsonl"
lock = threading.Lock()


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


def run(label, key, system, user, schema_name, schema, outdir, max_tokens):
    cfg = MODELS[key]
    body = {
        "model": cfg["model"],
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "response_format": {"type": "json_schema", "json_schema": {"name": schema_name, "strict": True, "schema": schema}},
        "provider": {"require_parameters": True},
        "max_tokens": max_tokens,
        "usage": {"include": True},
    }
    if cfg.get("no_schema"):
        body.pop("response_format")
        body["provider"].pop("require_parameters", None)
        body["messages"][0]["content"] += "\n\nReply with the JSON object only, with keys characters, locations, sections and brief."
    if "reasoning" in cfg:
        body["reasoning"] = cfg["reasoning"]
    if "temperature" in cfg:
        body["temperature"] = cfg["temperature"]
    if "provider" in cfg:
        body["provider"] = {**body["provider"], **cfg["provider"]}
    first = None
    if cfg.get("stream"):
        status, resp, elapsed, first = orclient.chat_stream(body, timeout=1800)
    else:
        status, resp, elapsed = orclient.chat(body, timeout=1200)
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
        "model_key": key,
        "model": cfg["model"],
        "status": status,
        "provider": resp.get("provider"),
        "gen_id": resp.get("id"),
        "seconds": round(elapsed, 1),
        "first_token_seconds": round(first, 1) if first else None,
        "streamed": bool(cfg.get("stream")),
        "finish_reason": choice.get("finish_reason"),
        "prompt_tokens": usage.get("prompt_tokens"),
        "completion_tokens": usage.get("completion_tokens"),
        "reasoning_tokens": (usage.get("completion_tokens_details") or {}).get("reasoning_tokens"),
        "cached_tokens": (usage.get("prompt_tokens_details") or {}).get("cached_tokens"),
        "cost": usage.get("cost"),
        "valid_json": parsed is not None,
        "parse_error": err,
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    path = f"{outdir}/{label}__{key}.json"
    n = 2
    while os.path.exists(path):  # never overwrite an earlier call's result
        path = f"{outdir}/{label}__{key}__{n}.json"
        n += 1
    with open(path, "w") as f:
        json.dump({"record": rec, "content": content, "parsed": parsed, "usage": usage}, f, indent=1, ensure_ascii=False)
    with lock:
        with open(LEDGER, "a") as f:
            f.write(json.dumps(rec) + "\n")
    print(json.dumps(rec), flush=True)
    return rec


def run_all(jobs):
    """Run each (args) tuple through run() in its own thread; exit non-zero if any worker raised."""
    errors = []

    def worker(args):
        try:
            run(*args)
        except Exception as e:  # noqa: BLE001
            errors.append(f"{args[0]} {args[1]}: {type(e).__name__}: {e}")

    threads = []
    for args in jobs:
        t = threading.Thread(target=worker, args=(args,))
        threads.append(t)
        t.start()
        time.sleep(0.5)
    for t in threads:
        t.join()
    if errors:
        raise SystemExit("worker failures:\n" + "\n".join(errors))


def main():
    label, path, work, part, unit_kind, outdir = sys.argv[1:7]
    keys = sys.argv[7:]
    text = open(path, encoding="utf-8").read()
    user = prompt.user_message(work, part, unit_kind, text)
    system = prompt.SYSTEM
    target = os.environ.get("WWR_TARGET_UNITS")
    if target:
        n_units = sum(1 for l in text.split("\n") if l.strip() and not l.startswith("##"))
        system = prompt.system_with_target(n_units, int(target))
    run_all([(label, k, system, user, "reading_pass", prompt.SCHEMA, outdir, 60000) for k in keys])


if __name__ == "__main__":
    main()
