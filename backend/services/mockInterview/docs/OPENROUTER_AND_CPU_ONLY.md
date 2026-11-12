# Running with OpenRouter (OpenAI-compatible) & on CPU-only machines

This guide covers two things that trip people up: pointing DeepInterview's LLM at an OpenAI-compatible
gateway like **OpenRouter**, and getting useful mock-interview practice on a **CPU-only** machine that
can't run the real-time voice stack.

## 1. Use an OpenAI-compatible endpoint (OpenRouter)

The `ollama` / `vllm` / `local` LLM providers name a **contract, not a vendor** — anything that speaks the
OpenAI HTTP shape works, including OpenRouter. Set in `.env`:

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=https://openrouter.ai/api/v1
OLLAMA_MODEL=deepseek/deepseek-v3.2
LOCAL_API_KEY=<your OpenRouter API key>   # never commit this
```

### Pick a model that returns clean JSON

The prep pipeline (company research → JD/CV analysis → gap matching → question planner) parses **strict
JSON** from the model. Two common failure modes on the **free** tier:

- **429 / unavailable** — free slugs are heavily rate-limited and frequently return `429` or
  `404 "unavailable for free, use a paid slug"`.
- **Reasoning preamble breaks JSON** — some free/reasoning models emit chain-of-thought *before* the JSON,
  so the parser fails and the stage silently degrades (e.g. "Could not tailor the question plan; used a
  generic one").

Use a **cheap paid model** instead. `deepseek/deepseek-v3.2` (~$0.27/$0.40 per 1M tokens) returns clean,
fenced JSON and is reliable; a few dollars of OpenRouter credit covers many sessions. Prefer a
non-reasoning chat model, or one whose reasoning is returned in a separate field rather than inline.

### Privacy note

With a cloud gateway, prompts (CV text, JD, answers) leave your machine. In OpenRouter's settings you can
disable prompt logging and restrict routing to providers that don't train on your data. For fully local
inference, see `LOCAL_MODELS.md`.

## 2. Mock interviews on a CPU-only machine

The **live voice interview** needs, in addition to the LLM: a **LiveKit** media server (the real-time
transport that carries mic audio from the browser to the agent worker), plus **STT** and **TTS**. On a
CPU-only machine the local speech models (whisper / kokoro) are typically too slow to stay under the
per-turn ceilings, and the cloud STT/TTS providers add cost and send your audio off-device. So the full
voice avatar is often not viable there.

**What still works well on CPU:**

- **The prep pipeline** — `POST /api/prep` with `{ cv_url, jd_text, company, language_mode }` runs entirely
  through the LLM (no LiveKit, no STT/TTS) and produces the tailored analysis, gap matching, and question
  plan. Poll `GET /api/session/{id}` until `status: "ready"`; read `context.gap` and `context.plan`.
- **Practice the questions externally** — take the generated question plan and rehearse out loud using any
  desktop dictation tool (local speech-to-text) driving a simple text loop, instead of the LiveKit avatar.
  You keep the tailored prep; you just skip the transport you can't run.

**Minimal env for prep-only:**

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=https://openrouter.ai/api/v1
OLLAMA_MODEL=deepseek/deepseek-v3.2
LOCAL_API_KEY=<key>
# LIVEKIT_URL left blank — the interview UI shows "Preview mode" until LiveKit is configured
```

If you later want live voice, point `LIVEKIT_URL` at LiveKit Cloud (free tier) or run
`livekit-server --dev`, and provide STT/TTS (cloud keys, or local whisper/kokoro on capable hardware).
