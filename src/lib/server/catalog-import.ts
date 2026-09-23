import { createHash, randomUUID } from "node:crypto";
import catalog from "@/lib/catalog.generated.json";
import type { Product } from "@/lib/data";
import type { Database } from "./database";

const staticProducts = catalog as Product[];
const MAX_FILE_BYTES = 2 * 1024 * 1024;

export type ImportType = "CLOVER_INVENTORY" | "FULL_CATALOG";
export type ParsedImportRow = {
  rowNumber: number;
  sourceName: string;
  quantity: number;
  product: Product;
  sku: string;
  upc: string;
  unitsPerCase: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  matchedMedia: boolean;
};

export type ImportPreview = {
  importType: ImportType;
  filename: string;
  fileSha256: string;
  rowCount: number;
  totalUnits: number;
  zeroQuantityRows: number;
  readyToPublish: number;
  drafts: number;
  warnings: string[];
  rows: ParsedImportRow[];
};

type CsvRecord = Record<string, string>;

export function parseCatalogImport(filename: string, bytes: Uint8Array): ImportPreview {
  if (!filename.toLowerCase().endsWith(".csv")) throw new Error("Choose a .csv file.");
  if (!bytes.length) throw new Error("The CSV file is empty.");
  if (bytes.length > MAX_FILE_BYTES) throw new Error("The CSV file must be smaller than 2 MB.");

  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  const table = parseCsv(text);
  if (table.length < 2) throw new Error("The CSV must include a header row and at least one product row.");
  if (table.length > 2001) throw new Error("A maximum of 2,000 product rows can be imported at once.");

  const rawHeaders = table[0].map((value) => value.trim());
  const headers = rawHeaders.map(normalizeHeader);
  if (new Set(headers).size !== headers.length) throw new Error("The CSV contains duplicate column names.");
  const records = table.slice(1).filter((row) => row.some((value) => value.trim())).map((row) => {
    const record: CsvRecord = {};
    headers.forEach((header, index) => { record[header] = row[index]?.trim() ?? ""; });
    return record;
  });
  if (!records.length) throw new Error("The CSV does not contain any product rows.");

  const inventoryOnly = headers.includes("product") && headers.includes("qty");
  const fullCatalog = headers.includes("product_name") && headers.includes("quantity_on_hand");
  if (!inventoryOnly && !fullCatalog) {
    throw new Error("Use either Clover columns Product, Qty or the Hi-Five catalog template columns.");
  }

  const seenNames = new Set<string>();
  const seenSkus = new Set<string>();
  const rows = records.map((record, index) => {
    const rowNumber = index + 2;
    const row = inventoryOnly ? fromCloverRow(record, rowNumber) : fromFullCatalogRow(record, rowNumber);
    const nameKey = normalizeKey(row.sourceName);
    if (seenNames.has(nameKey)) throw new Error(`Row ${rowNumber}: duplicate product name “${row.sourceName}”.`);
    seenNames.add(nameKey);
    if (row.sku) {
      const skuKey = row.sku.toLowerCase();
      if (seenSkus.has(skuKey)) throw new Error(`Row ${rowNumber}: duplicate SKU “${row.sku}”.`);
      seenSkus.add(skuKey);
    }
    return row;
  });

  const drafts = rows.filter((row) => row.status === "DRAFT").length;
  const warnings: string[] = [];
  if (drafts) warnings.push(`${drafts} product${drafts === 1 ? "" : "s"} will stay in Draft until required catalog details and media are supplied.`);
  if (inventoryOnly) warnings.push("Clover inventory uploads update quantities without deleting descriptions, pricing, images, or products missing from the file.");

  return {
    importType: inventoryOnly ? "CLOVER_INVENTORY" : "FULL_CATALOG",
    filename: filename.slice(0, 240),
    fileSha256: createHash("sha256").update(bytes).digest("hex"),
    rowCount: rows.length,
    totalUnits: rows.reduce((sum, row) => sum + row.quantity, 0),
    zeroQuantityRows: rows.filter((row) => row.quantity === 0).length,
    readyToPublish: rows.filter((row) => row.status === "PUBLISHED").length,
    drafts,
    warnings,
    rows,
  };
}

