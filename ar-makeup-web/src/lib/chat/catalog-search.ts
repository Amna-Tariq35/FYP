import { getCatalogSupabase } from "@/src/lib/catalog/catalog-client";
import { CHAT_NO_MATCH_SENTENCE } from "@/src/lib/chat/public-error";
import {
  CATEGORY_GROUPS,
  normalizeCategory,
  type ProductCategory,
} from "@/src/lib/catalog/category-taxonomy";
import { sanitizeSearch } from "@/src/lib/catalog/listing-constraints";
import { asStringList } from "@/src/lib/skin-analysis/product-shape";

const VALID_CATEGORIES: readonly ProductCategory[] = [
  ...CATEGORY_GROUPS.makeup,
  ...CATEGORY_GROUPS.skincare,
];

export const CHAT_CATEGORY_LIST = VALID_CATEGORIES.join(", ");

const RESULT_LIMIT = 5;
const SCAN_LIMIT = 40;

const PRODUCT_SELECT =
  "id, product_key, name, brand, category, price, image_url, finish, skin_type, item_form, tags, product_shades(id, shade_key, shade_name, color_family, skin_tone, undertone, shade_hex)";

const SYNONYMS: Record<string, ProductCategory> = {
  lip: "lipstick",
  lips: "lipstick",
  lipstick: "lipstick",
  "lip color": "lipstick",
  "lip colour": "lipstick",
  "lip stick": "lipstick",
  lipgloss: "lip_gloss",
  "lip gloss": "lip_gloss",
  moisturiser: "moisturizer",
  moisturizer: "moisturizer",
  moisturize: "moisturizer",
  moisturise: "moisturizer",
  "face cream": "moisturizer",
  "face moisturiser": "moisturizer",
  "face moisturizer": "moisturizer",
  lotion: "moisturizer",
  spf: "sunscreen",
  sunscreen: "sunscreen",
  "sun screen": "sunscreen",
  sunblock: "sunscreen",
  "sun block": "sunscreen",
  "sun protection": "sunscreen",
  foundation: "foundation",
  blush: "blush",
  blusher: "blush",
  mascara: "mascara",
  eyeliner: "eyeliner",
  "eye liner": "eyeliner",
  eyeshadow: "eyeshadow",
  "eye shadow": "eyeshadow",
  highlighter: "highlighter",
  highlight: "highlighter",
  cleanser: "cleanser",
  "face wash": "cleanser",
  "facial cleanser": "cleanser",
  "eye cream": "eye_cream",
  eyecream: "eye_cream",
  "lash care": "lash_care",
  lashes: "eyelashes",
  eyelash: "eyelashes",
  eyelashes: "eyelashes",
  treatment: "treatment",
  serum: "treatment",
};

const SYNONYM_PHRASES = Object.keys(SYNONYMS).sort((a, b) => b.length - a.length);

export type ChatSearchShade = {
  id?: string;
  shade_key?: string;
  shade_name?: string;
  color_family?: string;
  skin_tone?: string;
  undertone?: string;
  shade_hex?: string;
};

export type ChatSearchProduct = {
  id: string;
  product_key: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  image_url?: string;
  finish?: string;
  skin_type?: string;
  product_shades?: ChatSearchShade[];
};

export type ChatSearchInput = {
  category?: string;
  skinType?: string;
  itemForm?: string;
  tags?: string;
  colorFamily?: string;
  undertone?: string;
  finish?: string;
  brand?: string;
  minPrice?: number | string;
  maxPrice?: number | string;
  text?: string;
};

