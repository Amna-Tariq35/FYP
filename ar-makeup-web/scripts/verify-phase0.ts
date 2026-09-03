/**
 * Phase 0 verification.
 *
 * Checks the things Phase 0 depends on that cannot be verified by reading code:
 * whether RLS actually lets a logged-out visitor read what they need to, and
 * actually stops them writing what they must not.
 *
 *     npm run verify:phase0
 *
 * It connects with the **anon key only** — deliberately. Running these checks
 * with the service-role key would pass unconditionally, because service-role
 * bypasses RLS. The whole point is to see what a stranger sees.
 *
 * Read-only apart from four inserts that are *expected to be rejected*, one per
 * Phase 0 table. Any that succeeds is reported as a failure and deleted again.
 */

import path from "path";
import dotenv from "dotenv";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// ── Reporting ────────────────────────────────────────────────────────────────

type Status = "pass" | "fail" | "warn" | "skip";

const results: { status: Status; title: string; detail: string }[] = [];

const ICON: Record<Status, string> = {
  pass: "\x1b[32m✔\x1b[0m",
  fail: "\x1b[31m✘\x1b[0m",
  warn: "\x1b[33m!\x1b[0m",
  skip: "\x1b[90m–\x1b[0m",
};

function record(status: Status, title: string, detail: string) {
  results.push({ status, title, detail });
  console.log(`${ICON[status]} ${title}`);
  if (detail) console.log(`  \x1b[90m${detail}\x1b[0m`);
}

