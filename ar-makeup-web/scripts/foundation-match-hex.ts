/**
 * Prints UPDATE statements for product_shades.match_hex only.
 *
 * Never touches shade_hex or shade_key.
 *
 *     npx ts-node --project scripts/tsconfig.json scripts/foundation-match-hex.ts
 *
 * The Pudding MIT makeup-shades table (https://github.com/the-pudding/data,
 * makeup-shades) is fetched when the network allows. A row is emitted only when
 * brand, product, and shade name clearly match a catalog row.
 *
 * This catalog's fnd_* shades are shared generic chips (Porcelain, Sand, Honey…)
 * copied across brands. Those names are not the brands' real shade names, so a
 * clear match is not expected. When nothing matches, the script prints no
 * UPDATE and says so. It does not invent hexes.
 */

import fs from "fs";
import path from "path";

const PUDDING_URLS = [
  "https://raw.githubusercontent.com/the-pudding/data/master/makeup-shades/shades.csv",
  "https://raw.githubusercontent.com/the-pudding/data/master/makeup-shades/allShades.csv",
];

const PRODUCT_CSV = path.resolve(__dirname, "../../AR-Makeup-Try-On/lib/makeup_products.csv");
const SHADE_CSV = path.resolve(__dirname, "../../AR-Makeup-Try-On/lib/product_shades (2).csv");

type Product = { key: string; name: string; brand: string };
type Shade = { shadeKey: string; productKey: string; shadeName: string };

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function norm(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function headerIndex(header: string[], names: string[]): number {
  const lowered = header.map((h) => norm(h));
  for (const name of names) {
    const i = lowered.indexOf(norm(name));
    if (i >= 0) return i;
  }
  return -1;
}

async function fetchPudding(): Promise<string | null> {
  for (const url of PUDDING_URLS) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log(`Fetched ${url}`);
        return await res.text();
      }
      console.log(`No dataset at ${url} (${res.status})`);
    } catch (err) {
      console.log(`Could not fetch ${url}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return null;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function main() {
  console.log("match_hex suggestions only. shade_hex is never updated.\n");

  if (!fs.existsSync(PRODUCT_CSV) || !fs.existsSync(SHADE_CSV)) {
    console.log("Catalog CSVs were not found next to the Flutter project.");
    console.log("No UPDATE statements. Do not invent hexes.");
    return;
  }

  const products = parseCsv(fs.readFileSync(PRODUCT_CSV, "utf8"));
  const shades = parseCsv(fs.readFileSync(SHADE_CSV, "utf8"));
  const pHeader = products[0];
  const sHeader = shades[0];
  const pKey = headerIndex(pHeader, ["product_key"]);
  const pName = headerIndex(pHeader, ["name"]);
  const pBrand = headerIndex(pHeader, ["brand"]);
  const sKey = headerIndex(sHeader, ["shade_key"]);
  const sProduct = headerIndex(sHeader, ["product_key"]);
  const sName = headerIndex(sHeader, ["shade_name"]);

  const catalogProducts = new Map<string, Product>();
  for (const row of products.slice(1)) {
    const key = row[pKey] ?? "";
    if (!key.startsWith("fnd_")) continue;
    catalogProducts.set(key, { key, name: row[pName] ?? "", brand: row[pBrand] ?? "" });
  }
  const catalogShades: Shade[] = [];
  for (const row of shades.slice(1)) {
    const productKey = row[sProduct] ?? "";
    if (!productKey.startsWith("fnd_")) continue;
    catalogShades.push({
      shadeKey: row[sKey] ?? "",
      productKey,
      shadeName: row[sName] ?? "",
    });
  }

  console.log(
    `${catalogProducts.size} foundation products, ${catalogShades.length} shade rows.`
  );
  console.log(
    "Catalog shade names are generic chips shared across brands (Porcelain, Sand, Honey…)."
  );
  console.log("A match requires the same brand, a clearly same product, and the same shade name.\n");

  const csv = await fetchPudding();
  if (!csv) {
    console.log("The Pudding dataset could not be downloaded.");
    console.log("No UPDATE statements were printed. Do not invent hexes.");
    return;
  }

  const table = parseCsv(csv);
  const header = table[0] ?? [];
  const brandI = headerIndex(header, ["brand"]);
  const productI = headerIndex(header, ["product", "product_name"]);
  const shadeI = headerIndex(header, ["shade", "shade_name", "name"]);
  const hexI = headerIndex(header, ["hex", "shade_hex", "color", "colour"]);
  if (brandI < 0 || productI < 0 || hexI < 0) {
    console.log(`Dataset columns (${header.join(", ")}) do not include brand, product, and hex.`);
    console.log("No UPDATE statements. Do not invent hexes.");
    return;
  }
  if (shadeI < 0) {
    console.log(`Dataset columns: ${header.join(", ")}`);
    console.log(
      "There is no shade-name column. Each product has many hexes and this catalog's shade names are generic chips (Sand, Honey, Porcelain), not those products' real shade names."
    );
    console.log(
      "Brand + product alone cannot say which chip gets which hex. No UPDATE statements. Do not invent hexes, and do not edit shade_hex."
    );
    return;
  }

  const updates: string[] = [];
  for (const row of table.slice(1)) {
    const brand = norm(row[brandI] ?? "");
    const product = norm(row[productI] ?? "");
    const shadeName = norm(row[shadeI] ?? "");
    let hex = (row[hexI] ?? "").trim();
    if (!brand || !product || !shadeName || !hex) continue;
    if (!hex.startsWith("#")) hex = `#${hex}`;
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) continue;

    for (const shade of catalogShades) {
      const owner = catalogProducts.get(shade.productKey);
      if (!owner) continue;
      const sameBrand = norm(owner.brand) === brand;
      const sameProduct =
        norm(owner.name) === product ||
        norm(owner.name).includes(product) && product.length > 12 ||
        product.includes(norm(owner.name)) && norm(owner.name).length > 12;
      const sameShade = norm(shade.shadeName) === shadeName;
      if (sameBrand && sameProduct && sameShade) {
        updates.push(
          `update public.product_shades set match_hex = ${sqlString(hex.toUpperCase())}, hex_source = 'pudding-mit' ` +
            `where shade_key = ${sqlString(shade.shadeKey)} and product_key = ${sqlString(shade.productKey)} ` +
            `and match_hex is null;`
        );
      }
    }
  }

  if (updates.length === 0) {
    console.log("No catalog row matched a Pudding brand + product + shade name.");
    console.log(
      "The fnd_* shade names in this project are generic chips, not the brands' real shade names."
    );
    console.log("No UPDATE statements. Do not invent hexes, and do not edit shade_hex.");
    return;
  }

  console.log(`-- ${updates.length} match_hex update(s). shade_hex is untouched.\n`);
  for (const line of updates) console.log(line);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
