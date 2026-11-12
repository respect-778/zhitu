# Avatar packs — bring your own generator

The interviewer avatars are **pre-rendered video loops** crossfaded by agent
state at runtime (`<AvatarStage>`), so runtime cost is ~$0/min — just CDN
bytes. The app never calls a video vendor: it plays whatever assets exist.
That means avatar packs can be produced with **any generator** — Veo, Sora,
Runway, Kling, a local ComfyUI/LTX rig, or hand animation. There is no
blessed vendor; there is a **contract**.

Avatar packs are **curated artifacts, not build outputs**: video generation is
non-deterministic, so the committed prompt is provenance, not a reproducible
build recipe. Packs go through human review like any contribution.

Assets are always optional: with no assets present the app renders its calm
gradient stage (the mock-first rule applies to pixels too). Nothing may break
when a pack is missing.

## What a pack contains

For one persona (see `apps/web/lib/personas.ts` for the ids):

| Deliverable | Contract |
|---|---|
| Reference still (poster) | JPG/PNG, ≥1024px wide — the character's canonical look; visually the first frame of the loops |
| Idle loop | MP4 (H.264), ~8s, **first frame = last frame** (seamless), subtle breathing/blinking, no audio track |
| Speaking loop | MP4 (H.264), ~8s, seamless, same character/framing/background as idle, natural mouth movement + small gestures, no audio track |

Shared requirements: medium close-up, calm uncluttered background, static
camera, the **same character** across all three files, ≤25 MB per file.

## The IP-safety checklist (load-bearing — every pack, no exceptions)

- [ ] Original fictional character — resembles **no real person** (including
      the contributor) and **no existing franchise/character**
- [ ] No brand logos, trademarks, or copyrighted set dressing
- [ ] **Generator + full prompt disclosed** in the PR (AI-generated content
      must be labeled as such; the prompt is the reviewable recipe)
- [ ] Contributor affirms they hold/grant rights to the output under the
      project license and that the generator's terms permit this use

Packs that can't credibly tick every box are declined — same bar as the
question-bank content policy in [CONTRIBUTING.md](../CONTRIBUTING.md).

## How to contribute a pack

0. **Pre-flight locally**: `pnpm deepinterview avatars verify <your files>`
   checks the technical contract (container, magic bytes, size budget) and
   prints each file's SHA-256 to paste into the PR.
1. **Open a PR** with the persona entry (or a new persona following the
   [#53](https://github.com/ngoanpv/DeepInterview/issues/53) pattern), the
   generation prompt(s), and the checklist above — plus the rendered files
   **attached to the PR or linked** (release, Drive, etc.).
2. **Binaries never enter git history.** Do not commit media; `apps/web/
   public/avatars/` is gitignored as a local-dev drop-in only.
3. **Prefer attaching files to the PR** over external links — PR attachments
   can't be content-swapped under the same URL later; a Drive/Dropbox link can.
4. On acceptance, a maintainer **downloads the files, reviews those exact
   bytes** (never just the stream behind a link), records each file's
   **SHA-256 in the PR**, and publishes the reviewed copies as **GitHub
   Release artifacts** (fork-survivable, archived) and to the CDN — then
   updates the persona's `poster_url` / `idle_url` / `speaking_url` and your
   `credit` line ("rendered by @you with <generator>").

**Integrity rule (for maintainers):** persona URLs may only ever point at
maintainer-controlled hosting (Releases/CDN). Never link a contributor's URL
from `personas.ts` — external content can change after review; the recorded
SHA-256 binds the acceptance to the exact bytes that were reviewed.

## The manifest + how users get assets

Accepted packs are recorded in the repo-root **`avatars.manifest.json`** —
persona, files, SHA-256 per file, release URL, and the contributor credit.
Git history is the tamper-evident acceptance ledger (Release assets alone are
maintainer-mutable; the in-repo hash is what makes tampering detectable).

Self-hosters fetch assets with one command:

```bash
pnpm deepinterview avatars pull   # downloads + SHA-256-verifies into apps/web/public/avatars/
```

After a pull the app serves avatars locally with **zero runtime dependency on
project infrastructure**; before one, it renders the gradient stage. Assets
are always optional (the mock-first rule applies to pixels too).

## Reference implementation

`scripts/veo/` renders packs with Google Veo 3.1 if you have a Gemini API
key — it is **one way** to satisfy this contract, not the way. Model ids in
that script chase a moving vendor; the contract above does not.