function section(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

// ── Environment ──────────────────────────────────────────────────────────────

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Reads the `role` claim out of a Supabase JWT without verifying it. */
function jwtRole(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(
      payload.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf8");
    return (JSON.parse(json) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

function checkEnv(): boolean {
  section("Environment");

  if (!url || !anonKey) {
    record(
      "fail",
      "Supabase credentials present",
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set " +
        "in .env.local. Nothing else can be checked without them."
    );
    return false;
  }
  record("pass", "Supabase credentials present", url);

  const role = jwtRole(anonKey);
  if (role === "service_role") {
    record(
      "fail",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY holds an anon key",
      "It holds a SERVICE ROLE key. That key bypasses RLS and is shipped to " +
        "every browser under NEXT_PUBLIC_. Rotate it immediately and put the " +
        "anon key here instead."
    );
    return false;
  }
  if (role === "anon") {
    record("pass", "NEXT_PUBLIC_SUPABASE_ANON_KEY holds an anon key", "role: anon");
  } else {
    record(
      "warn",
      "Could not read the key's role claim",
      `Expected role "anon", got ${role ?? "nothing"}. Newer publishable keys ` +
        "are not JWTs, so this is only a problem if you pasted a secret key."
    );
  }

  return true;
}

// ── Public reads (must succeed while logged out) ──────────────────────────────

type ReadResult = {
  data: unknown[] | null;
  error: { code?: string; message: string } | null;
  count: number | null;
};

/**
 * Retries a read a couple of times before believing it failed.
 *
 * A dropped connection and a missing SELECT policy both arrive here as "error",
 * and the advice for each is opposite — one says wait, the other says change
 * your database. Only errors that carry a Postgres/PostgREST code are treated as
 * real answers; a bare transport failure is retried.
 */
async function readWithRetry(
  run: () => Promise<ReadResult>,
  attempts = 3
): Promise<ReadResult> {
  let last = await run();
  for (let i = 1; i < attempts && last.error && !last.error.code; i++) {
    await new Promise((r) => setTimeout(r, 400 * i));
    last = await run();
  }
  return last;
}

async function checkPublicRead(
  anon: SupabaseClient,
  table: string,
  columns: string,
  why: string
): Promise<number | null> {
  const { data, error, count } = await readWithRetry(async () => {
    const res = await anon
      .from(table)
      .select(columns, { count: "exact" })
      .limit(1);
    return {
      data: (res.data ?? null) as unknown[] | null,
      error: res.error as { code?: string; message: string } | null,
      count: res.count ?? null,
    };
  });

  if (error) {
    // No code means it never reached Postgres — say so, rather than blaming RLS
    // and sending the reader off to run a migration they may not need.
    if (!error.code) {
      record(
        "warn",
        `anon can read ${table}`,
        `Could not reach Supabase after 3 attempts: ${error.message} — this is a ` +
          `network or project-availability problem, not an RLS result. Re-run ` +
          `before concluding anything.`
      );
      return null;
    }
    record(
      "fail",
      `anon can read ${table}`,
      `${error.message} (${error.code}) — ${why} Apply db/001_phase0_rls.sql.`
    );
    return null;
  }

  if (!data || data.length === 0) {
    record(
      "warn",
      `anon can read ${table}`,
      `The query succeeded but returned no rows. Either the table is empty, or ` +
        `RLS is enabled with no SELECT policy — those look identical from here. ` +
        `${why}`
    );
    return count ?? 0;
  }

  record("pass", `anon can read ${table}`, `${count ?? data.length} row(s) visible`);
  return count ?? data.length;
}

// ── Share-link path (the reason saved_looks needs a public read) ──────────────

/**
 * Returns identifiers discovered while reading, or nulls if nothing was readable.
 *
 * These are threaded into the write probes below, which need *real* foreign-key
 * values — see the note there on why fake ones are worse than useless.
 */
async function checkShareLink(
  anon: SupabaseClient
): Promise<{ userId: string | null; lookId: string | null }> {
  section("Share links / Buy this look (logged out)");

  const none = { userId: null, lookId: null };

  const { data: looks, error: looksError } = await anon
    .from("saved_looks")
    .select("id,look_name,user_id")
    .limit(1);

  if (looksError) {
    record(
      "fail",
      "anon can read a saved look",
      `${looksError.message} — every shared link currently shows "Look not ` +
        `found" to anyone but its author, and Buy This Look cannot price a look.`
    );
    return none;
  }

  if (!looks || looks.length === 0) {
    record(
      "skip",
      "anon can read a saved look",
      "No saved looks exist yet (or none are readable). Save a look in the app, " +
        "then run this again — this is the check that proves sharing works."
    );
    return none;
  }

  const look = looks[0];
  const found = {
    userId: (look.user_id as string | null) ?? null,
    lookId: (look.id as string | null) ?? null,
  };
  record(
    "pass",
    "anon can read a saved look",
    `"${look.look_name ?? "Untitled"}" (${look.id})`
  );

  const { data: items, error: itemsError } = await anon
    .from("saved_look_items")
    .select("product_key,shade_key,intensity")
    .eq("look_id", look.id);

  if (itemsError) {
    record(
      "fail",
      "anon can read that look's items",
      `${itemsError.message} — the look page would render with no products.`
    );
    return found;
  }

  record(
    "pass",
    "anon can read that look's items",
    `${items?.length ?? 0} item(s)`
  );

  if (!items || items.length === 0) return found;

  // 0.5 regression guard: the look page used to hardcode shade_key "no-shade",
  // which silently added the wrong colour to the cart. That is only fixable if
  // the shades are actually resolvable from here.
  const withShades = items.filter((i) => i.shade_key);
  if (withShades.length === 0) {
    record(
      "warn",
      "look items carry shade keys",
      "No item in this look has a shade_key, so the shade fix in " +
        "src/app/looks/[id]/page.tsx cannot be exercised. Save a look that uses " +
        "specific shades (lipstick, foundation) and re-run."
    );
    return found;
  }

  const productKeys = [...new Set(items.map((i) => i.product_key))];
  const shadeKeys = withShades.map((i) => i.shade_key as string);

  const { data: shades, error: shadesError } = await anon
    .from("product_shades")
    .select("product_key,shade_key,shade_name,shade_hex")
    .in("product_key", productKeys)
    .in("shade_key", shadeKeys);

  if (shadesError) {
    record("fail", "look shades resolve to real shade rows", shadesError.message);
    return found;
  }

  const resolved = shades?.length ?? 0;
  if (resolved === 0) {
    record(
      "fail",
      "look shades resolve to real shade rows",
      `${withShades.length} item(s) reference a shade_key, but none matched a ` +
        `row in product_shades. The look page will fall back to "No Shade", so ` +
        `the cart gets the wrong colour. Check that the app writes the same ` +
        `shade_key values that product_shades uses.`
    );
    return found;
  }

  const status: Status = resolved < withShades.length ? "warn" : "pass";
  record(
    status,
    "look shades resolve to real shade rows",
    `${resolved}/${withShades.length} resolved` +
      (status === "warn"
        ? " — the unresolved ones fall back to \"No Shade\"."
        : "")
  );

  return found;
}

// ── Negative checks (must be rejected) ───────────────────────────────────────
//
// Getting these right is subtler than it looks.
//
// An UPDATE or DELETE is useless as an RLS probe: the `using` clause *filters*
// rows rather than raising, so "RLS enabled, no policy" and "RLS disabled, no
// matching row" both come back as a successful zero-row statement.
//
// INSERT is the one operation that speaks clearly. With RLS on and no permissive
// insert policy, Postgres raises 42501. So the probe has to be an insert that
// satisfies every other constraint — otherwise a foreign-key or not-null error
// fires first and masks the answer entirely.
//
// Anything that is not 42501 and not a success is reported as inconclusive. A
// verification script that reports a false pass is worse than no script.

/** insufficient_privilege — what RLS raises when it refuses a row. */
const RLS_DENIED = "42501";

const VERIFY_TAG = "__phase0_verify__";

function classifyWriteAttempt(
  title: string,
  error: { code?: string; message: string } | null,
  consequenceIfOpen: string
): "blocked" | "open" | "unknown" {
  if (!error) {
    record("fail", title, `The write SUCCEEDED. ${consequenceIfOpen}`);
    return "open";
  }

  if (error.code === RLS_DENIED) {
    record("pass", title, `rejected by RLS: ${error.message}`);
    return "blocked";
  }

  record(
    "warn",
    title,
    `Inconclusive. Rejected, but by ${error.code ?? "an unknown error"} rather ` +
      `than RLS (${RLS_DENIED}): ${error.message} — a constraint stopped this ` +
      `before any policy was consulted, so it proves nothing about RLS.`
  );
  return "unknown";
}

/**
 * Finds a real (product_key, shade_key) pair the given look does not already
 * use, so a probe insert cannot be turned away by a uniqueness constraint before
 * RLS gets a say.
 */
async function realShadeReference(
  anon: SupabaseClient,
  lookId: string | null
): Promise<{ productKey: string; shadeKey: string } | null> {
  const { data: shades } = await anon
    .from("product_shades")
    .select("product_key,shade_key")
    .limit(200);

  if (!shades || shades.length === 0) return null;

  let taken = new Set<string>();
  if (lookId) {
    const { data: existing } = await anon
      .from("saved_look_items")
      .select("product_key")
      .eq("look_id", lookId);
    taken = new Set((existing ?? []).map((r) => r.product_key as string));
  }

  const free = shades.find((s) => !taken.has(s.product_key as string));
  if (!free) return null;

  return {
    productKey: free.product_key as string,
    shadeKey: free.shade_key as string,
  };
}

async function checkWritesAreBlocked(
  anon: SupabaseClient,
  sample: { userId: string | null; lookId: string | null }
) {
  section("Writes are blocked for anonymous callers");

  // ── saved_looks ────────────────────────────────────────────────────────────
  // A real user_id is required: a fake one trips saved_looks_user_id_fkey and
  // the foreign-key error hides whether RLS would have refused.
  if (!sample.userId) {
    record(
      "skip",
      "anon cannot insert into saved_looks",
      "Needs an existing user_id to insert against — a fake one is stopped by " +
        "the foreign key before RLS is reached, which proves nothing. Save a " +
        "look in the app first, then re-run."
    );
  } else {
    const { data: inserted, error } = await anon
      .from("saved_looks")
      .insert({ user_id: sample.userId, look_name: VERIFY_TAG })
      .select("id");

    const verdict = classifyWriteAttempt(
      "anon cannot insert into saved_looks",
      error,
      "Anyone with the anon key — which is everyone who opens the site — can " +
        "create, and by extension overwrite, looks belonging to real users."
    );

    if (verdict === "open") {
      await cleanUp(anon, "saved_looks", (inserted ?? []).map((r) => r.id));
    }
  }

  // ── saved_look_items ───────────────────────────────────────────────────────
  // Deliberately aimed at a look this caller does not own. That is the actual
  // attack: adding products to a stranger's saved look.
  //
  // Every column here is a foreign key into the catalog (look_id, product_key,
  // and shade_key alongside it), and shade_key is NOT NULL. Real values for all
  // of them are the only way the insert gets far enough for RLS to have an
  // opinion — the two earlier attempts died on 23502 then 23503 and proved
  // nothing.
  const ref = await realShadeReference(anon, sample.lookId);

  if (!sample.lookId) {
    record(
      "skip",
      "anon cannot insert into saved_look_items",
      "Needs an existing look_id to insert against. Save a look in the app " +
        "first, then re-run."
    );
  } else if (!ref) {
    record(
      "skip",
      "anon cannot insert into saved_look_items",
      "Could not find a (product_key, shade_key) pair that this look does not " +
        "already use. Without one the insert trips a foreign-key or uniqueness " +
        "constraint before RLS is consulted."
    );
  } else {
    const { data: inserted, error } = await anon
      .from("saved_look_items")
      .insert({
        look_id: sample.lookId,
        product_key: ref.productKey,
        shade_key: ref.shadeKey,
        intensity: 0,
        layer_order: 999,
      })
      .select("id");

    const verdict = classifyWriteAttempt(
      "anon cannot insert into saved_look_items",
      error,
      "A stranger can add products to someone else's saved look — which is also " +
        "what Buy This Look prices, so it is a way to put items in another " +
        "user's basket."
    );

    if (verdict === "open") {
      await cleanUp(anon, "saved_look_items", (inserted ?? []).map((r) => r.id));
    }
  }

  // ── makeup_products ────────────────────────────────────────────────────────
  // Every column that could plausibly be NOT NULL is filled in, for the same
  // reason the saved_looks probe needs a real user_id: a 23502 not-null error
  // would fire before RLS was consulted and tell us nothing.
  //
  // is_active: false so that if cleanup somehow fails, the junk row still does
  // not surface in the storefront.
  const probeKey = `${VERIFY_TAG}${Date.now()}`;
  const { data: product, error: productError } = await anon
    .from("makeup_products")
    .insert({
      product_key: probeKey,
      name: VERIFY_TAG,
      brand: VERIFY_TAG,
      category: "verify",
      price: 0,
      currency: "PKR",
      is_active: false,
    })
    .select("id");

  const productVerdict = classifyWriteAttempt(
    "anon cannot insert into makeup_products",
    productError,
    "The catalog is writable from the browser: the price, name and image of " +
      "every product can be changed by anyone who opens the site."
  );

  if (productVerdict === "open") {
    await cleanUp(anon, "makeup_products", (product ?? []).map((r) => r.id));
  }

  // ── product_shades ─────────────────────────────────────────────────────────
  // A writable shade table means anyone can change the hex the try-on screen
  // renders and the swatch the store shows — the same colour, two clients.
  //
  // Uses a real product_key: product_shades.product_key references the catalog,
  // so the probe key above (whose insert was refused) would trip the foreign key
  // and mask the result.
  const { data: realProduct } = await anon
    .from("makeup_products")
    .select("product_key")
    .limit(1);
  const realProductKey = realProduct?.[0]?.product_key as string | undefined;

  if (!realProductKey) {
    record(
      "skip",
      "anon cannot insert into product_shades",
      "Needs a readable product_key to reference. The catalog read above must " +
        "pass first."
    );
    return;
  }

  const { data: shade, error: shadeError } = await anon
    .from("product_shades")
    .insert({
      product_key: realProductKey,
      shade_key: `${VERIFY_TAG}${Date.now()}`,
      shade_name: VERIFY_TAG,
      shade_hex: "#000000",
      shade_order: 999,
    })
    .select("id");

  const shadeVerdict = classifyWriteAttempt(
    "anon cannot insert into product_shades",
    shadeError,
    "Shade hex values are writable from the browser, so the colour rendered by " +
      "the try-on screen can be changed by anyone."
  );

  if (shadeVerdict === "open") {
    await cleanUp(anon, "product_shades", (shade ?? []).map((r) => r.id));
  }
}

/** Removes probe rows. Only ever runs when RLS turned out to be open. */
async function cleanUp(anon: SupabaseClient, table: string, ids: string[]) {
  if (ids.length === 0) {
    record(
      "warn",
      `${table} probe row cleaned up`,
      "The insert succeeded but returned no id, so the row could not be " +
        `removed automatically. Delete rows named "${VERIFY_TAG}" by hand.`
    );
    return;
  }

  const { error } = await anon.from(table).delete().in("id", ids);
  record(
    error ? "warn" : "pass",
    `${table} probe row cleaned up`,
    error
      ? `Could not delete ${ids.join(", ")}: ${error.message} — remove it by hand.`
      : `deleted ${ids.length} row(s)`
  );
}

// ── Session bridge sanity ────────────────────────────────────────────────────

async function checkAuthReachable(anon: SupabaseClient) {
  section("Auth");

  // getSession() on a fresh server-side client is expected to be empty; this is
  // really a reachability check on the auth endpoint the bridge will call.
  const { error } = await anon.auth.getSession();
  if (error) {
    record("fail", "auth endpoint reachable", error.message);
  } else {
    record(
      "pass",
      "auth endpoint reachable",
      "setSession() on /auth/bridge can reach the same endpoint"
    );
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n\x1b[1mPhase 0 verification\x1b[0m");
  console.log("\x1b[90mUsing the anon key only — service-role would bypass RLS " +
    "and pass everything.\x1b[0m");

  if (!checkEnv()) {
    finish();
    return;
  }

  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  section("Public catalog (logged out)");
  await checkPublicRead(
    anon,
    "makeup_products",
    "product_key,name,price",
    "The app's ProductsCache and the store's product grid both depend on this."
  );
  await checkPublicRead(
    anon,
    "product_shades",
    "shade_key,product_key,shade_name",
    "The try-on screen needs shade hex values before sign-in."
  );

  const sample = await checkShareLink(anon);
  await checkWritesAreBlocked(anon, sample);
  await checkAuthReachable(anon);

  finish();
}

function finish() {
  const counts = results.reduce<Record<Status, number>>(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }),
    { pass: 0, fail: 0, warn: 0, skip: 0 }
  );

  console.log(
    `\n\x1b[1mSummary\x1b[0m  ${counts.pass} passed · ${counts.fail} failed · ` +
      `${counts.warn} warning(s) · ${counts.skip} skipped`
  );

  if (counts.fail > 0) {
    console.log("\nFailed:");
    for (const r of results.filter((r) => r.status === "fail")) {
      console.log(`  \x1b[31m✘\x1b[0m ${r.title}`);
    }
    console.log("\nApply \x1b[1mdb/001_phase0_rls.sql\x1b[0m and run this again.\n");
    process.exit(1);
  }

  console.log("");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n\x1b[31mVerification crashed:\x1b[0m", err);
  process.exit(1);
});