/** Same label as product cards and the cart: US dollars, no conversion. */
export function formatChatPrice(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export type ChatRelaxation = "skin" | "price" | "brand";

export type ChatSearchResult = {
  ok: boolean;
  products: ChatSearchProduct[];
  relaxed: ChatRelaxation[];
  note: string;
};

type RawRow = {
  id: unknown;
  product_key: string;
  name: string;
  brand: unknown;
  category: unknown;
  price: unknown;
  image_url: unknown;
  finish: unknown;
  skin_type: unknown;
  item_form: unknown;
  tags: unknown;
  product_shades: unknown;
};

type CatalogQuery = {
  eq: (column: string, value: string | number | boolean) => CatalogQuery;
  gt: (column: string, value: number) => CatalogQuery;
  gte: (column: string, value: number) => CatalogQuery;
  lte: (column: string, value: number) => CatalogQuery;
  ilike: (column: string, value: string) => CatalogQuery;
  or: (filters: string) => CatalogQuery;
  order: (column: string, options?: { ascending?: boolean }) => CatalogQuery;
  limit: (count: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

function phraseKey(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function asCategory(value: string): ProductCategory | null {
  return (VALID_CATEGORIES as readonly string[]).includes(value) ? (value as ProductCategory) : null;
}

export function resolveCatalogCategory(raw: string | null | undefined): ProductCategory | null {
  if (!raw || !raw.trim()) return null;
  const normalized = asCategory(normalizeCategory(raw));
  if (normalized) return normalized;
  const phrase = phraseKey(raw);
  const direct = SYNONYMS[phrase] ?? SYNONYMS[normalizeCategory(raw)];
  if (direct) return direct;
  const singular = phrase.endsWith("s") ? phrase.slice(0, -1) : "";
  if (singular && SYNONYMS[singular]) return SYNONYMS[singular];
  return asCategory(normalizeCategory(singular));
}

function containsPhrase(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|\\b)${escaped}(?:\\b|$)`, "i").test(text);
}

export function categoryFromText(text: string): ProductCategory | null {
  const cleaned = text.trim().toLowerCase();
  if (!cleaned) return null;
  for (const phrase of SYNONYM_PHRASES) {
    if (containsPhrase(cleaned, phrase)) return SYNONYMS[phrase];
  }
  const labels = [...VALID_CATEGORIES].sort((a, b) => b.length - a.length);
  for (const category of labels) {
    if (containsPhrase(cleaned, category.replace(/_/g, " "))) return category;
  }
  return null;
}

const PRICE_LIMIT =
  /\b(?:under|below|less than|max(?:imum)?|up to|at most)\s*(?:(?:rs\.?|pkr|usd|dollars?|us\$|\$)\s*)?(\d+(?:\.\d+)?)/i;

export function maxPriceFromText(text: string): number | null {
  const match = text.match(PRICE_LIMIT);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

const REFINEMENT_PATTERN =
  /\b(cheaper|cheap|less|more|another|else|similar|other|those|these|same|budget|expensive|afford|priced|price)\b/i;
const GREETING_PATTERN = /^(?:hi|hello|hey|help|thanks|thank you|good morning|good evening)\b/i;

/** A follow-up may omit the category. A new request with no catalog words may not. */
export function allowsModelCategory(userText: string): boolean {
  if (categoryFromText(userText)) return true;
  return REFINEMENT_PATTERN.test(userText);
}

/**
 * Queries that name nothing in the catalog can be answered without a model
 * once search confirms there is no in-stock name or brand match.
 */
export function shouldAnswerWithoutModel(userText: string): boolean {
  const text = userText.trim();
  if (!text || GREETING_PATTERN.test(text)) return false;
  if (categoryFromText(text) || skinTypeFromText(text) || finishFromText(text) || maxPriceFromText(text)) {
    return false;
  }
  return !REFINEMENT_PATTERN.test(text);
}

function skinTypeFromText(text: string): string | null {
  const match = text.match(/\b(oily|dry|combination|normal|sensitive)\b/i);
  return match ? match[1].toLowerCase() : null;
}

function finishFromText(text: string): string | null {
  const match = text.match(/\b(matte|dewy|satin|shimmer|glossy)\b/i);
  return match ? match[1].toLowerCase() : null;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function finitePrice(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`);
}

function isAllSkin(value: unknown): boolean {
  return asStringList(value).some((item) => {
    const label = item.toLowerCase();
    return label === "all" || label === "any" || label === "all skin types";
  });
}

function matchesSkin(value: unknown, skinType: string): boolean {
  const list = asStringList(value);
  if (list.length === 0 || isAllSkin(value)) return true;
  const want = skinType.trim().toLowerCase();
  return list.some((item) => {
    const label = item.toLowerCase();
    return label === want || label.includes(want);
  });
}

function textIncludes(value: unknown, needle: string): boolean {
  const want = needle.trim().toLowerCase();
  if (!want) return true;
  if (typeof value === "string") return value.toLowerCase().includes(want);
  return asStringList(value).some((item) => item.toLowerCase().includes(want));
}

function asRows(data: unknown): RawRow[] {
  if (!Array.isArray(data)) return [];
  return data.filter((row): row is RawRow => {
    if (!row || typeof row !== "object") return false;
    const record = row as Record<string, unknown>;
    return typeof record.product_key === "string" && record.product_key.length > 0 && typeof record.name === "string";
  });
}

function shadesOf(value: unknown): ChatSearchShade[] {
  if (!Array.isArray(value)) return [];
  const shades: ChatSearchShade[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const shade = item as Record<string, unknown>;
    const id = typeof shade.id === "string" ? shade.id : undefined;
    const shadeKey = typeof shade.shade_key === "string" ? shade.shade_key : undefined;
    const shadeName = typeof shade.shade_name === "string" ? shade.shade_name : undefined;
    shades.push({
      ...(id ? { id } : {}),
      ...(shadeKey ? { shade_key: shadeKey } : {}),
      ...(shadeName ? { shade_name: shadeName } : {}),
      ...(typeof shade.color_family === "string" ? { color_family: shade.color_family } : {}),
      ...(typeof shade.skin_tone === "string" ? { skin_tone: shade.skin_tone } : {}),
      ...(typeof shade.undertone === "string" ? { undertone: shade.undertone } : {}),
      ...(typeof shade.shade_hex === "string" ? { shade_hex: shade.shade_hex } : {}),
    });
  }
  return shades;
}

function skinLabel(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  const list = asStringList(value);
  return list.length > 0 ? list.join(", ") : undefined;
}

function toProduct(row: RawRow): ChatSearchProduct | null {
  const price = typeof row.price === "number" ? row.price : Number(row.price);
  if (!Number.isFinite(price)) return null;
  const shades = shadesOf(row.product_shades);
  const skinType = skinLabel(row.skin_type);
  return {
    id: typeof row.id === "string" && row.id ? row.id : row.product_key,
    product_key: row.product_key,
    name: row.name,
    brand: typeof row.brand === "string" ? row.brand : "",
    category: typeof row.category === "string" ? row.category : "",
    price,
    ...(typeof row.image_url === "string" && row.image_url ? { image_url: row.image_url } : {}),
    ...(typeof row.finish === "string" && row.finish ? { finish: row.finish } : {}),
    ...(skinType ? { skin_type: skinType } : {}),
    ...(shades.length > 0 ? { product_shades: shades } : {}),
  };
}

function prefer<T>(rows: T[], predicate: (row: T) => boolean): T[] {
  const matched = rows.filter(predicate);
  return matched.length > 0 ? matched : rows;
}

function shadeMatches(row: RawRow, color: string | null, undertone: string | null): boolean {
  if (!color && !undertone) return true;
  const shades = Array.isArray(row.product_shades) ? row.product_shades : [];
  return shades.some((item) => {
    if (!item || typeof item !== "object") return false;
    const shade = item as Record<string, unknown>;
    const colorOk = !color || textIncludes(shade.color_family, color);
    const toneOk = !undertone || textIncludes(shade.undertone, undertone);
    return colorOk && toneOk;
  });
}

function emptySearch(ok: boolean): ChatSearchResult {
  return { ok, products: [], relaxed: [], note: "" };
}

function priceClause(minPrice: number | null, maxPrice: number | null): string | null {
  if (maxPrice != null && minPrice != null) {
    return `Nothing between ${formatChatPrice(minPrice)} and ${formatChatPrice(maxPrice)}`;
  }
  if (maxPrice != null) return `Nothing under ${formatChatPrice(maxPrice)}`;
  if (minPrice != null) return `Nothing from ${formatChatPrice(minPrice)} up`;
  return null;
}

export function relaxationNote(
  relaxed: readonly ChatRelaxation[],
  limits: { minPrice: number | null; maxPrice: number | null },
): string {
  if (relaxed.length === 0) return "";
  if (relaxed.length === 1 && relaxed[0] === "skin") {
    return "No exact skin-type match, these are popular alternatives.";
  }
  if (relaxed.length === 1 && relaxed[0] === "brand") {
    return "No exact brand match, these are other options.";
  }
  if (relaxed.length === 1 && relaxed[0] === "price") {
    const clause = priceClause(limits.minPrice, limits.maxPrice);
    return clause ? `${clause}, these are the closest.` : "Nothing in that price range, these are the closest.";
  }
  const bits: string[] = [];
  if (relaxed.includes("skin")) bits.push("no exact skin-type match");
  if (relaxed.includes("price")) {
    bits.push((priceClause(limits.minPrice, limits.maxPrice) ?? "Nothing in that price range").toLowerCase());
  }
  if (relaxed.includes("brand")) bits.push("no exact brand match");
  const sentence = bits.join(", and ");
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}. These are the closest options.`;
}

function useStoreCurrency(text: string): string {
  const labeled = text.replace(
    /(?:\brs\.?\b|\bpkr\b|₹|₨)\s*(\d+(?:\.\d+)?)/gi,
    (_, amount: string) => {
      const value = Number(amount);
      return Number.isFinite(value) ? formatChatPrice(value) : amount;
    },
  );
  return labeled
    .replace(/\b(?:pkr|rupees?|rs\.?)\b/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.])/g, "$1");
}

function priceAmountPattern(note: string): RegExp | null {
  const match = note.match(/\$(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  const whole = match[1];
  const cents = match[2];
  if (cents && /^0+$/.test(cents)) return new RegExp(`(?:\\$\\s*)?${whole}(?:\\.0+)?\\b`, "i");
  return new RegExp(`(?:\\$\\s*)?${whole}\\.${cents}\\b`, "i");
}

function admitsRelaxation(text: string, note: string, relaxed: readonly ChatRelaxation[]): boolean {
  const body = text.toLowerCase();
  if (body.includes(note.toLowerCase())) return true;
  if (relaxed.includes("price")) {
    const amounts = priceAmountPattern(note);
    const hasAmount = amounts ? amounts.test(text) : /price range|these are the closest/.test(body);
    const honest = /nothing|no exact|not under|aren'?t|isn'?t|closest|none\b|above|higher/.test(body);
    if (!hasAmount || !honest) return false;
  }
  if (relaxed.includes("skin")) {
    if (!/skin/.test(body) || !/no exact|alternative|closest|not an exact|couldn'?t/.test(body)) return false;
  }
  if (relaxed.includes("brand")) {
    if (!/brand/.test(body) || !/no exact|other|closest|alternative/.test(body)) return false;
  }
  return true;
}

function assertsDroppedConstraint(text: string, note: string, relaxed: readonly ChatRelaxation[]): boolean {
  const body = text.toLowerCase();
  if (relaxed.includes("price")) {
    const amounts = priceAmountPattern(note);
    const hasAmount = amounts ? amounts.test(text) : false;
    const claims = /\bunder\b|\bwithin\b|\bbudget\b|\bless than\b|\bat most\b/.test(body);
    const honest = /nothing|no exact|not under|aren'?t|isn'?t|closest|none\b/.test(body);
    if ((claims && hasAmount && !honest) || /\b(?:rs\.?|pkr|rupees?)\b/i.test(text)) return true;
  }
  if (relaxed.includes("skin") && /\bfor\s+(?:oily|dry|combination|normal|sensitive)\s+skin\b/.test(body)) {
    if (!/no exact|alternative|closest|not an exact/.test(body)) return true;
  }
  if (relaxed.includes("brand") && /\bfrom\s+[a-z0-9]/i.test(text) && !/no exact|other options|closest/.test(body)) {
    return true;
  }
  return false;
}

/** Keep a model's wording when it already tells the truth. Otherwise append or prefer the note. */
export function composeShopperText(input: {
  text: string;
  note?: string;
  relaxed?: readonly ChatRelaxation[];
  noMatch?: boolean;
}): string {
  const text = useStoreCurrency(input.text).trim();
  if (input.noMatch) {
    const sentence = CHAT_NO_MATCH_SENTENCE;
    if (text.toLowerCase().includes(sentence.toLowerCase())) return text;
    return sentence;
  }
  const note = useStoreCurrency(input.note ?? "").trim();
  const relaxed = input.relaxed ?? [];
  if (!note || relaxed.length === 0) return text;
  if (admitsRelaxation(text, note, relaxed)) return text;
  if (!text || assertsDroppedConstraint(text, note, relaxed)) return note;
  const joiner = /[.!?]$/.test(text) ? " " : ". ";
  return `${text}${joiner}${note}`;
}

function rowPrice(row: RawRow): number {
  const price = typeof row.price === "number" ? row.price : Number(row.price);
  return Number.isFinite(price) ? price : Number.POSITIVE_INFINITY;
}

function priceDistance(price: number, minPrice: number | null, maxPrice: number | null): number {
  if (maxPrice != null && price > maxPrice) return price - maxPrice;
  if (minPrice != null && price < minPrice) return minPrice - price;
  return 0;
}

function rankScore(row: RawRow, skin: string | null, finish: string | null): number {
  let score = 0;
  if (finish && typeof row.finish === "string" && row.finish.trim().toLowerCase() === finish.trim().toLowerCase()) {
    score += 2;
  }
  if (skin && !isAllSkin(row.skin_type) && matchesSkin(row.skin_type, skin)) score += 2;
  return score;
}

async function loadRows(filters: {
  category: string | null;
  brand: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  text: string | null;
}): Promise<{ ok: true; rows: RawRow[] } | { ok: false }> {
  let query = getCatalogSupabase().from("makeup_products").select(PRODUCT_SELECT) as unknown as CatalogQuery;
  query = query.eq("is_active", true).gt("stock_quantity", 0);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.brand) query = query.ilike("brand", escapeIlike(filters.brand));
  if (filters.minPrice != null) query = query.gte("price", filters.minPrice);
  if (filters.maxPrice != null) query = query.lte("price", filters.maxPrice);
  if (!filters.category && filters.text) {
    const pattern = `"%${filters.text}%"`;
    query = query.or(`name.ilike.${pattern},brand.ilike.${pattern}`);
  }
  const { data, error } = await query.order("product_key", { ascending: true }).limit(SCAN_LIMIT);
    if (error) {
    console.error("[searchProducts] Supabase error:", error.message);
    return { ok: false };
  }
  return { ok: true, rows: asRows(data) };
}

type PriceStage = { minPrice: number | null; maxPrice: number | null; brand: string | null };

export async function searchChatProducts(input: ChatSearchInput): Promise<ChatSearchResult> {
  const hinted = clean(input.category);
  const prose = clean(input.text);
  const category = (prose ? categoryFromText(prose) : null) ?? resolveCatalogCategory(hinted);
  const skin = (prose ? skinTypeFromText(prose) : null) ?? clean(input.skinType);
  const finish = (prose ? finishFromText(prose) : null) ?? clean(input.finish);
  const brand = clean(input.brand);
  const statedMax = prose ? maxPriceFromText(prose) : null;
  const minPrice = finitePrice(input.minPrice);
  const maxPrice = statedMax ?? finitePrice(input.maxPrice);
  const text = category ? null : sanitizeSearch(prose ?? hinted ?? "");

  const stages: PriceStage[] = [];
  const addStage = (priceOn: boolean, brandOn: boolean) => {
    const next = {
      minPrice: priceOn ? minPrice : null,
      maxPrice: priceOn ? maxPrice : null,
      brand: brandOn ? brand : null,
    };
    const key = `${next.minPrice ?? ""}|${next.maxPrice ?? ""}|${(next.brand ?? "").toLowerCase()}`;
    if (stages.some((stage) => `${stage.minPrice ?? ""}|${stage.maxPrice ?? ""}|${(stage.brand ?? "").toLowerCase()}` === key)) {
      return;
    }
    stages.push(next);
  };
  addStage(true, true);
  addStage(false, true);
  addStage(false, false);

  for (const stage of stages) {
    const loaded = await loadRows({
      category,
      brand: stage.brand,
      minPrice: stage.minPrice,
      maxPrice: stage.maxPrice,
      text,
    });
    if (!loaded.ok) return emptySearch(false);
    if (loaded.rows.length === 0) continue;

    const withSkin = skin ? loaded.rows.filter((row) => matchesSkin(row.skin_type, skin)) : loaded.rows;
    const skinRelaxed = Boolean(skin) && withSkin.length === 0;
    let chosen = skinRelaxed ? loaded.rows : withSkin;
    chosen = prefer(chosen, (row) => shadeMatches(row, clean(input.colorFamily), clean(input.undertone)));
    if (clean(input.tags)) chosen = prefer(chosen, (row) => textIncludes(row.tags, input.tags ?? ""));
    if (clean(input.itemForm)) chosen = prefer(chosen, (row) => textIncludes(row.item_form, input.itemForm ?? ""));
    if (finish) chosen = prefer(chosen, (row) => textIncludes(row.finish, finish));

    const priceRelaxed = (minPrice != null || maxPrice != null) && stage.minPrice == null && stage.maxPrice == null;
    const brandRelaxed = Boolean(brand) && stage.brand == null;
    const relaxed: ChatRelaxation[] = [];
    if (skinRelaxed) relaxed.push("skin");
    if (priceRelaxed) relaxed.push("price");
    if (brandRelaxed) relaxed.push("brand");

    const products = [...chosen]
      .sort((a, b) => {
        if (priceRelaxed) {
          const distance = priceDistance(rowPrice(a), minPrice, maxPrice) - priceDistance(rowPrice(b), minPrice, maxPrice);
          if (distance !== 0) return distance;
        }
        return rankScore(b, skin, finish) - rankScore(a, skin, finish) || a.product_key.localeCompare(b.product_key);
      })
      .map(toProduct)
      .filter((product): product is ChatSearchProduct => product !== null)
      .slice(0, RESULT_LIMIT);
    if (products.length > 0) {
      return {
        ok: true,
        products,
        relaxed,
        note: relaxationNote(relaxed, { minPrice: null, maxPrice: statedMax }),
      };
    }
  }

  return emptySearch(true);
}
