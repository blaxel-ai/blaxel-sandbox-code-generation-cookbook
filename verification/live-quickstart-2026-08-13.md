# Live quickstart verification — 2026-08-13

- **Scope:** two-stage quickstart lifecycle in a temporary Blaxel Sandbox
- **Region:** `us-pdx-1`
- **Command:** `npm run test:live:quickstart`
- **Result:** passed
- **Verified:** revision 1 creation; locked dependency installation; revision 2 in the same Sandbox; retained `node_modules` and sibling component; one retained preview URL; expected content from both revisions
- **Cleanup:** the suite requested deletion; a post-run workspace inventory found no `codegen-quickstart-test-*` Sandboxes remaining
- **Not covered:** the custom runtime image and production lifecycle suites

This record contains no workspace credentials, preview tokens, private source, or private image references. The default CI suite remains separate from credentialed live validation.
