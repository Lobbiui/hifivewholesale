import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const assetRoot = path.join(root, "assets");
const publicRoot = path.join(root, "public", "catalog");

const libraries = [
  { source: "Chewbies", target: "chewbies" },
  { source: "NTRL Creamy", target: "ntrl-creamy" },
  { source: "Realize Hemp Gummies", target: "realize" },
];

await mkdir(publicRoot, { recursive: true });
for (const library of libraries) {
  await cp(path.join(assetRoot, library.source), path.join(publicRoot, library.target), {
    recursive: true,
    force: true,
  });
}

const readManifest = async (folder) => JSON.parse(await readFile(path.join(assetRoot, folder, "manifest.json"), "utf8"));
const chewbies = await readManifest("Chewbies");
const ntrl = await readManifest("NTRL Creamy");
const realize = await readManifest("Realize Hemp Gummies");
const filename = (value) => value.replaceAll("\\", "/").split("/").at(-1);
const webPath = (...segments) => `/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;

const products = [];

for (const [index, product] of chewbies.products.entries()) {
  const imageFiles = product.files.filter((file) => file.type === "image");
  const coaFiles = product.files.filter((file) => file.type === "coa_pdf");
  products.push({
    id: `chewbies-${product.slug}`,
    name: product.name,
    brand: "Chewbies",
    category: "Gummies",
    strength: "15 mg Delta-9 · 150 mg bag",
    flavor: product.name,
    format: "10-count bag",
    description: "A colorful, shelf-ready Chewbies Delta-9 gummy formulated as a mid-dose 15 mg piece in a 150 mg bag.",
    price: null,
    casePrice: null,
    color: "#f4dc34",
    accent: "#ef526f",
    badge: index === 0 ? "New catalog" : undefined,
    images: imageFiles.map((file) => webPath("catalog", "chewbies", "products", product.slug, filename(file.file))),
    coa: coaFiles.map((file) => webPath("catalog", "chewbies", "products", product.slug, filename(file.file))),
    brandLogo: webPath("catalog", "chewbies", "logos", "chewbies_logo.png"),
    sourceUrl: product.url,
  });
}

const normalizedFlavor = (value) => value.toLowerCase().replace("white ", "").replaceAll(" / ", " ");
for (const [index, gallery] of ntrl.gallery_images.entries()) {
  const flavor = gallery.flavor.replace("White Strawnana / ", "");
  const coa = ntrl.coas.find((item) => normalizedFlavor(item.flavor) === normalizedFlavor(flavor));
  products.push({
    id: `ntrl-creamies-${flavor.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "")}`,
    name: `Creamies — ${flavor}`,
    brand: "NTRL",
    category: "Gummies",
    strength: "15 mg Delta-9 · 300 mg jar",
    flavor,
    format: "20-count jar",
    description: "NTRL Creamies pair a smooth, candy-inspired flavor profile with 15 mg of Delta-9 per piece in a retail-ready jar.",
    price: null,
    casePrice: null,
    color: "#f4f0e7",
    accent: "#ff7b38",
    badge: index === 0 ? "Full flavor set" : undefined,
    images: [webPath("catalog", "ntrl-creamy", ...gallery.filename.split("/"))],
    coa: coa ? [webPath("catalog", "ntrl-creamy", ...coa.filename.split("/"))] : [],
    brandLogo: webPath("catalog", "ntrl-creamy", "logos", "ntrl-color-horiz.png"),
    sourceUrl: ntrl.source_page,
  });
}

const realizePalette = {
  FITTY: ["#f6ede6", "#f05068"],
  "BIG TIME": ["#f0e6f5", "#8a4cbe"],
  "Live Resin": ["#e6f0d5", "#5d8f45"],
  "Live Resin (x Apotheca)": ["#eadcf2", "#713aa4"],
};

for (const [index, product] of realize.products.entries()) {
  const [color, accent] = realizePalette[product.line] ?? ["#e7ead8", "#536c36"];
  products.push({
    id: `realize-${product.slug}`,
    name: product.name,
    brand: "Realize Hemp",
    category: "Gummies",
    strength: product.line,
    flavor: product.flavor,
    format: product.strain ? `${product.line} · ${product.strain}` : product.line,
    description: `${product.flavor} gummies from the Realize Hemp ${product.line} collection${product.strain ? `, featuring the ${product.strain} profile` : ""}.`,
    price: null,
    casePrice: null,
    color,
    accent,
    badge: index === 0 ? "Featured brand" : undefined,
    images: product.gallery_images.map((image) => webPath("catalog", "realize", ...image.path.split("/"))),
    coa: product.coa.map((document) => webPath("catalog", "realize", ...document.path.split("/"))),
    brandLogo: webPath("catalog", "realize", "logos", "realize-logo-black.png"),
    sourceUrl: product.url,
  });
}

await writeFile(path.join(root, "src", "lib", "catalog.generated.json"), `${JSON.stringify(products, null, 2)}\n`);
console.log(`Generated ${products.length} products and copied ${libraries.length} asset libraries.`);
