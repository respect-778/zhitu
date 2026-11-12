# Changelog

All notable changes, newest first. The README's [News](README.md#news) section
carries the latest handful of entries; everything lands here permanently.
Tagged releases: [GitHub Releases](https://github.com/ngoanpv/DeepInterview/releases).

## v0.3.0 — 2026-08-02

- **A fully local model path — no LLM, STT or TTS keys.** `LLM_PROVIDER=ollama`,
  `STT_PROVIDER=whisper` and `TTS_PROVIDER=kokoro` point each stage at an
  OpenAI-compatible server on your own machine. No new dependency was added:
  the existing `livekit-plugins-openai` is reused with a `base_url` override, so
  any compatible server works (Ollama, vLLM, LM Studio, llama.cpp, Speaches,
  kokoro-fastapi). `deepinterview init` gained a **"100% local models"** mode and
  `docker compose --profile local` brings up the model servers.
  Closes #55, #56, #57.
- **Verified** on an Apple M5 Pro (24 GB): prep produced a real, CV-grounded
  six-question plan in 121s on `qwen3:8b` with no degraded stages, and a Kokoro →
  Whisper round trip through the real worker builders returned the spoken
  sentence verbatim (3.25s of 24 kHz PCM). Provider selection, fallback and
  voice/language routing are covered by offline unit tests.
- **The Whisper default is `faster-whisper-base`, deliberately.** The OpenAI
  plugin hard-codes a 30s per-request timeout that no setting can raise, so an
  oversized model doesn't degrade — the turn dies with `failed to recognize
  speech`. `small` needs ~3.4 GB resident and, in a memory-tight Docker VM, took
  32s on a 3.6s clip; `base` needs ~220 MB, runs at ~0.09x realtime, and was just
  as accurate on interview speech. Sizes and per-model timings under concurrent
  LLM load are in [docs/LOCAL_MODELS.md](docs/LOCAL_MODELS.md).
- **A real microphone interview runs end to end on local models.** Verified with
  a live LiveKit session: the agent spoke in Kokoro's voice, the local Whisper
  server transcribed real speech, and the report rendered `complete` — with no
  recognition failures and no stage falling back to a cloud provider. One honest
  note from that run: `qwen3:8b` did not reliably call the `save_answer` tool, so
  the shutdown-time transcript recovery supplied the answer. That safety net is
  pre-existing and worked, but small local models lean on it more than the cloud
  models do.
- **Not verified, so not claimed:** turn latency on local models is not
  benchmarked, and the local path is maintainer-tested rather than CI-tested (CI
  has no models). Tuning local turn latency is tracked as follow-up work. Kokoro has no Vietnamese voice — `vi` sessions fall back to
  a cloud voice rather than mispronouncing it. Local STT is batch, so live
  captions arrive per utterance instead of word by word.
- **LiveKit remains the real-time transport** even on the local path. Use LiveKit
  Cloud, or `livekit-server --dev` for a fully offline stack. See
  [docs/LOCAL_MODELS.md](docs/LOCAL_MODELS.md).
- Local models are slower than cloud ones: `LLM_CALL_TIMEOUT_SEC` and
  `SCORE_STAGE_TIMEOUT_SEC` are the knobs, and selecting a local provider
  automatically widens the live per-request ceiling from the SDK's 10s default.

## v0.2.0 — 2026-07-25

- **Gemini 3.6 Flash + LiveKit Agents 1.6.** Prep and scoring run on Gemini 3.6
  Flash; the live voice stack moved to livekit-agents 1.6 (Gemini 3-ready
  function calling on the turn path), and live captions read as one paragraph
  per speaker instead of per-fragment lines.
- **The community playbook library is live.** Question-bank packs in `skills/`
  are retrieved by role/level and injected into the question planner — packs
  the community writes get asked in real interviews. Ships with generic
  backend/frontend/SWE packs, `deepinterview skills lint`, a pack PR template,
  a content policy, and a browsable pack index.
- **The open-source build is fully uncapped — billing removed.** Self-host with
  your own keys: no plan gates, no interview caps, no billing tables. Payments
  live only in the hosted edition.
- **Hardening release.** Opt-in shared-secret auth for the agent API and
  knowledge sidecar, locked-down Supabase row policies, and periodic transcript
  checkpointing so a killed process loses seconds of an interview, not all of it.
- **The study coach grounds answers in *your* session.** Prep ingests the CV,
  JD, and company research into the knowledge sidecar keyed by session — coach
  answers cite your own materials.
- New logo family (outlined geometry — renders identically everywhere), README
  restructure (quickstart first), and first-contributor infrastructure
  (protected `main`, Discussions, issue templates for packs and code execution).

## v0.1.0 — 2026-06-24

- **Live voice interviews run on real providers.** The full loop — personalized
  prep (real Gemini CV/JD analysis + company research) → real-time voice
  interview on LiveKit (Deepgram STT · Gemini · Cartesia/ElevenLabs TTS) →
  scored report — runs end to end, with semantic end-of-turn detection and
  noise-robust, word-gated barge-in.
- **`docker compose up` verified.** All images build; the base stack (web +
  agent API + knowledge sidecar) comes up healthy with zero keys on mock
  adapters; `--profile live` adds the voice worker.
- **Relicensed to Apache 2.0** — permissive core, bring-your-own keys, no sign-in.
- Early build: cross-language `InterviewContext` contract (TS ↔ Pydantic)
  round-trips; prep/live/post pipelines and all web screens run offline with
  mock adapters.
