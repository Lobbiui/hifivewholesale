"use client";
/* eslint-disable @next/next/no-img-element -- administrator-supplied product URLs cannot be known at build time */

import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UploadCloud,
  LayoutGrid,
  List,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AdminTaxonomyManager } from "@/components/admin-taxonomy-manager";

type ProductOption = {
  id?: string;
  name: string;
  unitsPerCase: number;
  price: number | null;
  stock: number;
  lowAt: number;
  active?: boolean;
};

type CatalogProduct = {
  id: string;
  name: string;
  alternateName: string;
  productType: string;
  brand: string;
  productLine: string;
  category: string;
  description: string;
  variants: ProductOption[];
  status: string;
  productStats: string;
  flavor: string;
  format: string;
  imageUrls: string[];
  coaUrls: string[];
  color: string;
  accent: string;
};
type ImportRecord = {
  id: string;
  filename: string;
  type: string;
  rows: number;
  units: number;
  drafts: number;
  createdAt: string;
};
type Preview = {
  importType: "CLOVER_INVENTORY" | "FULL_CATALOG";
  filename: string;
  rowCount: number;
  totalUnits: number;
  zeroQuantityRows: number;
  readyToPublish: number;
  drafts: number;
  warnings: string[];
  rows: {
    rowNumber: number;
    product: string;
    brand: string;
    quantity: number;
    status: string;
  }[];
};

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
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [productTypes, setProductTypes] = useState<string[]>([]);
  const [section, setSection] = useState<
    "products" | "category" | "productType"
  >("products");
  const [view, setView] = useState<"detail" | "list">("detail");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/products", { cache: "no-store" });
    const result = (await response.json()) as {
      products?: CatalogProduct[];
      imports?: ImportRecord[];
      message?: string;
    };
    if (!response.ok)
      throw new Error(result.message || "Catalog records could not be loaded.");
    setProducts(result.products ?? []);
    setImports(result.imports ?? []);
    const taxonomyResponse = await fetch("/api/admin/catalog-taxonomy", {
      cache: "no-store",
    });
    if (taxonomyResponse.ok) {
      const taxonomy = (await taxonomyResponse.json()) as {
        categories: string[];
        productTypes: string[];
      };
      setCategories(taxonomy.categories);
      setProductTypes(taxonomy.productTypes);
    }
    setMessage(
      (result.products?.length ?? 0)
        ? ""
        : "No products have been imported yet.",
    );
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
      const response = await fetch("/api/admin/catalog-imports/preview", {
        method: "POST",
        body: form,
      });
      const result = (await response.json()) as {
        preview?: Preview;
        message?: string;
      };
      if (!response.ok || !result.preview)
        throw new Error(result.message || "The CSV could not be previewed.");
      setPreview(result.preview);
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The CSV could not be previewed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!file || !preview) return;
    setBusy(true);
    setMessage("Importing the validated catalog in one protected transaction…");
    const form = new FormData();
    form.set("file", file);
    try {
      const response = await fetch("/api/admin/catalog-imports/commit", {
        method: "POST",
        body: form,
      });
      const result = (await response.json()) as {
        result?: { rowCount: number; totalUnits: number; drafts: number };
        message?: string;
      };
      if (!response.ok || !result.result)
        throw new Error(result.message || "The import could not be completed.");
      setMessage(
        `Import complete: ${result.result.rowCount} products and ${result.result.totalUnits} inventory units processed. ${result.result.drafts} product${result.result.drafts === 1 ? " remains" : "s remain"} in Draft.`,
      );
      setFile(null);
      setPreview(null);
      if (input.current) input.current.value = "";
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The import could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const saveProduct = async (form: FormData) => {
    setBusy(true);
    setMessage("Saving product…");
    const editing = editor !== "new" && editor !== null;
    const prices = form.getAll("optionPrice").map(String);
    const payload = {
      id: editing ? editor.id : undefined,
      name: String(form.get("name") || ""),
      alternateName: String(form.get("alternateName") || ""),
      productType: String(form.get("productType") || "Uncategorized"),
      brand: String(form.get("brand") || ""),
      productLine: String(form.get("productLine") || ""),
      category: String(form.get("category") || ""),
      description: String(form.get("description") || ""),
      status: String(form.get("status") || "DRAFT"),
      variants: form
        .getAll("optionName")
        .map((name, index) => ({
          id: options[index]?.id,
          name: String(name),
          unitsPerCase: Number(form.getAll("optionUnits")[index] || 1),
          price: prices[index] === "" ? null : Number(prices[index]),
          stock: Number(form.getAll("optionStock")[index] || 0),
          lowAt: Number(form.getAll("optionLowAt")[index] || 0),
        })),
      productStats: String(form.get("productStats") || ""),
      flavor: String(form.get("flavor") || ""),
      format: String(form.get("format") || ""),
      imageUrl: String(form.get("imageUrl") || ""),
      coaUrl: String(form.get("coaUrl") || ""),
      color: String(form.get("color") || "#39244d"),
      accent: String(form.get("accent") || "#b67cff"),
    };
    const response = await fetch("/api/admin/products", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as { message?: string };
    if (!response.ok) {
      setMessage(result.message || "The product could not be saved.");
      setBusy(false);
      return;
    }
    setEditor(null);
    setMessage(editing ? "Product updated." : "Product created.");
    await load();
    setBusy(false);
  };
  const archiveProduct = async (product: CatalogProduct) => {
    if (
      !window.confirm(`Archive ${product.name}? It will no longer be sellable.`)
    )
      return;
    setBusy(true);
    const response = await fetch(
      `/api/admin/products?id=${encodeURIComponent(product.id)}`,
      { method: "DELETE" },
    );
    setMessage(
      response.ok ? "Product archived." : "The product could not be archived.",
    );
    if (response.ok) await load();
    setBusy(false);
  };

  const openEditor = (product: CatalogProduct | "new") => {
    setOptions(
      product === "new"
        ? [
            {
              name: "Standard",
              unitsPerCase: 1,
              price: null,
              stock: 0,
              lowAt: 0,
            },
          ]
        : product.variants.filter((option) => option.active !== false),
    );
    setEditor(product);
  };
  const uploadAsset = async (
    productId: string,
    assetType: "IMAGE" | "COA",
    asset: File | null,
  ) => {
    if (!asset) return;
    setBusy(true);
    const form = new FormData();
    form.set("productId", productId);
    form.set("assetType", assetType);
    form.set("file", asset);
    const response = await fetch("/api/admin/product-assets", {
      method: "POST",
      body: form,
    });
    const result = (await response.json()) as { message?: string };
    setMessage(
      response.ok
        ? `${assetType === "IMAGE" ? "Image" : "COA"} uploaded.`
        : result.message || "Upload failed.",
    );
    if (response.ok) await load();
    setBusy(false);
  };

  if (section !== "products")
    return (
      <>
        <div className="catalog-section-tabs">
          <button onClick={() => setSection("products")}>Products</button>
          <button
            className={section === "category" ? "active" : ""}
            onClick={() => setSection("category")}
          >
            Categories
          </button>
          <button
            className={section === "productType" ? "active" : ""}
            onClick={() => setSection("productType")}
          >
            Product types
          </button>
        </div>
        <AdminTaxonomyManager kind={section} onChanged={() => void load()} />
      </>
    );

  return (
    <>
      <div className="catalog-section-tabs">
        <button className="active">Products</button>
        <button onClick={() => setSection("category")}>Categories</button>
        <button onClick={() => setSection("productType")}>Product types</button>
        <span />
        <button
          className={view === "detail" ? "active" : ""}
          onClick={() => setView("detail")}
        >
          <LayoutGrid />
          Detail
        </button>
        <button
          className={view === "list" ? "active" : ""}
          onClick={() => setView("list")}
        >
          <List />
          List
        </button>
      </div>
      <div className="admin-section-head catalog-admin-head">
        <div>
          <span className="eyebrow">Catalog & inventory</span>
          <h2>PRODUCT CONTROL.</h2>
          <p>
            Create or edit products directly, or preview a CSV inventory export
            before committing it.
          </p>
        </div>
        <div className="decision-actions">
          <button
            className="admin-button primary"
            onClick={() => openEditor("new")}
          >
            <Plus />
            New product
          </button>
          <a
            className="admin-button"
            href="/api/admin/catalog-imports/template"
          >
            <Download />
            Catalog template
          </a>
        </div>
      </div>
      {message && (
        <div className="gate-message" aria-live="polite">
          {message}
        </div>
      )}
      {editor && (
        <div
          className="product-editor-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditor(null);
          }}
        >
          <form
            className="admin-card operations-form product-editor"
            action={saveProduct}
            key={editor === "new" ? "new" : editor.id}
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-editor-title"
          >
            <div className="admin-section-head">
              <div>
                <span className="eyebrow">
                  {editor === "new"
                    ? "Create catalog item"
                    : "Edit catalog item"}
                </span>
                <h3 id="product-editor-title">
                  {editor === "new" ? "NEW PRODUCT" : editor.name}
                </h3>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setEditor(null)}
                aria-label="Close product editor"
              >
                <X />
              </button>
            </div>
            <label>
              Product name
              <input
                name="name"
                defaultValue={editor === "new" ? "" : editor.name}
                required
                autoFocus
              />
            </label>
            <label>
              Alternate name
              <input
                name="alternateName"
                defaultValue={editor === "new" ? "" : editor.alternateName}
                placeholder="Exact Clover product name"
              />
              <small>
                Admin-only. Used to match this product in Clover and never
                displayed to buyers.
              </small>
            </label>
            <label>
              Product type
              <select
                name="productType"
                defaultValue={
                  editor === "new" ? "Uncategorized" : editor.productType
                }
                required
              >
                {productTypes.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Brand
              <input
                name="brand"
                defaultValue={editor === "new" ? "" : editor.brand}
                required
              />
            </label>
            <label>
              Product line
              <input
                name="productLine"
                defaultValue={editor === "new" ? "" : editor.productLine}
                placeholder="Collection or product family"
              />
            </label>
            <label>
              Category
              <select
                name="category"
                defaultValue={
                  editor === "new" ? "Uncategorized" : editor.category
                }
                required
              >
                {categories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                name="status"
                defaultValue={
                  editor === "new" ? "DRAFT" : editor.status.toUpperCase()
                }
              >
                <option>DRAFT</option>
                <option>SCHEDULED</option>
                <option>PUBLISHED</option>
                <option>ARCHIVED</option>
              </select>
            </label>
            <fieldset className="product-options full-field">
              <legend>Shopper options / flavors</legend>
              <p>
                Each option is grouped under this single product profile and may
                have its own case price and inventory. Hidden Clover identifiers
                remain intact.
              </p>
              {options.map((option, index) => (
                <div className="product-option-row" key={option.id ?? index}>
                  <label>
                    Flavor / option
                    <input
                      name="optionName"
                      defaultValue={option.name}
                      required
                    />
                  </label>
                  <label>
                    Units/case
                    <input
                      name="optionUnits"
                      type="number"
                      min="1"
                      defaultValue={option.unitsPerCase}
                      required
                    />
                  </label>
                  <label>
                    Case price
                    <input
                      name="optionPrice"
                      type="number"
                      min="0"
                      step=".01"
                      defaultValue={option.price ?? ""}
                    />
                  </label>
                  <label>
                    On hand
                    <input
                      name="optionStock"
                      type="number"
                      min="0"
                      defaultValue={option.stock}
                      required
                    />
                  </label>
                  <label>
                    Low alert
                    <input
                      name="optionLowAt"
                      type="number"
                      min="0"
                      defaultValue={option.lowAt}
                      required
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Remove option"
                    disabled={options.length === 1}
                    onClick={() =>
                      setOptions((current) =>
                        current.filter((_, position) => position !== index),
                      )
                    }
                  >
                    <Trash2 />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="admin-button"
                onClick={() =>
                  setOptions((current) => [
                    ...current,
                    {
                      name: "",
                      unitsPerCase: 1,
                      price: null,
                      stock: 0,
                      lowAt: 0,
                    },
                  ])
                }
              >
                <Plus />
                Add flavor / option
              </button>
            </fieldset>
            <label>
              Product stats
              <input
                name="productStats"
                defaultValue={editor === "new" ? "" : editor.productStats}
              />
              <small>
                Strength, count, size, or other key specifications shown to
                buyers.
              </small>
            </label>
            <label>
              Flavor
              <input
                name="flavor"
                defaultValue={editor === "new" ? "" : editor.flavor}
              />
            </label>
            <label>
              Format
              <input
                name="format"
                defaultValue={editor === "new" ? "" : editor.format}
              />
              <small>
                The package or case format shared by this product profile.
              </small>
            </label>
            <label className="full-field">
              Primary image URL
              <input
                name="imageUrl"
                defaultValue={
                  editor === "new" ? "" : (editor.imageUrls[0] ?? "")
                }
                placeholder="https://… or /catalog/…"
              />
            </label>
            {editor !== "new" && (
              <label className="full-field asset-upload">
                Upload product image
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    void uploadAsset(
                      editor.id,
                      "IMAGE",
                      event.target.files?.[0] ?? null,
                    )
                  }
                />
                <small>
                  Stored securely with this product. JPG, PNG, or WebP; maximum
                  8 MB.
                </small>
              </label>
            )}
            <label className="full-field">
              COA URL
              <input
                name="coaUrl"
                defaultValue={editor === "new" ? "" : (editor.coaUrls[0] ?? "")}
                placeholder="https://… or /api/catalog/assets/…"
              />
            </label>
            {editor !== "new" && (
              <label className="full-field asset-upload">
                Upload COA document
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    void uploadAsset(
                      editor.id,
                      "COA",
                      event.target.files?.[0] ?? null,
                    )
                  }
                />
              </label>
            )}
            <label>
              Shopping-view background
              <input
                name="color"
                type="color"
                defaultValue={editor === "new" ? "#39244d" : editor.color}
              />
              <small>Controls the product display background.</small>
            </label>
            <label>
              Shopping-view accent
              <input
                name="accent"
                type="color"
                defaultValue={editor === "new" ? "#b67cff" : editor.accent}
              />
            </label>
            <label className="full-field">
              Description
              <textarea
                name="description"
                rows={5}
                defaultValue={editor === "new" ? "" : editor.description}
              />
            </label>
            <div className="product-editor-actions full">
              <button
                type="button"
                className="admin-button"
                onClick={() => setEditor(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button className="admin-button primary" disabled={busy}>
                {busy ? "Saving…" : "Save product"}
              </button>
            </div>
          </form>
        </div>
      )}
      <section className="catalog-import-panel">
        <div
          className={
            dragging ? "catalog-dropzone dragging" : "catalog-dropzone"
          }
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void choose(event.dataTransfer.files[0] ?? null);
          }}
        >
          <UploadCloud />
          <div>
            <strong>Drop a Clover or HiFive CSV here</strong>
            <span>
              Nothing changes until the preview is reviewed and confirmed.
            </span>
          </div>
          <button
            className="admin-button primary"
            onClick={() => input.current?.click()}
            disabled={busy}
          >
            Choose CSV
          </button>
          <input
            ref={input}
            hidden
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void choose(event.target.files?.[0] ?? null)}
          />
        </div>
        {preview && (
          <div className="catalog-preview">
            <header>
              <div>
                <FileSpreadsheet />
                <div>
                  <strong>{preview.filename}</strong>
                  <span>
                    {preview.importType === "CLOVER_INVENTORY"
                      ? "Clover inventory update"
                      : "Full catalog update"}
                  </span>
                </div>
              </div>
              <button
                aria-label="Close import preview"
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                }}
              >
                <X />
              </button>
            </header>
            <div className="catalog-preview-stats">
              <span>
                <b>{preview.rowCount}</b> rows
              </span>
              <span>
                <b>{preview.totalUnits}</b> units
              </span>
              <span>
                <b>{preview.zeroQuantityRows}</b> zero quantity
              </span>
              <span>
                <b>{preview.readyToPublish}</b> publish-ready
              </span>
              <span>
                <b>{preview.drafts}</b> drafts
              </span>
            </div>
            {preview.warnings.map((warning) => (
              <p className="catalog-warning" key={warning}>
                {warning}
              </p>
            ))}
            <div className="catalog-preview-table">
              <table>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Product</th>
                    <th>Brand</th>
                    <th>Qty</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td>{row.product}</td>
                      <td>{row.brand}</td>
                      <td>{row.quantity}</td>
                      <td>
                        <span
                          className={`catalog-status ${row.status.toLowerCase()}`}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rowCount > preview.rows.length && (
                <small>
                  Showing the first {preview.rows.length} of {preview.rowCount}{" "}
                  validated rows.
                </small>
              )}
            </div>
            <footer>
              <span>
                <CheckCircle2 />
                The file will be revalidated during import.
              </span>
              <button
                className="admin-button primary"
                onClick={commit}
                disabled={busy}
              >
                {busy ? (
                  <>
                    <RefreshCw className="spin" />
                    Importing…
                  </>
                ) : (
                  <>Import {preview.rowCount} rows</>
                )}
              </button>
            </footer>
          </div>
        )}
      </section>
      {imports.length > 0 && (
        <section className="catalog-import-history">
          <h3>Recent imports</h3>
          {imports.map((item) => (
            <article key={item.id}>
              <FileSpreadsheet />
              <div>
                <b>{item.filename}</b>
                <span>
                  {new Date(item.createdAt).toLocaleString()} · {item.rows} rows
                  · {item.units} units
                </span>
              </div>
              <span>{item.drafts} drafts</span>
            </article>
          ))}
        </section>
      )}
      <div
        className={
          view === "list"
            ? "catalog-product-list"
            : "inventory-grid catalog-inventory-grid"
        }
      >
        {products.map((product) => (
          <article className="inventory-card" key={product.id}>
            <div className="inventory-art">
              {product.imageUrls[0] ? (
                <img src={product.imageUrls[0]} alt="" />
              ) : (
                <span>{product.brand.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <span
              className={`admin-pill ${product.status === "Published" ? "good" : "warn"}`}
            >
              {product.status}
            </span>
            <h3>{product.name}</h3>
            <small>
              {product.productType} · {product.brand} ·{" "}
              {product.productLine || product.category} ·{" "}
              {product.variants.length} option
              {product.variants.length === 1 ? "" : "s"}
            </small>
            <div>
              <span>
                <small>Case price</small>
                <b>
                  {product.variants[0]?.price === null || !product.variants[0]
                    ? "Pending"
                    : new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                      }).format(product.variants[0].price!)}
                </b>
              </span>
              <span>
                <small>On hand</small>
                <b
                  className={
                    (product.variants[0]?.stock ?? 0) <=
                    (product.variants[0]?.lowAt ?? 0)
                      ? "danger"
                      : ""
                  }
                >
                  {product.variants.reduce(
                    (sum, option) => sum + option.stock,
                    0,
                  )}
                </b>
              </span>
              <span>
                <small>COA</small>
                <b>{product.coaUrls.length ? "Linked" : "Missing"}</b>
              </span>
            </div>
            <div className="decision-actions">
              <button onClick={() => openEditor(product)}>
                <Pencil />
                Edit
              </button>
              <button onClick={() => void archiveProduct(product)}>
                <Trash2 />
                Archive
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
