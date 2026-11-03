#!/usr/bin/env node
/**
 * NGL Receipt Kit v0.1.0 — offline provenance for people whose names are on the work.
 * Doctrine: assertion is not observation. Unreceipted claims stay PROPOSED.
 * No network required. No third-party packages. Node 20+.
 *
 * Usage:
 *   node receipt-kit.mjs init <workspace>
 *   node receipt-kit.mjs add-source <workspace> <file>
 *   node receipt-kit.mjs claim <workspace> "<text>" [--source <relpath>] [--sha256 <hex>]
 *   node receipt-kit.mjs inspect <workspace>          # recompute hashes; update statuses
 *   node receipt-kit.mjs export <workspace> <out.zip.json>  # provenance bundle (JSON)
 *   node receipt-kit.mjs status <workspace>
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, basename, join } from "node:path";

const SCHEMA = "ngl.receipt-kit.bundle.v1";

function sha256File(path) {
  const h = createHash("sha256");
  h.update(readFileSync(path));
  return h.digest("hex");
}
function sha256Buf(buf) {
  return createHash("sha256").update(buf).digest("hex");
}
function now() {
  return new Date().toISOString();
}
function load(ws) {
  const p = join(ws, "receipt-kit.json");
  if (!existsSync(p)) throw new Error(`not a receipt-kit workspace: ${ws}`);
  return JSON.parse(readFileSync(p, "utf8"));
}
function save(ws, state) {
  state.updated_at = now();
  writeFileSync(join(ws, "receipt-kit.json"), JSON.stringify(state, null, 2) + "\n");
}
function usage() {
  console.error(`NGL Receipt Kit — assertion is not observation

  node receipt-kit.mjs init <workspace>
  node receipt-kit.mjs add-source <workspace> <file>
  node receipt-kit.mjs claim <workspace> "<text>" [--source <relpath>] [--sha256 <hex>]
  node receipt-kit.mjs inspect <workspace>
  node receipt-kit.mjs export <workspace> <bundle.json>
  node receipt-kit.mjs status <workspace>
`);
  process.exit(2);
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) usage();

if (cmd === "init") {
  const ws = resolve(args[0] || usage());
  mkdirSync(ws, { recursive: true });
  mkdirSync(join(ws, "sources"), { recursive: true });
  if (existsSync(join(ws, "receipt-kit.json"))) {
    console.error("workspace already initialized");
    process.exit(1);
  }
  const state = {
    schema: SCHEMA,
    kit_version: "0.1.0",
    created_at: now(),
    updated_at: now(),
    doctrine: "Assertion is not observation. Unreceipted claims remain PROPOSED.",
    sources: [],
    claims: [],
  };
  save(ws, state);
  console.log(JSON.stringify({ ok: true, workspace: ws }, null, 2));
  process.exit(0);
}

if (cmd === "add-source") {
  const ws = resolve(args[0] || usage());
  const file = resolve(args[1] || usage());
  const state = load(ws);
  const bytes = readFileSync(file);
  const hash = sha256Buf(bytes);
  const destName = basename(file);
  const dest = join(ws, "sources", destName);
  writeFileSync(dest, bytes);
  const entry = {
    id: randomUUID(),
    path: `sources/${destName}`,
    original_name: destName,
    byte_length: bytes.length,
    sha256: hash,
    added_at: now(),
  };
  state.sources = state.sources.filter((s) => s.path !== entry.path);
  state.sources.push(entry);
  save(ws, state);
  console.log(JSON.stringify({ ok: true, source: entry }, null, 2));
  process.exit(0);
}

if (cmd === "claim") {
  const ws = resolve(args[0] || usage());
  const text = args[1] || usage();
  let sourceRel = null;
  let expectSha = null;
  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--source") sourceRel = args[++i];
    else if (args[i] === "--sha256") expectSha = args[++i];
  }
  const state = load(ws);
  let status = "PROPOSED";
  let evidence = null;
  let reason = "no structured evidence bound";
  if (sourceRel) {
    const src = state.sources.find((s) => s.path === sourceRel || s.original_name === sourceRel);
    if (!src) {
      status = "PROPOSED";
      reason = "source not in workspace";
    } else {
      const live = sha256File(join(ws, src.path));
      if (live !== src.sha256) {
        status = "REFUTED";
        reason = "source bytes changed since add-source";
        evidence = { expected: src.sha256, observed: live };
      } else if (expectSha && expectSha !== live) {
        status = "REFUTED";
        reason = "claim sha256 does not match source";
        evidence = { expected: expectSha, observed: live };
      } else if (expectSha && expectSha === live) {
        status = "VERIFIED";
        reason = "source present; sha256 matches claim binding";
        evidence = { path: src.path, sha256: live, byte_length: src.byte_length };
      } else {
        // bound to source identity only — still not natural-language truth
        status = "VERIFIED";
        reason = "source identity verified (hash+length); claim text remains human responsibility";
        evidence = { path: src.path, sha256: live, byte_length: src.byte_length };
      }
    }
  }
  const claim = {
    id: randomUUID(),
    text,
    status,
    reason,
    evidence,
    created_at: now(),
  };
  state.claims.push(claim);
  save(ws, state);
  console.log(JSON.stringify({ ok: true, claim }, null, 2));
  process.exit(status === "REFUTED" ? 1 : 0);
}

if (cmd === "inspect") {
  const ws = resolve(args[0] || usage());
  const state = load(ws);
  for (const src of state.sources) {
    const p = join(ws, src.path);
    if (!existsSync(p)) {
      src.inspect = { status: "MISSING", at: now() };
      continue;
    }
    const live = sha256File(p);
    const len = statSync(p).size;
    src.inspect = {
      status: live === src.sha256 && len === src.byte_length ? "INTACT" : "CHANGED",
      observed_sha256: live,
      observed_byte_length: len,
      at: now(),
    };
  }
  for (const c of state.claims) {
    if (!c.evidence?.sha256) {
      if (c.status !== "PROPOSED") {
        c.status = "PROPOSED";
        c.reason = "re-inspect: no hash evidence; demoted to PROPOSED";
      }
      continue;
    }
    const src = state.sources.find((s) => s.sha256 === c.evidence.sha256 || s.path === c.evidence.path);
    if (!src || src.inspect?.status === "MISSING") {
      c.status = "UNVERIFIABLE";
      c.reason = "bound source missing";
    } else if (src.inspect?.status === "CHANGED") {
      c.status = "REFUTED";
      c.reason = "bound source changed";
    } else if (src.inspect?.status === "INTACT" && c.status === "REFUTED") {
      // leave REFUTED unless re-claimed
    } else if (src.inspect?.status === "INTACT" && c.evidence.sha256 === src.sha256) {
      c.status = "VERIFIED";
      c.reason = "source intact on inspect";
    }
  }
  save(ws, state);
  console.log(JSON.stringify({ ok: true, sources: state.sources, claims: state.claims }, null, 2));
  process.exit(0);
}

if (cmd === "export") {
  const ws = resolve(args[0] || usage());
  const out = resolve(args[1] || usage());
  const state = load(ws);
  // re-hash for export integrity
  const sources = state.sources.map((s) => {
    const p = join(ws, s.path);
    const present = existsSync(p);
    const live = present ? sha256File(p) : null;
    return {
      ...s,
      export_sha256: live,
      export_intact: present && live === s.sha256,
    };
  });
  const proposed = state.claims.filter((c) => c.status === "PROPOSED").length;
  const verified = state.claims.filter((c) => c.status === "VERIFIED").length;
  const refuted = state.claims.filter((c) => c.status === "REFUTED").length;
  const bundle = {
    schema: SCHEMA,
    kit_version: state.kit_version,
    exported_at: now(),
    doctrine: state.doctrine,
    summary: {
      sources: sources.length,
      claims: state.claims.length,
      proposed,
      verified,
      refuted,
      all_sources_intact: sources.every((s) => s.export_intact),
    },
    sources,
    claims: state.claims,
    bundle_sha256_of_canonical_body: null,
  };
  const body = { ...bundle };
  delete body.bundle_sha256_of_canonical_body;
  bundle.bundle_sha256_of_canonical_body = sha256Buf(Buffer.from(JSON.stringify(body)));
  writeFileSync(out, JSON.stringify(bundle, null, 2) + "\n");
  console.log(JSON.stringify({ ok: true, out, summary: bundle.summary, bundle_sha256: bundle.bundle_sha256_of_canonical_body }, null, 2));
  process.exit(bundle.summary.all_sources_intact ? 0 : 1);
}

if (cmd === "status") {
  const ws = resolve(args[0] || usage());
  const state = load(ws);
  const summary = {
    workspace: ws,
    sources: state.sources.length,
    claims: state.claims.length,
    by_status: state.claims.reduce((a, c) => {
      a[c.status] = (a[c.status] || 0) + 1;
      return a;
    }, {}),
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

usage();
