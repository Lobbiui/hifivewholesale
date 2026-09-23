"use client";
/* eslint-disable @next/next/no-img-element -- administrator-supplied product URLs cannot be known at build time */

import { CheckCircle2, Download, FileSpreadsheet, Pencil, Plus, RefreshCw, Trash2, UploadCloud, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type CatalogProduct = { id:string; name:string; brand:string; category:string; description:string; sku:string; upc:string; variant:string; unitsPerCase:number; price:number|null; stock:number; lowAt:number; status:string; strength:string; flavor:string; format:string; imageUrl:string };
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
  const [editor, setEditor] = useState<CatalogProduct | "new" | null>(null);

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

  const saveProduct = async (form: FormData) => {
    setBusy(true); setMessage("Saving product…");
    const editing = editor !== "new" && editor !== null;
    const payload = { id: editing ? editor.id : undefined, name:String(form.get("name")||""), brand:String(form.get("brand")||""), category:String(form.get("category")||""), description:String(form.get("description")||""), status:String(form.get("status")||"DRAFT"), sku:String(form.get("sku")||""), upc:String(form.get("upc")||""), variant:String(form.get("variant")||""), unitsPerCase:Number(form.get("unitsPerCase")||1), price:Number(form.get("price")||0), stock:Number(form.get("stock")||0), lowAt:Number(form.get("lowAt")||0), strength:String(form.get("strength")||""), flavor:String(form.get("flavor")||""), format:String(form.get("format")||""), imageUrl:String(form.get("imageUrl")||"") };
    const response=await fetch("/api/admin/products",{method:editing?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const result=await response.json() as {message?:string};
    if(!response.ok){setMessage(result.message||"The product could not be saved.");setBusy(false);return}setEditor(null);setMessage(editing?"Product updated.":"Product created.");await load();setBusy(false);
  };
  const archiveProduct=async(product:CatalogProduct)=>{if(!window.confirm(`Archive ${product.name}? It will no longer be sellable.`))return;setBusy(true);const response=await fetch(`/api/admin/products?id=${encodeURIComponent(product.id)}`,{method:"DELETE"});setMessage(response.ok?"Product archived.":"The product could not be archived.");if(response.ok)await load();setBusy(false)};

  return <>
    <div className="admin-section-head catalog-admin-head"><div><span className="eyebrow">Catalog & inventory</span><h2>PRODUCT CONTROL.</h2><p>Create or edit products directly, or preview a CSV inventory export before committing it.</p></div><div className="decision-actions"><button className="admin-button primary" onClick={()=>setEditor("new")}><Plus/>New product</button><a className="admin-button" href="/api/admin/catalog-imports/template"><Download/>Catalog template</a></div></div>
    {message && <div className="gate-message" aria-live="polite">{message}</div>}
    {editor&&<form className="admin-card operations-form product-editor" action={saveProduct} key={editor==="new"?"new":editor.id}><div className="admin-section-head"><div><span className="eyebrow">{editor==="new"?"Create catalog item":"Edit catalog item"}</span><h3>{editor==="new"?"NEW PRODUCT":editor.name}</h3></div><button type="button" className="icon-button" onClick={()=>setEditor(null)} aria-label="Close product editor"><X/></button></div><label>Product name<input name="name" defaultValue={editor==="new"?"":editor.name} required/></label><label>Brand<input name="brand" defaultValue={editor==="new"?"":editor.brand} required/></label><label>Category<input name="category" defaultValue={editor==="new"?"":editor.category} required/></label><label>Status<select name="status" defaultValue={editor==="new"?"DRAFT":editor.status.toUpperCase()}><option>DRAFT</option><option>SCHEDULED</option><option>PUBLISHED</option><option>ARCHIVED</option></select></label><label>SKU<input name="sku" defaultValue={editor==="new"?"":editor.sku}/></label><label>UPC<input name="upc" defaultValue={editor==="new"?"":editor.upc}/></label><label>Variant<input name="variant" defaultValue={editor==="new"?"Standard":editor.variant} required/></label><label>Units per case<input name="unitsPerCase" type="number" min="1" defaultValue={editor==="new"?1:editor.unitsPerCase} required/></label><label>Case price<input name="price" type="number" min="0" step="0.01" defaultValue={editor==="new"?0:editor.price??0} required/></label><label>On hand<input name="stock" type="number" min="0" defaultValue={editor==="new"?0:editor.stock} required/></label><label>Low-stock alert<input name="lowAt" type="number" min="0" defaultValue={editor==="new"?0:editor.lowAt} required/></label><label>Strength<input name="strength" defaultValue={editor==="new"?"":editor.strength}/></label><label>Flavor<input name="flavor" defaultValue={editor==="new"?"":editor.flavor}/></label><label>Format<input name="format" defaultValue={editor==="new"?"":editor.format}/></label><label className="full-field">Primary image URL<input name="imageUrl" type="url" defaultValue={editor==="new"?"":editor.imageUrl} placeholder="https://…"/></label><label className="full-field">Description<textarea name="description" rows={5} defaultValue={editor==="new"?"":editor.description}/></label><button className="admin-button primary full" disabled={busy}>{busy?"Saving…":"Save product"}</button></form>}
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
    <div className="inventory-grid catalog-inventory-grid">{products.map((product) => <article className="inventory-card" key={product.id}><div className="inventory-art">{product.imageUrl?<img src={product.imageUrl} alt=""/>:<span>{product.brand.slice(0,2).toUpperCase()}</span>}</div><span className={`admin-pill ${product.status === "Published" ? "good" : "warn"}`}>{product.status}</span><h3>{product.name}</h3><small>{product.brand} · {product.sku||"No SKU"} · {product.variant}</small><div><span><small>Case price</small><b>{product.price === null ? "Pending" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(product.price)}</b></span><span><small>On hand</small><b className={product.stock <= product.lowAt ? "danger" : ""}>{product.stock}</b></span><span><small>Alert at</small><b>{product.lowAt}</b></span></div><div className="decision-actions"><button onClick={()=>setEditor(product)}><Pencil/>Edit</button><button onClick={()=>void archiveProduct(product)}><Trash2/>Archive</button></div></article>)}</div>
  </>;
}
