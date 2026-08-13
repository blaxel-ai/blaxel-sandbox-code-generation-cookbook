import { CatalogStatus } from "./CatalogStatus.js";

export function App() {
  const accent = "#82d7ae";

  return (
    <main className="shell" style={{ borderColor: accent }}>
      <p className="eyebrow">Generated component · revision 2</p>
      <h1>The next edit shipped from the same Sandbox.</h1>
      <p>
        The working environment and dependencies stayed in place while the
        generated source changed and the preview rebuilt.
      </p>
      <CatalogStatus />
    </main>
  );
}
