# T48: Align privacy credits and storage copy with behavior

<!-- visibible-modernization:T48 -->

## Parent

[S09: Consistent reader controls and preferences](https://github.com/AustinKelsay/visibible/issues/53)

## What to build

Guests read accurate descriptions of charges, access expiry, stored information and image persistence.

## Acceptance criteria

- [ ] Describe session/cookie limitations without promising recovery or cross-device access.
- [ ] Explain estimate, accepted maximum, reservation and final charge using consistent terms.
- [ ] Correct privacy copy to include actual feedback/session/payment/image/analytics context.
- [ ] Use distinct wording for saved images and temporary output; keep browsing and purchase notices concise.

## Verification

Compare each claim against implemented flows and retention rules; inspect rendered mobile/desktop copy and relevant links.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No broad marketing rewrite or new refund promise.

## Blocked by

- [T39: Separate welcome purchase and admin states](https://github.com/AustinKelsay/visibible/issues/95)
- [T47: Apply bounded retention without losing financial evidence](https://github.com/AustinKelsay/visibible/issues/103)

## Traceability

Original backlog items: 79. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
