# Video mode integration evidence

These screenshots show the integrated Video tab on the October 30 main base (`f73baa8`), using an existing local Psalms 23:2 clip. Desktop: 1280×800; mobile viewport: 390×844. They establish local UI behavior, not hosted worker readiness or physical-device testing.

![Desktop video mode](desktop.png)

<img src="mobile.png" alt="Mobile video mode" width="390" />

Local verification passed: 1,150 tests (one skipped), typecheck, lint (three pre-existing release-script warnings), and 82.22% statement coverage. Playback, sound, seeking, anonymous history, refresh, mode switching, and mobile verse navigation were exercised. A controlled local job exercised the real reservation/refund mutations and cross-verse active state without a provider call. Accepted-job completion with admission disabled is covered by the worker test; the disabled UI retains public history.

Sol approved the behavior in two review rounds. The fixes preserve the exact displayed settings and maximum charge during interrupted-request recovery, expose pricing retries after catalog outages, and avoid browser-only AbortSignal static helpers. The first two regression tests were observed failing before the fixes.

Before the first push, a guarded shared-development Convex dry run reported seven additive video indexes and no index deletions. The PR records hosted deployment, generation, and settlement evidence separately when completed. Production rollout remains a separate release decision.
