import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseCatalogImport } from "../src/lib/server/catalog-import";

async function main() {
  const source = process.argv[2];
  if (!source) throw new Error("Pass the path to a CSV file.");
  const bytes = await readFile(source);
  const preview = parseCatalogImport(path.basename(source), bytes);
  console.log(JSON.stringify({
    importType: preview.importType,
    rowCount: preview.rowCount,
    totalUnits: preview.totalUnits,
    zeroQuantityRows: preview.zeroQuantityRows,
    readyToPublish: preview.readyToPublish,
    drafts: preview.drafts,
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
