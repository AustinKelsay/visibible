# CLI access

Use the Convex CLI and AustinKelsay's Nostr Agent Interface CLI for this project. The checks below were verified on 2026-09-07; recheck deployment selection and current CLI help before operational work.

## Convex

The repository has Convex CLI 1.31.2 and this machine has a saved CLI login. A read-only table listing succeeded against the linked development deployment:

```bash
./node_modules/.bin/convex data --deployment-name coordinated-shepherd-515
```

This lists table names; adding a table argument reads documents. Production access has not been verified.

In the installed CLI version, using `--env-file` with a deployment-only file can skip loading the saved login when the file has no deploy key. The initial attempt using `.env.convex.dev` returned `401 MissingAccessToken`; explicit deployment selection without `--env-file` succeeded. Do not infer that the user must log in again from that error alone. Recheck this behavior after a CLI upgrade. Do not copy login tokens into project environment files.

## Nostr Agent Interface

The existing local checkout is `/Users/plebdev/Desktop/Projects/nostr/nostr-agent-interface`, with origin `https://github.com/AustinKelsay/nostr-agent-interface.git` and built JavaScript artifacts. The binary is not currently on PATH. Use the project's documented build fallback:

```bash
node /Users/plebdev/Desktop/Projects/nostr/nostr-agent-interface/build/app/index.js cli list-tools --json
node /Users/plebdev/Desktop/Projects/nostr/nostr-agent-interface/build/app/index.js cli getProfile --help
```

Tool discovery returned 48 tools. Follow the CLI skill in that checkout at `.agents/skills/nostr-agent-interface-cli/SKILL.md`. Prefer live tool discovery and tool-specific help over remembered argument shapes. Use `--stdin --json` for sensitive or structured input; never put private keys in command arguments or logs.

The unscoped npm package lookup returned 404 during this check; the existing source build works. On another machine, locate or build the official checkout rather than assuming this absolute path exists. Relay connectivity and signing with a Visibible identity were not exercised by these discovery checks.

## Current development prerequisites

The user reports the LND node is offline. Implement and verify payment behavior with a controlled LND adapter and synthetic invoices on local/dev paths. Live invoice creation, node connectivity and real settlement verification remain pending until the node returns; do not report them as verified by mocks.

Dev environment inspection confirmed the shared server secret, Nostr signing key and relay configuration are set. OpenRouter credentials are configured for the local Next.js application but were not listed on the Convex dev deployment. Moving provider calls into Convex will require configuring that dev execution environment as part of implementation. Provider account quota and live model availability have not been tested by these configuration checks.
