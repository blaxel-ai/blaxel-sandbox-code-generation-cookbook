# Security

## Reporting a vulnerability

Report suspected vulnerabilities through [GitHub private vulnerability reporting](https://github.com/blaxel-ai/blaxel-sandbox-code-generation-cookbook/security/advisories/new). Do not open a public issue containing credentials, preview or session tokens, private source, account details, private image references, or exploit instructions.

If private vulnerability reporting is unavailable, contact the Blaxel security owner through the current internal security process.

## Scope

Security-sensitive areas include Sandbox identity and lifecycle, source projection and path containment, generated package execution, workload privileges, workspace credentials, browser sessions, private previews, network policy, artifact export, replacement, and permanent deletion.

The cookbook demonstrates security boundaries but is not a complete application security model. Integrating applications remain responsible for user and project authorization, durable storage, package and command policy, concurrency control, observability, and cleanup reconciliation. See [the documented security boundaries](docs/security-boundaries.md) before adapting the example for private or multi-tenant workloads.
