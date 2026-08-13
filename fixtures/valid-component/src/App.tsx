import { CatalogStatus } from "./CatalogStatus.js";

export function App() {
  const accent = "#4e8dff";

  return (
    <main className="shell" style={{ borderColor: accent }}>
      <p className="eyebrow">Generated component</p>
      <h1>Build the product loop. Delegate the execution layer.</h1>
      <p>
        The host keeps the durable source. The Sandbox builds, checks, and
        previews the working copy.
      </p>
      <CatalogStatus />
    </main>
  );
}
