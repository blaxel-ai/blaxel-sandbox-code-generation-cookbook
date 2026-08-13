# Runtime image

The supplied image makes the cookbook’s execution assumptions explicit.

## Contents

- Node.js 22 on Alpine Linux.
- The Blaxel Sandbox API.
- `git`, `make`, `g++`, Python, `tar`, and `unzip` for generated project builds and archive projection.
- A non-root `builder` user that owns `/workspace`.

The Dockerfile pins the Node image and Sandbox API source by digest. At boot, the root entrypoint prepares the builder home and `/workspace` for the workload user, then starts the Sandbox API with `--user builder`. Workload processes and filesystem operations drop privileges while infrastructure operations keep the access they require.

## Build and push

```bash
cd images/codegen
bl push --yes
```

Set the returned image reference as `BL_SANDBOX_IMAGE`. The lifecycle requires an explicit image and does not silently fall back to a mutable Hub image.

If Docker is available locally:

```bash
make -C images/codegen test
```

The opt-in Sandbox image check validates the pushed image:

```bash
npm run test:live:image
```

## Release policy

Before production use:

1. Rebuild against reviewed source digests.
2. Scan the built image and its dependency inventory.
3. Sign the built image and preserve provenance.
4. Pin `BL_SANDBOX_IMAGE` to the reviewed immutable reference.
5. Run the image and lifecycle live checks in the intended Blaxel workspace and region.
6. Review which native build tools generated projects genuinely need.

Do not add application secrets to the Dockerfile. If generated builds need private packages, use a reviewed credential path that does not expose reusable credentials to generated code.
