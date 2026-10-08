"use client";
/* eslint-disable @next/next/no-img-element -- administrator-supplied product URLs cannot be known at build time */

import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  GripVertical,
  ImagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Star,
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
  upc: string;
  unitsPerCase: number;
  price: number | null;
  stock: number;
  lowAt: number;
  active: boolean;
  imageUrls?: string[];
  coaUrls?: string[];
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

type ImageManagerProps = {
  title: string;
  urls: string[];
  busy: boolean;
  onUpload: (file: File) => void;
  onReplace: (url: string, file: File) => void;
  onRemove: (url: string) => void;
  onReorder: (urls: string[]) => void;
};

function ImageManager({
  title,
  urls,
  busy,
  onUpload,
  onReplace,
  onRemove,
  onReorder,
}: ImageManagerProps) {
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= urls.length) return;
    const next = [...urls];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next);
  };

  return (
    <section className="product-image-manager">
      <header>
        <div>
          <h4>{title}</h4>
          <p>Drag to reorder. The first image is the storefront primary.</p>
        </div>
        <label className="admin-button image-upload-button">
          <ImagePlus />
          Add image
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(event) => {
              const selected = event.target.files?.[0];
              if (selected) onUpload(selected);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </header>
      {urls.length === 0 ? (
        <div className="product-image-empty">No product shots uploaded.</div>
      ) : (
        <div className="product-image-list">
          {urls.map((url, index) => (
            <article
              key={`${url}-${index}`}
              draggable={!busy}
              onDragStart={(event) =>
                event.dataTransfer.setData("text/plain", String(index))
              }
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const from = Number(event.dataTransfer.getData("text/plain"));
                if (Number.isInteger(from)) move(from, index);
              }}
            >
              <div className="product-image-preview">
                <img src={url} alt={`${title} image ${index + 1}`} />
                {index === 0 && (
                  <span>
                    <Star /> Primary
                  </span>
                )}
              </div>
              <div className="product-image-order">
                <GripVertical aria-hidden="true" />
                <span>{index + 1}</span>
                <button
                  type="button"
                  onClick={() => move(index, 0)}
                  disabled={busy || index === 0}
                  title="Make primary"
                  aria-label={`Make ${title} image ${index + 1} primary`}
                >
                  <Star />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, index - 1)}
                  disabled={busy || index === 0}
                  title="Move earlier"
                  aria-label={`Move ${title} image ${index + 1} earlier`}
                >
                  <ChevronLeft />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, index + 1)}
                  disabled={busy || index === urls.length - 1}
                  title="Move later"
                  aria-label={`Move ${title} image ${index + 1} later`}
                >
                  <ChevronRight />
                </button>
              </div>
              <div className="product-image-actions">
                <label>
                  <Pencil /> Replace
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={busy}
                    onChange={(event) => {
                      const selected = event.target.files?.[0];
                      if (selected) onReplace(url, selected);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => onRemove(url)}
                  disabled={busy}
                >
                  <Trash2 /> Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

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
  const [editorName, setEditorName] = useState("");
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [mainImages, setMainImages] = useState<string[]>([]);
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
    const catalogProducts = result.products ?? [];
    setProducts(catalogProducts);
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
    return catalogProducts;
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

  const updateOption = <Key extends keyof ProductOption>(
    index: number,
    key: Key,
    value: ProductOption[Key],
  ) => {
    setOptions((current) =>
      current.map((option, position) =>
        position === index ? { ...option, [key]: value } : option,
      ),
    );
  };

  const saveProduct = async (form: FormData) => {
    setBusy(true);
    setMessage("Saving product…");
    const editing = editor !== "new" && editor !== null;
    const payload = {
      id: editing ? editor.id : undefined,
      name: editorName.trim(),
      alternateName: String(form.get("alternateName") || ""),
      productType: String(form.get("productType") || "Uncategorized"),
      brand: String(form.get("brand") || ""),
      productLine: String(form.get("productLine") || ""),
      category: String(form.get("category") || ""),
      description: String(form.get("description") || ""),
      status: String(form.get("status") || "DRAFT"),
      variants: options.map((option) => ({
        id: option.id,
        name: option.name,
        upc: option.upc,
        unitsPerCase: option.unitsPerCase,
        price: option.price,
        stock: option.stock,
        lowAt: option.lowAt,
        active: option.active,
      })),
      productStats: String(form.get("productStats") || ""),
      flavor: String(form.get("flavor") || ""),
      format: String(form.get("format") || ""),
      imageUrl: mainImages[0] ?? String(form.get("imageUrl") || ""),
      coaUrl: String(form.get("coaUrl") || ""),
      color: String(form.get("color") || "#39244d"),
      accent: String(form.get("accent") || "#b67cff"),
    };
    try {
      const response = await fetch("/api/admin/products", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        id?: string;
        message?: string;
      };
      if (!response.ok || !result.id) {
        setMessage(result.message || "The product could not be saved.");
        return;
      }
      const refreshed = await load();
      const saved = refreshed.find((product) => product.id === result.id);
      if (saved) openEditor(saved);
      else setEditor(null);
      setMessage(
        editing
          ? "Product and shopper options updated."
          : "Product created. You may now upload option images and COAs.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The product could not be saved.",
      );
    } finally {
      setBusy(false);
    }
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
    setEditorName(product === "new" ? "" : product.name);
    setMainImages(product === "new" ? [] : product.imageUrls);
    setOptions(
      product === "new"
        ? [
            {
              name: "Standard",
              upc: "",
              unitsPerCase: 1,
              price: null,
              stock: 0,
              lowAt: 0,
              active: true,
            },
          ]
        : product.variants,
    );
    setEditor(product);
  };

  const setTargetImages = (urls: string[], variantId?: string) => {
    if (!variantId) {
      setMainImages(urls);
      setEditor((current) =>
        current && current !== "new" ? { ...current, imageUrls: urls } : current,
      );
      return;
    }
    setOptions((current) =>
      current.map((option) =>
        option.id === variantId ? { ...option, imageUrls: urls } : option,
      ),
    );
  };

  const uploadAsset = async (
    productId: string,
    assetType: "IMAGE" | "COA",
    asset: File | null,
    variantId?: string,
  ) => {
    if (!asset) return null;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("productId", productId);
      form.set("assetType", assetType);
      if (variantId) form.set("variantId", variantId);
      form.set("file", asset);
      const response = await fetch("/api/admin/product-assets", {
        method: "POST",
        body: form,
      });
      const result = (await response.json()) as {
        message?: string;
        url?: string;
      };
      if (!response.ok || !result.url)
        throw new Error(result.message || "Upload failed.");

      if (assetType === "IMAGE") {
        const current = variantId
          ? (options.find((option) => option.id === variantId)?.imageUrls ?? [])
          : mainImages;
        setTargetImages([result.url, ...current], variantId);
      } else if (variantId) {
        setOptions((current) =>
          current.map((option) =>
            option.id === variantId
              ? {
                  ...option,
                  coaUrls: [...(option.coaUrls ?? []), result.url!],
                }
              : option,
          ),
        );
      } else {
        setEditor((current) =>
          current && current !== "new"
            ? { ...current, coaUrls: [...current.coaUrls, result.url!] }
            : current,
        );
      }
      await load();
      setMessage(`${assetType === "IMAGE" ? "Image" : "COA"} uploaded.`);
      return result.url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const mutateImages = async (
    productId: string,
    operation: "REORDER" | "REMOVE",
    value: string[] | string,
    variantId?: string,
  ) => {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/product-assets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation,
          productId,
          variantId,
          assetType: "IMAGE",
          ...(operation === "REORDER" ? { urls: value } : { url: value }),
        }),
      });
      const result = (await response.json()) as {
        message?: string;
        urls?: string[];
      };
      if (!response.ok || !result.urls)
        throw new Error(result.message || "The image change could not be saved.");
      setTargetImages(result.urls, variantId);
      await load();
      setMessage(
        operation === "REMOVE" ? "Image removed." : "Image order updated.",
      );
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The image change could not be saved.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  const removeImage = async (
    productId: string,
    url: string,
    variantId?: string,
    skipConfirmation = false,
  ) => {
    if (
      !skipConfirmation &&
      !window.confirm("Remove this image from the product gallery?")
    )
      return false;
    return mutateImages(productId, "REMOVE", url, variantId);
  };

  const replaceImage = async (
    productId: string,
    oldUrl: string,
    file: File,
    variantId?: string,
  ) => {
    const uploaded = await uploadAsset(
      productId,
      "IMAGE",
      file,
      variantId,
    );
    if (!uploaded) return;
    const removed = await removeImage(productId, oldUrl, variantId, true);
    if (removed) setMessage("Image replaced and set as primary.");
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
            onSubmit={(event) => {
              event.preventDefault();
              void saveProduct(new FormData(event.currentTarget));
            }}
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
                  {editor === "new" ? "NEW PRODUCT" : editorName || editor.name}
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
                value={editorName}
                onChange={(event) => setEditorName(event.target.value)}
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
                <div
                  className={`product-option-row${option.active ? "" : " is-hidden"}`}
                  key={option.id ?? index}
                >
                  <label>
                    Flavor / option
                    <input
                      name="optionName"
                      value={option.name}
                      onChange={(event) =>
                        updateOption(index, "name", event.target.value)
                      }
                      required
                    />
                  </label>
                  <label>
                    UPC
                    <input
                      name="optionUpc"
                      value={option.upc}
                      onChange={(event) =>
                        updateOption(index, "upc", event.target.value)
                      }
                      inputMode="numeric"
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    Units/case
                    <input
                      name="optionUnits"
                      type="number"
                      min="1"
                      value={option.unitsPerCase}
                      onChange={(event) =>
                        updateOption(
                          index,
                          "unitsPerCase",
                          Number(event.target.value),
                        )
                      }
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
                      value={option.price ?? ""}
                      onChange={(event) =>
                        updateOption(
                          index,
                          "price",
                          event.target.value === ""
                            ? null
                            : Number(event.target.value),
                        )
                      }
                    />
                  </label>
                  <label>
                    On hand
                    <input
                      name="optionStock"
                      type="number"
                      min="0"
                      value={option.stock}
                      onChange={(event) =>
                        updateOption(index, "stock", Number(event.target.value))
                      }
                      required
                    />
                  </label>
                  <label>
                    Low alert
                    <input
                      name="optionLowAt"
                      type="number"
                      min="0"
                      value={option.lowAt}
                      onChange={(event) =>
                        updateOption(index, "lowAt", Number(event.target.value))
                      }
                      required
                    />
                  </label>
                  <label className="option-availability">
                    Buyer availability
                    <select
                      value={option.active ? "AVAILABLE" : "HIDDEN"}
                      onChange={(event) =>
                        updateOption(
                          index,
                          "active",
                          event.target.value === "AVAILABLE",
                        )
                      }
                    >
                      <option value="AVAILABLE">Available</option>
                      <option value="HIDDEN">Hidden</option>
                    </select>
                    <small>
                      {option.active
                        ? "Shown to approved buyers"
                        : "Saved, but hidden from buyers"}
                    </small>
                  </label>
                  {editor !== "new" && option.id ? (
                    <div className="option-media-cell">
                      <label>
                        COA
                        <input
                          type="file"
                          accept="application/pdf,image/jpeg,image/png,image/webp"
                          onChange={(event) =>
                            void uploadAsset(
                              editor.id,
                              "COA",
                              event.target.files?.[0] ?? null,
                              option.id,
                            )
                          }
                        />
                        <small>{option.coaUrls?.length ?? 0} uploaded</small>
                      </label>
                    </div>
                  ) : (
                    <small className="option-save-note">
                      Save the product before uploading this option’s media.
                    </small>
                  )}
                  {!option.id && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Remove unsaved option"
                      disabled={options.length === 1}
                      onClick={() =>
                        setOptions((current) =>
                          current.filter((_, position) => position !== index),
                        )
                      }
                    >
                      <Trash2 />
                    </button>
                  )}
                  {editor !== "new" && option.id && (
                    <div className="option-image-manager">
                      <ImageManager
                        title={`${option.name || `Option ${index + 1}`} product shots`}
                        urls={option.imageUrls ?? []}
                        busy={busy}
                        onUpload={(selected) =>
                          void uploadAsset(
                            editor.id,
                            "IMAGE",
                            selected,
                            option.id,
                          )
                        }
                        onReplace={(url, selected) =>
                          void replaceImage(
                            editor.id,
                            url,
                            selected,
                            option.id,
                          )
                        }
                        onRemove={(url) =>
                          void removeImage(editor.id, url, option.id)
                        }
                        onReorder={(urls) =>
                          void mutateImages(
                            editor.id,
                            "REORDER",
                            urls,
                            option.id,
                          )
                        }
                      />
                    </div>
                  )}
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
                      upc: "",
                      unitsPerCase: 1,
                      price: null,
                      stock: 0,
                      lowAt: 0,
                      active: true,
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
                value={mainImages[0] ?? ""}
                onChange={(event) =>
                  setMainImages((current) =>
                    event.target.value
                      ? [event.target.value, ...current.slice(1)]
                      : current.slice(1),
                  )
                }
                placeholder="https://… or /catalog/…"
              />
            </label>
            {editor !== "new" && (
              <div className="full-field">
                <ImageManager
                  title="Main product images"
                  urls={mainImages}
                  busy={busy}
                  onUpload={(selected) =>
                    void uploadAsset(editor.id, "IMAGE", selected)
                  }
                  onReplace={(url, selected) =>
                    void replaceImage(editor.id, url, selected)
                  }
                  onRemove={(url) => void removeImage(editor.id, url)}
                  onReorder={(urls) =>
                    void mutateImages(editor.id, "REORDER", urls)
                  }
                />
              </div>
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
            <div className="admin-option-summary">
              <table>
                <colgroup>
                  <col className="option-name-column" />
                  <col className="option-upc-column" />
                  <col className="option-shot-column" />
                  <col className="option-coa-column" />
                  <col className="option-stock-column" />
                  <col className="option-price-column" />
                  <col className="option-status-column" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Flavor / option</th>
                    <th>UPC</th>
                    <th>Product shot</th>
                    <th>COA</th>
                    <th>On hand</th>
                    <th>Case price</th>
                    <th>Availability</th>
                  </tr>
                </thead>
                <tbody>
                  {product.variants.map((option) => (
                    <tr key={option.id ?? option.name}>
                      <td>{option.name}</td>
                      <td>{option.upc || "—"}</td>
                      <td>
                        {option.imageUrls?.[0] ? (
                          <a
                            href={option.imageUrls[0]}
                            target="_blank"
                            rel="noreferrer"
                            className="option-asset-link"
                          >
                            <img src={option.imageUrls[0]} alt="" />
                            View
                          </a>
                        ) : (
                          "Missing"
                        )}
                      </td>
                      <td>
                        {option.coaUrls?.[0] ? (
                          <a
                            href={option.coaUrls[0]}
                            target="_blank"
                            rel="noreferrer"
                            className="option-asset-link"
                          >
                            View COA
                          </a>
                        ) : (
                          "Missing"
                        )}
                      </td>
                      <td>{option.stock}</td>
                      <td>
                        {option.price === null
                          ? "Pending"
                          : new Intl.NumberFormat("en-US", {
                              style: "currency",
                              currency: "USD",
                            }).format(option.price)}
                      </td>
                      <td>
                        <span
                          className={`admin-pill ${option.active ? "good" : "warn"}`}
                        >
                          {option.active ? "Available" : "Hidden"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
