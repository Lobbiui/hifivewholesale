# Hi-Five catalog and inventory CSV workflow

## Purpose

This bridge keeps the wholesale website operational while the Clover and Seven Spaces production integration is pending. Clover remains the inventory source. The website stores catalog content and a history of every import.

## Weekly inventory update

1. Export the on-hand inventory CSV from Clover.
2. Sign in to either administrator dashboard.
3. Open **Products** and drop the CSV into the import area.
4. Review the row count, total units, zero-quantity items, and draft count.
5. Select **Import rows** only after the preview matches the Clover export.

The Clover format is accepted without modification:

```csv
Product,Qty
H5WS | Brand | Category | Strength | Product (Pack),12
```

An inventory import updates on-hand quantities. It does not delete products that are absent from the file, and it does not erase descriptions, pricing, images, COAs, or publishing settings.

## Catalog enrichment

Download **Catalog template** from the Products page. Use it to supply approved product content, including:

- the exact Clover Product value in **Inventory Match Name**;
- the customer-facing product name;
- SKU and UPC;
- brand, category, description, strength, flavor, and format;
- units per case and wholesale case price;
- on-hand quantity;
- product image, COA, logo, and source links;
- colors, badge, and publishing status.

Use `Draft` while a record is incomplete. A requested `Published` row is automatically kept in Draft if it lacks a description, brand, category, or image. Use `Archived` to remove an existing product from sale.

## Safety behavior

- Both admin roles may preview and import files.
- Every file is parsed and validated on the server before any database change.
- The commit runs in one transaction: either all rows save or none do.
- Duplicate names and duplicate SKUs in one file are rejected.
- Quantities must be nonnegative whole numbers.
- Prices accept no more than two decimal places.
- Import history and an audit event are stored for traceability.
- Published products feed the homepage, shop, product pages, carts, and order requests.

## Future Clover and Seven Spaces transition

The source mapping preserves the exact Clover product name for each website variant. When the direct production connection is available, the scheduled synchronization can update the same inventory records without replacing the storefront catalog or changing product URLs.
