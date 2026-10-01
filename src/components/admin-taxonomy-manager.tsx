"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Kind = "category" | "productType";
type Product = {
  id: string;
  name: string;
  category: string;
  productType: string;
};

export function AdminTaxonomyManager({
  kind,
  onChanged,
}: {
  kind: Kind;
  onChanged: () => void;
}) {
  const [entries, setEntries] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const label = kind === "category" ? "Category" : "Product type";
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/catalog-taxonomy", {
      cache: "no-store",
    });
    const result = (await response.json()) as {
      categories: string[];
      productTypes: string[];
      products: Product[];
      message?: string;
    };
    if (!response.ok)
      throw new Error(
        result.message || "The catalog groups could not be loaded.",
      );
    const next = kind === "category" ? result.categories : result.productTypes;
    setEntries(next);
    setProducts(result.products);
    setSelected((current) =>
      next.includes(current) ? current : (next[0] ?? ""),
    );
  }, [kind]);
  useEffect(() => {
    // The authenticated taxonomy workspace loads once per selected management view.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);
  const request = async (method: string, body?: unknown, query = "") => {
    const response = await fetch(`/api/admin/catalog-taxonomy${query}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    if (!response.ok)
      throw new Error(result.message || `${label} could not be updated.`);
    await load();
    onChanged();
    setMessage(`${label} updated.`);
  };
  const add = async () => {
    const name = window.prompt(`New ${label.toLowerCase()} name`);
    if (name) await request("POST", { kind, name });
  };
  const rename = async () => {
    if (!selected) return;
    const newName = window.prompt(`Rename ${selected}`, selected);
    if (newName && newName !== selected) {
      await request("PATCH", { kind, oldName: selected, newName });
      setSelected(newName);
    }
  };
  const remove = async () => {
    if (!selected || selected === "Uncategorized") return;
    if (
      window.confirm(
        `Remove ${selected}? Assigned products will move to Uncategorized.`,
      )
    )
      await request(
        "DELETE",
        undefined,
        `?kind=${kind}&name=${encodeURIComponent(selected)}`,
      );
  };
  const assigned = (product: Product) =>
    (kind === "category" ? product.category : product.productType) === selected;
  return (
    <section className="taxonomy-manager">
      <header>
        <div>
          <span className="eyebrow">Catalog organization</span>
          <h3>{label.toUpperCase()} MANAGEMENT.</h3>
          <p>
            Create, rename, or remove {label.toLowerCase()}s and assign products
            without opening each record.
          </p>
        </div>
        <button className="admin-button primary" onClick={() => void add()}>
          <Plus />
          Add {label.toLowerCase()}
        </button>
      </header>
      {message && <div className="gate-message">{message}</div>}
      <div className="taxonomy-layout">
        <aside>
          {entries.map((entry) => (
            <button
              key={entry}
              className={selected === entry ? "active" : ""}
              onClick={() => setSelected(entry)}
            >
              <span>{entry}</span>
              <b>
                {
                  products.filter(
                    (product) =>
                      (kind === "category"
                        ? product.category
                        : product.productType) === entry,
                  ).length
                }
              </b>
            </button>
          ))}
        </aside>
        <div className="taxonomy-products">
          <header>
            <div>
              <h4>{selected}</h4>
              <span>Select the products that belong here.</span>
            </div>
            <div className="decision-actions">
              <button onClick={() => void rename()} disabled={!selected}>
                <Pencil />
                Rename
              </button>
              <button
                onClick={() => void remove()}
                disabled={!selected || selected === "Uncategorized"}
              >
                <Trash2 />
                Remove
              </button>
            </div>
          </header>
          {products.map((product) => (
            <label key={product.id}>
              <input
                type="checkbox"
                checked={assigned(product)}
                onChange={(event) =>
                  void request("PUT", {
                    kind,
                    name: selected,
                    productId: product.id,
                    assigned: event.target.checked,
                  })
                }
              />
              <span>{product.name}</span>
              <small>
                {kind === "category" ? product.productType : product.category}
              </small>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
