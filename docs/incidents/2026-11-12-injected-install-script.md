# 12 November 2026: injected install script on `main`

A stolen GitHub credential pushed a credential collector and a `postinstall` hook straight to `main`. Vercel built production from those commits, so the production build environment must be treated as taken. This record separates what was observed from what is still unknown. It was written on 13 November 2026 from the Git history, the GitHub and Vercel deployment records, the production Convex audit log and public relays.

## What happened

All times are UTC.

| Time | Event | Source |
| --- | --- | --- |
| 11 Nov 12:11 | The first `chore: add ci helper` commit pair appears in another repository of the same account. By 12 Nov 17:48 there are 40 such commits across nine repositories the account can write to. | GitHub commit search |
| 12 Nov 17:46:40 | `35f7476a` adds `.ci-dfggim.sh` (1,563 lines) to `main`. | Repository activity |
| 12 Nov 17:46:42 | `6a24f499` adds `"postinstall": "sh ./.ci-dfggim.sh …"` to `package.json`. | Repository activity |
| 12 Nov 17:47 | Vercel creates production deployments for both commits. Each build also pushed Convex functions to production with the build's deploy key. | GitHub deployments, Convex audit log |
| 12 Nov 17:49:03–04 | `4cc15d18` and `5eb13e53` remove the hook and the file. Two more production builds follow. | Repository activity |
| 12 Nov 18:08 | The owner pauses the production Convex deployment, then exports it. | Convex audit log |
| 12 Nov 18:19–18:20 | `ADMIN_PASSWORD_SECRET`, `CONVEX_SERVER_SECRET` and `GUEST_AUTH_JWKS` are replaced in Convex. | Convex audit log |
| 12 Nov 18:22–19:03 | `ADMIN_PASSWORD`, `ADMIN_PASSWORD_SECRET`, `CONVEX_SERVER_SECRET`, `GUEST_AUTH_JWKS`, `GUEST_AUTH_PRIVATE_JWK`, `SESSION_SECRET` and `IP_HASH_SECRET` are replaced in Vercel production. | Vercel project API |
| 12 Nov 20:23 | `NOSTR_PUBLISHING_ENABLED` is created (publishing off). | Convex audit log |
| 13 Nov 15:52 | `NOSTR_PRIVATE_KEY` is deleted from Convex. | Convex audit log |
| 13 Nov 16:43–17:03 | `OPENROUTER_API_KEY` is replaced in Vercel production and in Convex, the recovery backend is pushed with a different deploy key, and the deployment is unpaused. | Vercel project API, Convex audit log |
| 13 Nov 18:03 | [#418](https://github.com/AustinKelsay/visibible/pull/418) merges: credential reset, wallet recovery, Nostr publishing off by default. | GitHub |
| 13 Nov 18:09 | Production is deployed from `main` by hand: Vercel at 18:09:01, Convex at 18:09:43. | Vercel, Convex audit log |
| 13 Nov 21:24 | A ruleset protects `main`; a direct push is refused. | GitHub |

The four commits carry the account's GitHub no-reply identity, are unsigned, and arrive in pairs two seconds apart, here and in the other repositories. That pattern is an automated client using a user credential with write access, not a browser session.

## What the script does

Read as text from history; it was never run for this record. It collects environment variables that look like provider or cloud keys, credential files under the home directory (cloud CLIs, Docker, Kubernetes, `.netrc`, `.npmrc`, Git and `gh` credentials, agent tool folders), cloud metadata tokens, and the repository's files, history and CI artifacts through the GitHub API. It packs them and sends them to a messaging bot. It exits 42 when delivery fails, and the hook passes that code on, which fails the install.

The production build of `6a24f499` finished ready. The hook allows that only when delivery succeeded or the script stopped for another reason, so assume delivery succeeded.

To recognise it elsewhere: commit messages `chore: add ci helper`, `ci: restore` and `ci: cleanup`; a root file named `.ci-<six letters>.sh`; a `postinstall` that runs it; environment names beginning `WF_`; a temporary folder named `.wfx-<pid>`.

## What was exposed

- **Every Vercel production variable available at build time**: the OpenRouter key, session and IP-hash secrets, the admin password and its secret, the Convex server secret, the guest-token signing key and the Convex deploy key.
- **Everything the Convex deploy key can reach**: production Convex environment variables, including the Nostr signing key, and all stored data. Reads do not appear in the Convex audit log, so they cannot be ruled out.
- **Not exposed**: Lightning node credentials. The app holds none; it only calls the public LNURL-pay endpoint ([Payments](../../llm/context/PAYMENTS.md)).

GitHub Actions ran for three of the four commits and none is recorded for the commit with the hook active. The workflow uses no repository secrets.

## What was checked afterwards

- Every exposed value that is still a Vercel production variable was changed after the injected builds: seven on 12 November between 18:22 and 19:03, and the OpenRouter key on 13 November at 16:43. This reads Vercel's change times only; no value was read.
- The production Convex deploy key is no longer a Vercel variable: the project has none for production, has no Git link, and its build command no longer pushes Convex. Whether that key was revoked in Convex was not verified (open item 3).
- Whether production rejects the retired session cookie, guest token, server secret and admin password was not verified for this record. [#418](https://github.com/AustinKelsay/visibible/pull/418) reports live checks on the reset deployment without listing which retired credentials they covered (open item 3).
- The four production Convex pushes made by the affected builds added or removed no modules, indexes, scheduled jobs or auth settings. Between the first injected commit and 13 Nov 21:30 the audit log shows only those pushes and the owner's own actions.
- No injected commit appears in any of the nine repositories after 12 Nov 17:48.
- `relay.primal.net` and `nos.lol` hold nothing signed by the Visibible key after 10 Nov 16:00. `relay.damus.io` did not answer.
- The production reader serves the #418 race fixes (the recovery page waits for the guest session before it accepts a code), and the last production Convex push is the one made by hand after the merge.
- The primary local checkout last installed dependencies on 10 November, so the hook did not run there. Other worktrees were not checked.

## What changed to prevent a repeat

- **`main` accepts changes only through a pull request with a passing `quality-gates` check.** The ruleset has no bypass list, blocks deletion and force pushes, and applies to administrators. A direct push of an empty commit was refused on 13 November. A credential with administration rights can still edit the ruleset, so this stops the automated push that happened, not a deliberate attacker.
- **Installs do not run lifecycle scripts.** The repository `.npmrc` sets `ignore-scripts=true`, CI installs with `--ignore-scripts`, and the Vercel install command is `npm ci --ignore-scripts`.
- **CI refuses install hooks.** The workflow fails when `package.json` declares any script npm runs on install (`preinstall`, `install`, `postinstall`, the `prepare` and `dependencies` families, `prepublish`), so such a hook cannot pass the required check.
- **CI actions are pinned to commits and the job token is read-only.**
- **Vercel no longer deploys on push.** Production is released by hand ([Vercel deployment](../../llm/workflow/VERCEL_WORKFLOWS.md)).

## Still open

These need the owner; nothing in the repository can settle them.

1. **How the GitHub credential was taken.** Where and how it was captured is unknown. The first malicious use seen was in another repository 29 hours before this one, which dates the theft to 11 November 12:11 at the latest but does not locate it. One hypothesis is an infected checkout that ran an install while a GitHub credential was readable, on a development machine or in a CI job; this repository's own environments are not excluded. Until the source is found, credentials on every machine that held this one are suspect.
2. **The Nostr identity: retired.** The signing key was within reach and a Nostr key cannot be rotated, so on 13 November the owner chose to treat it as compromised and retire the identity. Publishing stays off and the key is no longer stored in Convex. What remains is the owner's: create a new identity, and, with the old key if it is still held, sign one last note pointing followers to it. Publishing must not be turned on again with the old key ([Nostr](../../llm/context/NOSTR.md)).
3. **Confirm** in each dashboard that the old Convex deploy key and the old GitHub credential are revoked, that the old OpenRouter key is deleted at OpenRouter and not only replaced here, and that its usage shows no spend that the app did not make. Confirm against production that the retired session cookie, guest token, server secret and admin password are refused, as [the recovery guide](../agents/session-recovery.md#deployment-verification-still-required) requires, and note the result here.
4. **The script stays in public Git history** at `35f7476a`. Removing it means rewriting `main`, which changes every later commit id. Leaving it is the recommendation: it holds none of this project's secrets.

Wallet recovery after the reset is in [Recover a preserved wallet](../agents/session-recovery.md).
