# Issue tracker

Specs and implementation tickets live in GitHub Issues for `AustinKelsay/visibible`. Use `gh` with an explicit repository. Publish multiline bodies from files with `--body-file`, or use a structured API request.

Use native sub-issues to connect tickets to their spec. Use native issue dependencies for blocking edges and repeat the edges in each ticket body. If native relationships are unavailable, retain explicit links in the body and record the limitation.

`ready-for-agent` means sufficiently specified, not necessarily unblocked. Start a ticket only when its blocking tickets are complete. Specs are planning parents, not implementation tickets. Do not close a parent automatically when publishing children.

PRs as a request surface: no.

For the modernization program, local planning snapshots and the publication manifest live under `docs/modernization`. After publication, GitHub is authoritative for status, discussion, and changes to scope. Refresh snapshots before using them to implement work.

Triage briefs are issue comments with the required AI-triage disclosure. Read the latest brief and subsequent discussion before implementation. The brief is the execution contract for its ticket and retains the parent spec’s applicable policy decisions. Local triage snapshots live under `docs/modernization/triage`; GitHub remains authoritative.
