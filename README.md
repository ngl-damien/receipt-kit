# NGL Receipt Kit v0.1.0

**Offline provenance for people whose names are on the work.**

> Assertion is not observation. Unreceipted claims remain **PROPOSED**.

Built from No_Gas_Labs™ / Recursive Artifact Engine doctrine. No accounts. No network. No npm dependencies.

## Install

```sh
# Node 20+
curl -fsSL -o receipt-kit.mjs https://raw.githubusercontent.com/ngl-damien/receipt-kit/main/receipt-kit.mjs
# or copy from this repo
node receipt-kit.mjs init ./my-case
```

## Workflow

```sh
node receipt-kit.mjs init ./my-case
node receipt-kit.mjs add-source ./my-case ./report-draft.pdf
node receipt-kit.mjs claim ./my-case "Page 3 revenue figure matches source PDF" --source report-draft.pdf
node receipt-kit.mjs claim ./my-case "This will change the industry"   # stays PROPOSED
node receipt-kit.mjs inspect ./my-case
node receipt-kit.mjs export ./my-case ./provenance-bundle.json
```

Hand `provenance-bundle.json` to a client or editor. It includes source hashes, claim statuses, and a bundle self-hash.

## Status meanings

| Status | Meaning |
|--------|---------|
| PROPOSED | No structured evidence binding (default for free text) |
| VERIFIED | Bound source present; hash identity matches |
| REFUTED | Bound source missing, changed, or hash mismatch |
| UNVERIFIABLE | Evidence referenced but not available on inspect |

Natural-language truth is still the professional's responsibility. The kit proves **what files were present and whether claims were bound to them** — not that a sentence is true in the world.

## Price hypothesis (unverified)

Professional liability-adjacent tooling often sits above template pricing. Market Gate research pending. Do not treat any dollar figure as established.

## License

UNLICENSED / NGL proprietary pending Founder publication decision.