export async function commitCatalogImport(database: Database, preview: ImportPreview, actorUserId: string) {
  return database.transaction(async (transaction) => {
    await ensureWarehouse(transaction);
    let createdProducts = 0;
    let updatedProducts = 0;

    for (const row of preview.rows) {
      const sourceKey = normalizeKey(row.sourceName);
      const mapped = await transaction.query<{ product_variant_id: string; product_id: string }>(
        `SELECT m.product_variant_id, v.product_id
           FROM catalog_source_mappings m
           JOIN product_variants v ON v.id = m.product_variant_id
          WHERE m.source_key = $1
          ORDER BY CASE WHEN m.source = 'CLOVER_CSV' THEN 0 ELSE 1 END
          LIMIT 1`,
        [sourceKey],
      );
      const skuMatch = !mapped.rows[0] && row.sku
        ? await transaction.query<{ id: string; product_id: string }>("SELECT id, product_id FROM product_variants WHERE LOWER(sku) = LOWER($1) LIMIT 1", [row.sku])
        : { rows: [] as { id: string; product_id: string }[], rowCount: 0 };
      const existing = mapped.rows[0] ?? (skuMatch.rows[0] ? { product_variant_id: skuMatch.rows[0].id, product_id: skuMatch.rows[0].product_id } : null);
      const productId = existing?.product_id ?? row.product.id;
      const variantId = existing?.product_variant_id ?? `variant_${stableId(row.sourceName)}`;
      const status = row.status;

      if (existing) {
        updatedProducts += 1;
        await transaction.query(
          `UPDATE products SET name = $2, brand = $3, category = $4,
             description = CASE WHEN $5 = '' THEN description ELSE $5 END,
             status = CASE WHEN $6 = 'DRAFT' AND status = 'PUBLISHED' THEN status ELSE $6 END,
             published_at = CASE WHEN $6 = 'PUBLISHED' THEN COALESCE(published_at, CURRENT_TIMESTAMP) ELSE published_at END,
             updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [productId, row.product.name, row.product.brand, row.product.category, row.product.description, status],
        );
      } else {
        createdProducts += 1;
        await transaction.query(
          `INSERT INTO products (id, name, brand, category, description, status, published_at)
           VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6 = 'PUBLISHED' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
          [productId, row.product.name, row.product.brand, row.product.category, row.product.description, status],
        );
        await transaction.query(
          `INSERT INTO product_variants (id, product_id, sku, upc, variant_name, units_per_case, wholesale_price_cents, online_sellable)
           VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, $6, $7, $8)`,
          [variantId, productId, row.sku, row.upc, row.product.format || "Standard", row.unitsPerCase, moneyToCents(row.product.casePrice), status === "PUBLISHED"],
        );
      }

      if (existing) {
        await transaction.query(
          `UPDATE product_variants SET
             sku = CASE WHEN $2 = '' THEN sku ELSE $2 END,
             upc = CASE WHEN $3 = '' THEN upc ELSE $3 END,
             variant_name = CASE WHEN $4 = '' THEN variant_name ELSE $4 END,
             units_per_case = COALESCE($5, units_per_case),
             wholesale_price_cents = COALESCE($6, wholesale_price_cents),
             online_sellable = CASE WHEN $7 = 'ARCHIVED' THEN FALSE WHEN $7 = 'PUBLISHED' THEN TRUE ELSE online_sellable END,
             updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [variantId, row.sku, row.upc, row.product.format, row.unitsPerCase || null, moneyToCents(row.product.casePrice), status],
        );
      }

      await transaction.query(
        `INSERT INTO product_catalog_details (
           product_id, strength, flavor, format, color, accent, badge, image_urls, coa_urls, brand_logo_url, source_url
         ) VALUES ($1,$2,$3,$4,COALESCE(NULLIF($5,''),'#39244d'),COALESCE(NULLIF($6,''),'#b67cff'),$7,$8,$9,$10,$11)
         ON CONFLICT (product_id) DO UPDATE SET
           strength = CASE WHEN EXCLUDED.strength = '' THEN product_catalog_details.strength ELSE EXCLUDED.strength END,
           flavor = CASE WHEN EXCLUDED.flavor = '' THEN product_catalog_details.flavor ELSE EXCLUDED.flavor END,
           format = CASE WHEN EXCLUDED.format = '' THEN product_catalog_details.format ELSE EXCLUDED.format END,
           color = CASE WHEN EXCLUDED.color = '' THEN product_catalog_details.color ELSE EXCLUDED.color END,
           accent = CASE WHEN EXCLUDED.accent = '' THEN product_catalog_details.accent ELSE EXCLUDED.accent END,
           badge = COALESCE(EXCLUDED.badge, product_catalog_details.badge),
           image_urls = CASE WHEN jsonb_array_length(EXCLUDED.image_urls) = 0 THEN product_catalog_details.image_urls ELSE EXCLUDED.image_urls END,
           coa_urls = CASE WHEN jsonb_array_length(EXCLUDED.coa_urls) = 0 THEN product_catalog_details.coa_urls ELSE EXCLUDED.coa_urls END,
           brand_logo_url = CASE WHEN EXCLUDED.brand_logo_url = '' THEN product_catalog_details.brand_logo_url ELSE EXCLUDED.brand_logo_url END,
           source_url = CASE WHEN EXCLUDED.source_url = '' THEN product_catalog_details.source_url ELSE EXCLUDED.source_url END,
           updated_at = CURRENT_TIMESTAMP`,
        [productId, row.product.strength, row.product.flavor, row.product.format, row.product.color, row.product.accent, row.product.badge ?? null, row.product.images, row.product.coa, row.product.brandLogo, row.product.sourceUrl],
      );

      await transaction.query(
        `INSERT INTO catalog_source_mappings (id, source, source_key, source_name, product_variant_id)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (source, source_key) DO UPDATE SET source_name = EXCLUDED.source_name, product_variant_id = EXCLUDED.product_variant_id, updated_at = CURRENT_TIMESTAMP`,
        [randomUUID(), preview.importType === "CLOVER_INVENTORY" ? "CLOVER_CSV" : "HIFIVE_CATALOG_CSV", sourceKey, row.sourceName, variantId],
      );
      await transaction.query(
        `INSERT INTO inventory_snapshots (id, location_id, product_variant_id, on_hand_units, source, observed_at)
         VALUES ($1, 'loc_hifive_warehouse', $2, $3, 'MANUAL', CURRENT_TIMESTAMP)`,
        [randomUUID(), variantId, row.quantity],
      );
    }

    const importId = `import_${randomUUID()}`;
    await transaction.query(
      `INSERT INTO catalog_imports (
         id, filename, file_sha256, import_type, status, uploaded_by, row_count, created_products,
         updated_products, inventory_updated, draft_products, zero_quantity_rows, total_units, warnings_json
       ) VALUES ($1,$2,$3,$4,'COMPLETED',$5,$6,$7,$8,$6,$9,$10,$11,$12)`,
      [importId, preview.filename, preview.fileSha256, preview.importType, actorUserId, preview.rowCount, createdProducts, updatedProducts, preview.drafts, preview.zeroQuantityRows, preview.totalUnits, preview.warnings],
    );
    await transaction.query(
      `INSERT INTO audit_events (id, actor_user_id, organization_id, action, aggregate_type, aggregate_id, after_json)
       VALUES ($1,$2,'org_hifive_internal','CATALOG_CSV_IMPORTED','CATALOG_IMPORT',$3,$4)`,
      [randomUUID(), actorUserId, importId, { filename: preview.filename, rowCount: preview.rowCount, totalUnits: preview.totalUnits }],
    );
    return { importId, createdProducts, updatedProducts, inventoryUpdated: preview.rowCount };
  });
}

function fromCloverRow(record: CsvRecord, rowNumber: number): ParsedImportRow {
  const sourceName = required(record.product, rowNumber, "Product");
  const quantity = parseQuantity(record.qty, rowNumber);
  const parts = sourceName.split("|").map((part) => part.trim());
  if (parts.length < 5) throw new Error(`Row ${rowNumber}: Product must use Clover’s pipe-delimited product name.`);
  const brand = parts[1];
  const category = parts[2];
  const namePart = parts.length >= 6 ? parts[4] : parts[4].replace(/\s*\([^)]*\)\s*$/, "").trim();
  const strength = parts.length >= 6 ? parts[5].replace(/\s*\([^)]*\)\s*$/, "").trim() : parts[3];
  const formatMatch = sourceName.match(/\(([^)]*)\)\s*$/);
  const format = formatMatch?.[1] ?? parts[3];
  const matchName = canonicalFlavor(namePart);
  const match = staticProducts.find((product) => normalizeKey(product.brand) === normalizeKey(brand)
    && (normalizeKey(product.name) === normalizeKey(namePart) || canonicalFlavor(product.flavor) === matchName));
  const product = match ?? {
    id: `${slugify(brand)}-${slugify(namePart)}-${stableId(sourceName).slice(0, 7)}`,
    name: namePart,
    brand,
    category,
    strength,
    flavor: namePart,
    format,
    description: "",
    price: null,
    casePrice: null,
    color: "",
    accent: "",
    images: [],
    coa: [],
    brandLogo: "",
    sourceUrl: "",
  };
  return { rowNumber, sourceName, quantity, product, sku: "", upc: "", unitsPerCase: parsePackSize(format), status: match ? "PUBLISHED" : "DRAFT", matchedMedia: Boolean(match) };
}

function fromFullCatalogRow(record: CsvRecord, rowNumber: number): ParsedImportRow {
  const displayName = required(record.product_name, rowNumber, "Product Name");
  const sourceName = record.inventory_match_name || displayName;
  const quantity = parseQuantity(record.quantity_on_hand, rowNumber);
  const statusValue = (record.status || "DRAFT").toUpperCase();
  if (!(["DRAFT", "PUBLISHED", "ARCHIVED"] as string[]).includes(statusValue)) throw new Error(`Row ${rowNumber}: Status must be Draft, Published, or Archived.`);
  const images = parseUrlList(record.image_url, record.additional_image_urls, rowNumber, "image");
  const coa = parseUrlList(record.coa_url, "", rowNumber, "COA");
  const casePrice = parseMoney(record.wholesale_case_price, rowNumber);
  const unitPrice = parseMoney(record.unit_price, rowNumber);
  const ready = Boolean(record.description && images.length && record.brand && record.category);
  const requestedStatus = statusValue as "DRAFT" | "PUBLISHED" | "ARCHIVED";
  const status = requestedStatus === "PUBLISHED" && !ready ? "DRAFT" : requestedStatus;
  return {
    rowNumber,
    sourceName,
    quantity,
    sku: record.sku || "",
    upc: record.upc || "",
    unitsPerCase: parsePositiveInteger(record.units_per_case || "1", rowNumber, "Units Per Case"),
    status,
    matchedMedia: ready,
    product: {
      id: `${slugify(record.brand || "catalog")}-${slugify(displayName)}-${stableId(`${record.brand}|${sourceName}`).slice(0, 7)}`,
      name: displayName,
      brand: required(record.brand, rowNumber, "Brand"),
      category: required(record.category, rowNumber, "Category"),
      strength: record.strength || "",
      flavor: record.flavor || displayName,
      format: record.format || "Standard",
      description: record.description || "",
      price: unitPrice,
      casePrice,
      color: record.color && validColor(record.color) ? record.color : "#39244d",
      accent: record.accent && validColor(record.accent) ? record.accent : "#b67cff",
      badge: record.badge || undefined,
      images,
      coa,
      brandLogo: safeUrl(record.brand_logo_url, rowNumber, "brand logo") || "",
      sourceUrl: safeUrl(record.source_url, rowNumber, "source") || "",
    },
  };
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const width = rows[0]?.length ?? 0;
  rows.forEach((current, index) => { if (current.length !== width) throw new Error(`Row ${index + 1}: expected ${width} columns but found ${current.length}.`); });
  return rows;
}

function normalizeHeader(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }
function normalizeKey(value: string) { return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function canonicalFlavor(value: string) {
  const normalized = normalizeKey(value);
  if (normalized === "orange cream") return "orange";
  if (normalized === "white straw nana") return "strawnana";
  return normalized;
}
function slugify(value: string) { return normalizeKey(value).replace(/\s+/g, "-").slice(0, 80) || "product"; }
function stableId(value: string) { return createHash("sha256").update(normalizeKey(value)).digest("hex"); }
function required(value: string, row: number, label: string) { if (!value?.trim()) throw new Error(`Row ${row}: ${label} is required.`); return value.trim(); }
function parseQuantity(value: string, row: number) { const number = Number(value); if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 0) throw new Error(`Row ${row}: quantity must be a whole number of zero or more.`); return number; }
function parsePositiveInteger(value: string, row: number, label: string) { const number = Number(value); if (!/^\d+$/.test(value) || number < 1) throw new Error(`Row ${row}: ${label} must be a positive whole number.`); return number; }
function parsePackSize(format: string) { const match = format.match(/(\d+)\s*Pack/i); return match ? Number(match[1]) : 1; }
function parseMoney(value: string, row: number) { if (!value) return null; const normalized = value.replace(/[$,]/g, ""); const number = Number(normalized); if (!Number.isFinite(number) || number < 0 || !/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error(`Row ${row}: prices must be positive dollar amounts with up to two decimals.`); return number; }
function moneyToCents(value: number | null) { return value === null ? null : Math.round(value * 100); }
function validColor(value: string) { return !value || /^#[0-9a-f]{6}$/i.test(value); }
function safeUrl(value: string, row: number, label: string) { if (!value) return ""; if (value.startsWith("/")) return value; try { const url = new URL(value); if (url.protocol !== "https:") throw new Error(); return value; } catch { throw new Error(`Row ${row}: ${label} URL must be an https:// URL or a site path beginning with /.`); } }
function parseUrlList(primary: string, extra: string, row: number, label: string) { return [primary, ...extra.split("|")].map((value) => value.trim()).filter(Boolean).map((value) => safeUrl(value, row, label)); }

async function ensureWarehouse(database: Database) {
  await database.query(
    `INSERT INTO organizations (id, legal_name, display_name, organization_type, status)
     VALUES ('org_hifive_internal','Hi-Five Supply','Hi-Five Supply','INTERNAL','APPROVED') ON CONFLICT (id) DO NOTHING`,
  );
  await database.query(
    `INSERT INTO locations (id, organization_id, name, location_type, fulfillment_enabled)
     VALUES ('loc_hifive_warehouse','org_hifive_internal','Hi-Five Wholesale Warehouse','WAREHOUSE',TRUE) ON CONFLICT (id) DO NOTHING`,
  );
}
