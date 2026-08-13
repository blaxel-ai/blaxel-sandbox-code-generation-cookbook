# Production adaptation

The quickstart proves the execution loop. The production reference adds lifecycle and security boundaries. An integrating application still owns user authorization, durable product state, workload policy, and operational controls.

## Demonstrated in this repository

- Contract tests and opt-in live lifecycle checks.
- Idempotent Sandbox and preview creation.
- Host-owned source revisions and replacement rehydration.
- Bulk source projection and protected working-directory reset.
- Structured build results and bounded recovery behavior.
- Private preview access with backend-held token transport.
- Scoped browser sessions that do not expose workspace credentials.
- A custom image that runs workload operations as a non-root user.
- Resource labels and expiration policies for managed examples.

## Application integration responsibilities

- Authorize the user and project before builds, sessions, or previews are issued.
- Replace local file stores with the product’s durable database and artifact store.
- Add distributed ownership or idempotency around concurrent build and replacement operations.
- Define allowed generated files, packages, commands, source size, file count, and network destinations.
- Record cleanup intent, reconcile deletion failures, and alert on resources that remain beyond policy.
- Connect process output and lifecycle events to the product’s observability system.
- Choose expiration policies with the documented resume and suspend semantics in mind.

## Release review

- Run `npm run check` from a clean checkout.
- Run the two-stage quickstart live test in the intended Blaxel workspace.
- Run the live lifecycle test in the intended Blaxel workspace.
- Run the manually dispatched **Live validation** workflow when repository-level proof is required.
- Run the non-root image test against the exact image reference intended for release.
- Confirm current file, process, session, preview, lifecycle, and error behavior against public documentation.
- Rebuild, scan, sign, and pin the custom image and its dependency inventory.
- Resolve dependency audit findings or document the accepted boundary.
- Complete security review for credentials, sessions, previews, commands, projected files, and network policy.
- Keep private preview tokens out of URLs, browser history, logs, and analytics.
- Approve the generated application server’s explicit preview-host allowlist.
- Review the generated package and command policy, including the deliberate `--ignore-scripts` default.
- Treat Sandbox proxy domain filtering as public preview and apply any additional network controls required for untrusted code.
- Confirm that publication and distribution comply with the repository's MIT license.
- Scan the repository, Git history, metadata, screenshots, and generated artifacts for restricted identifiers.
- Obtain content, product, security, and legal approval before changing repository visibility.
