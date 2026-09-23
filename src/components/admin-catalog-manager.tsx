"use client";

import { CheckCircle2, Download, FileSpreadsheet, RefreshCw, UploadCloud, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type CatalogProduct = { id: string; name: string; brand: string; sku: string; variant: string; price: number | null; stock: number; lowAt: number; status: string };
type ImportRecord = { id: string; filename: string; type: string; rows: number; units: number; drafts: number; createdAt: string };
type Preview = { importType: "CLOVER_INVENTORY" | "FULL_CATALOG"; filename: string; rowCount: number; totalUnits: number; zeroQuantityRows: number; readyToPublish: number; drafts: number; warnings: string[]; rows: { rowNumber: number; product: string; brand: string; quantity: number; status: string }[] };

export function AdminCatalogManager() {
  const input = useRef<HTMLInputElement>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("Loading the persistent catalog…");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/products", { cache: "no-store" });
    const result = await response.json() as { products?: CatalogProduct[]; imports?: ImportRecord[]; message?: string };
    if (!response.ok) throw new Error(result.message || "Catalog records could not be loaded.");
    setProducts(result.products ?? []);
    setImports(result.imports ?? []);
    setMessage((result.products?.length ?? 0) ? "" : "No products have been imported yet.");
  }, []);

  useEffect(() => {
    // Loading is intentionally triggered once when the authenticated workspace mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  const choose = async (next: File | null) => {
    setFile(next);
    setPreview(null);
    if (!next) return;
    setBusy(true);
    setMessage("Validating every row without changing the catalog…");
    const form = new FormData();
    form.set("file", next);
    try {
      const response = await fetch("/api/admin/catalog-imports/preview", { method: "POST", body: form });
      const result = await response.json() as { preview?: Preview; message?: string };
      if (!response.ok || !result.preview) throw new Error(result.message || "The CSV could not be previewed.");
      setPreview(result.preview);
      setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The CSV could not be previewed."); }
    finally { setBusy(false); }
  };

  const commit = async () => {
    if (!file || !preview) return;
    setBusy(true);
    setMessage("Importing the validated catalog in one protected transaction…");
    const form = new FormData();
    form.set("file", file);
    try {
      const response = await fetch("/api/admin/catalog-imports/commit", { method: "POST", body: form });
      const result = await response.json() as { result?: { rowCount: number; totalUnits: number; drafts: number }; message?: string };
      if (!response.ok || !result.result) throw new Error(result.message || "The import could not be completed.");
      setMessage(`Import complete: ${result.result.rowCount} products and ${result.result.totalUnits} inventory units processed. ${result.result.drafts} product${result.result.drafts === 1 ? " remains" : "s remain"} in Draft.`);
      setFile(null); setPreview(null); if (input.current) input.current.value = "";
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The import could not be completed."); }
    finally { setBusy(false); }
  };

  return <>
    <div className="admin-section-head catalog-admin-head"><div><span className="eyebrow">Catalog & inventory</span><h2>PRODUCT CONTROL.</h2><p>Preview Clover inventory exports before committing them, or use the full catalog template to add approved content, media, pricing, and publish status.</p></div><a className="admin-button" href="/api/admin/catalog-imports/template"><Download/>Catalog template</a></div>
    {message && <div className="gate-message" aria-live="polite">{message}</div>}
    <section className="catalog-import-panel">
      <div className={dragging ? "catalog-dropzone dragging" : "catalog-dropzone"} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void choose(event.dataTransfer.files[0] ?? null); }}>
        <UploadCloud/><div><strong>Drop a Clover or Hi-Five CSV here</strong><span>Nothing changes until the preview is reviewed and confirmed.</span></div><button className="admin-button primary" onClick={() => input.current?.click()} disabled={busy}>Choose CSV</button><input ref={input} hidden type="file" accept=".csv,text/csv" onChange={(event) => void choose(event.target.files?.[0] ?? null)}/>
      </div>
      {preview && <div className="catalog-preview">
        <header><div><FileSpreadsheet/><div><strong>{preview.filename}</strong><span>{preview.importType === "CLOVER_INVENTORY" ? "Clover inventory update" : "Full catalog update"}</span></div></div><button aria-label="Close import preview" onClick={() => { setFile(null); setPreview(null); }}><X/></button></header>
        <div className="catalog-preview-stats"><span><b>{preview.rowCount}</b> rows</span><span><b>{preview.totalUnits}</b> units</span><span><b>{preview.zeroQuantityRows}</b> zero quantity</span><span><b>{preview.readyToPublish}</b> publish-ready</span><span><b>{preview.drafts}</b> drafts</span></div>
        {preview.warnings.map((warning) => <p className="catalog-warning" key={warning}>{warning}</p>)}
        <div className="catalog-preview-table"><table><thead><tr><th>Row</th><th>Product</th><th>Brand</th><th>Qty</th><th>Result</th></tr></thead><tbody>{preview.rows.map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.product}</td><td>{row.brand}</td><td>{row.quantity}</td><td><span className={`catalog-status ${row.status.toLowerCase()}`}>{row.status}</span></td></tr>)}</tbody></table>{preview.rowCount > preview.rows.length && <small>Showing the first {preview.rows.length} of {preview.rowCount} validated rows.</small>}</div>
        <footer><span><CheckCircle2/>The file will be revalidated during import.</span><button className="admin-button primary" onClick={commit} disabled={busy}>{busy ? <><RefreshCw className="spin"/>Importing…</> : <>Import {preview.rowCount} rows</>}</button></footer>
      </div>}
    </section>
    {imports.length > 0 && <section className="catalog-import-history"><h3>Recent imports</h3>{imports.map((item) => <article key={item.id}><FileSpreadsheet/><div><b>{item.filename}</b><span>{new Date(item.createdAt).toLocaleString()} · {item.rows} rows · {item.units} units</span></div><span>{item.drafts} drafts</span></article>)}</section>}
    <div className="inventory-grid catalog-inventory-grid">{products.map((product) => <article className="inventory-card" key={product.id}><div className="inventory-art"><span>{product.brand.slice(0, 2).toUpperCase()}</span></div><span className={`admin-pill ${product.status === "Published" ? "good" : "warn"}`}>{product.status}</span><h3>{product.name}</h3><small>{product.brand} · {product.sku} · {product.variant}</small><div><span><small>Case price</small><b>{product.price === null ? "Pending" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(product.price)}</b></span><span><small>On hand</small><b className={product.stock <= product.lowAt ? "danger" : ""}>{product.stock}</b></span><span><small>Alert at</small><b>{product.lowAt}</b></span></div></article>)}</div>
  </>;
}
