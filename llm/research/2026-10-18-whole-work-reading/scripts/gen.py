"""Fetch OpenRouter generation records for the given ids (no key printed)."""
import os
import json
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import orclient  # noqa: E402

keep = ("id", "model", "provider_name", "total_cost", "usage", "latency", "generation_time", "moderation_latency",
        "tokens_prompt", "tokens_completion", "native_tokens_prompt", "native_tokens_completion",
        "native_tokens_reasoning", "native_tokens_cached", "finish_reason", "native_finish_reason", "cancelled",
        "streamed", "is_byok", "upstream_inference_cost", "created_at")
for gid in sys.argv[1:]:
    status, d, _ = orclient.generation(gid)
    data = d.get("data", d)
    print(status, json.dumps({k: data.get(k) for k in keep} if isinstance(data, dict) else data))
