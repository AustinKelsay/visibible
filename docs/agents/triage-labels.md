# Triage labels

| Role | GitHub label | Meaning |
| --- | --- | --- |
| Needs triage | `needs-triage` | Scope needs review |
| Needs information | `needs-info` | Required information is missing |
| Ready for agent | `ready-for-agent` | Specified; check blocking issues before starting |
| Ready for human | `ready-for-human` | Requires human execution |
| Will not implement | `wontfix` | Deliberately excluded |

Use `modernization` for this program, `spec` for planning parents, and `ticket` for implementation slices. These type labels distinguish parent specs from work an agent can claim.

Every triaged issue has exactly one category label: `bug` for broken behavior, or `enhancement` for a new capability or improvement. It also has exactly one state label from the table above. Preserve program/type labels. Planning parents use `enhancement`; claim implementation tickets, not an entire spec.
