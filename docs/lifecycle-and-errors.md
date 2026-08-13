# Lifecycle and errors

Recovery policy should preserve user work without turning every failure into a Sandbox reset.

## Decision table

| Observed condition | Classification | System action | What the builder gets |
| --- | --- | --- | --- |
| Build command exits nonzero | Code failure | Return stdout and stderr to the repair strategy | The current Sandbox and edits remain available while the code is corrected |
| Error origin is not `platform` | Application request error | Return the error without replacement | A precise request can be corrected without resetting healthy state |
| Code is `WORKLOAD_UNAVAILABLE` | Temporary workload condition | Retry with bounded exponential backoff | The existing Sandbox gets a recovery window before replacement |
| Code is `WORKLOAD_NOT_FOUND` | Missing Sandbox | Create a replacement and project the latest host revision | The latest saved project returns in a new environment |
| Retry budget is exhausted | Unhealthy retained Sandbox | Delete, recreate, and project durable source | Work continues from the latest saved revision |
| Session approaches expiry | Browser access renewal | Reuse it outside the renewal window or issue a new scoped session | Access remains short-lived without unnecessary session churn |
| Private preview access is requested | Preview authorization | Create a preview token with the same access horizon | The preview opens without making the generated application public |
| Source revision changed | Working copy is stale | Reset the working directory and project the current revision | The preview and build operate on the source the product currently owns |

## Retry policy

The default policy starts at 500 milliseconds, doubles up to 30 seconds, and uses the full 60-second retry budget. The final wait is capped at the remaining budget before one last connection attempt. These values are configurable through `SandboxLifecycleConfig`.

When the retry budget is exhausted, the lifecycle treats the retained environment as replaceable. It requests deletion, creates a new Sandbox through the SDK’s idempotent creation path, and projects the host revision.

Do not use this policy for application-origin errors. A missing file or invalid route can return a 404 from code running inside a healthy Sandbox. Replacing the environment would discard useful working state without correcting the request.

## Process waits

Blaxel limits `waitForCompletion` to 60 seconds. The adapter uses that mode for short operations. For a longer configured timeout, it starts the process with `waitForCompletion: false`, observes it through `process.wait`, and kills the named process if the wait budget expires.

Process exits remain data for the repair loop:

```text
source revision
  -> type-check or build
  -> stdout, stderr, exit code
  -> repair strategy
  -> saved host revision
  -> projected working copy
  -> type-check or build
```

`StaticRepairStrategy` makes the example deterministic. An application can replace it with its own agent or model implementation while keeping the lifecycle contract unchanged.

## Standby and resume

The preview process runs without process keep-alive. When active connections close, the Sandbox can enter standby. The next interaction reconnects to the same deterministic Sandbox name and compares its retained revision with the host revision.

The live test waits beyond the documented transition window and verifies retained state after reconnect. Blaxel does not expose a start or stop API for standby, so the test does not claim direct observation of the transition.

External network connections are not assumed to survive standby. Application code should health-check or reconnect database, queue, and HTTP connections after resume.

## Expiration

The production reference uses a seven-day `ttl-idle` policy as an explicit cleanup choice. Blaxel counts idle-policy activity at resume and suspend boundaries. A Sandbox that stays continuously active without returning to standby can therefore reach the idle TTL. Applications should select the value for their workload instead of treating `ttl-idle` as a guarantee that active work cannot expire.

Expiration is separate from standby. Deletion removes the Sandbox working copy, while standby retains it. The host revision remains the recovery source of truth when the lifecycle creates a replacement. Applications can add a reviewed `ttl-max-age` policy when a total lifetime is intentional.
