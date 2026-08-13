# Security boundaries

This cookbook demonstrates an execution architecture. It is not a complete application security model.

## Quickstart boundary

The quickstart uses an official Blaxel Hub image and a public preview to minimize activation steps. Its fixture contains no private source, credentials, or data. Do not use that public-preview pattern for private generated applications. The production reference uses the custom non-root image and private preview flow described below.

## Credential boundary

- `BL_API_KEY` and `BL_WORKSPACE` remain in the backend process.
- Generated code does not receive workspace credentials.
- The browser receives a time-limited session created for one Sandbox.
- The browser session can operate the Sandbox API. It cannot create management-plane sessions or previews.
- A private preview uses a separate, time-limited preview token that the browser demo keeps on the backend.

## Workload user boundary

The image in `images/codegen/` uses a root entrypoint to prepare the builder home and `/workspace`, then starts the Sandbox API with `--user builder`. Processes, terminal sessions, code execution, and filesystem API calls run as that non-root user. The Sandbox API retains the privileges required for infrastructure operations.

The image pins the Node and Sandbox API source images by digest and contains the build and archive tools used by the lifecycle. Rebuild, scan, sign, and pin the resulting image reference before a production release.

## Command and package boundary

The default build, packaging, and preview commands are fixed orchestration input. Do not concatenate user text into those commands.

Fixed command text does not make projected package scripts trusted. The generated project controls `package.json`, so the installer uses `--ignore-scripts`. Type-check, build, and preview scripts still execute generated project code, but they run as the non-root workload user and receive no workspace credential.

If an application needs configurable commands, map approved command IDs to reviewed argument arrays or use a hardened wrapper inside the Sandbox. Keep working directories and executable selection under trusted control.

## File boundary

The lifecycle rejects absolute paths, empty path segments, and `..` traversal before source projection. The archive projection path repeats that validation before creating the ZIP. An application should also apply source-size, file-count, extension, package, and content policies.

Small source trees use one `writeTree` call. Trees with at least 100 files or one MiB of text use one archive upload and extraction command. The thresholds can be changed through `BlaxelRuntimeAdapterOptions`.

The host store remains the durable source of truth. The Sandbox filesystem is a working copy and is lost if the Sandbox is deleted before a revision is saved by the host.

## Browser boundary

Treat the Sandbox session and preview token as credentials:

- Give them short expirations.
- Send them only to an authorized application session.
- Avoid logs and analytics payloads that expose them.
- Do not place preview tokens in query parameters or credential-bearing links. Use the documented `X-Blaxel-Preview-Token` header from a trusted client or application proxy.
- Renew access through the backend when it approaches expiry.

The browser demo backend does not implement application authentication or project authorization. It is local-only.

## Preview boundary

Private preview access is the working default. The backend creates a preview token and keeps the URL and header grant separate. The browser demo does not receive the preview token. A read-only proxy on a separate local origin pins every upstream request to the preview URL's original origin, rejects redirects, sends the header only to Blaxel, and streams the fixture response. The trusted build endpoint requires a non-simple action header and exposes no cross-origin API policy to generated code.

The Vite fixture uses an explicit preview-host allowlist for the Blaxel preview domain and its routing layer. Do not replace that list with `allowedHosts: true`; configure the generated application server for the specific preview hosts it must trust.

`BL_PREVIEW_PUBLIC=true` remains available for an intentionally public fixture. Do not use it for private source or data. A production application must review response headers, origin policy, token transport, expiration, and revocation behavior.

## Isolation and network policy

The custom non-root image is defense in depth inside the Sandbox isolation boundary. This repository does not inject application credentials into the Sandbox.

`BL_SANDBOX_ALLOWED_DOMAINS` can configure the installed SDK’s Sandbox proxy allowlist. That capability is public preview, depends on the workload respecting the proxy, and must not be the only network containment boundary for untrusted code.

## Cleanup boundary

The default seven-day idle expiration policy retires abandoned environments. It is not proof that an explicit deletion request completed. Production systems should record cleanup state, reconcile deletion failures, and alert on resources that remain beyond policy.
