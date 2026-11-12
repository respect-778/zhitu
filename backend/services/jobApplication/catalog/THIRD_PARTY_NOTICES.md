# Third-party notices

## freehire

Tencent adapter protocol and mapping logic in `src/adapters/tencent.ts` is adapted from
`internal/ingest/sources/tencent.go` at commit
`4ac57f6902788f6e5982ddc4f91ab9855d946b5a`.

Copyright (c) 2026 freehire contributors.

Licensed under the MIT License. The complete license text is preserved in
`licenses/freehire-LICENSE`.

Migration status and deliberate changes are recorded in `docs/upstream-migrations.md`.

## npm dependencies (T04)

Fastify 5.12.8 is MIT licensed. Crawlee Basic 3.18.2 and its Crawlee modules are Apache-2.0 licensed. The exact catalog workspace closure, including development tooling and transitive dependencies, is recorded in `docs/dependency-inventory.json`.

Collected upstream copyright notices and license texts are preserved in `licenses/npm/THIRD_PARTY_LICENSES.txt`. This includes caniuse-lite's CC-BY-4.0 data attribution and packages using BlueOak-1.0.0 or dual licenses. Provenance for release packages that omitted a license file, and the limits of those supplemental records, are documented in `docs/dependency-security.md`.

No third-party install, prepare, coverage-upload, or publication script is part of the catalog runtime commands.
## npm dependencies (T05)

The exact T05 closure is recorded in `docs/t05-dependency-inventory.json`; additional license and NOTICE texts are retained in `licenses/npm/T05_THIRD_PARTY_LICENSES.txt`. Unchanged identities reference the T04 archive. The supplement preserves EPL-2.0, embedded vendor notices, and Prisma Studio branding notices where supplied; it does not describe the entire closure as MIT or Apache only.

`@prisma/dev@0.24.17` declares ISC in its official npm metadata, but a complete license/copyright text and fixed source provenance have not been located. This remains an explicit redistribution gap. Prisma CLI/Studio are development tooling, and an `--omit=dev` install alone does not prove they are absent because of peer dependencies. T22 must verify the actual release manifest and exclude unused tooling or resolve its applicable notices before redistribution.
