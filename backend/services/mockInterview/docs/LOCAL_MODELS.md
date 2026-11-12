# Run DeepInterview on local models

Every AI stage — the LLM, speech-to-text and text-to-speech — can run on your own
machine. No OpenAI key, no Gemini key, no Deepgram key, no Cartesia key, and
nothing about your CV leaves your box.

```bash
LLM_PROVIDER=ollama   STT_PROVIDER=whisper   TTS_PROVIDER=kokoro
```

All three are reached over the **OpenAI HTTP shape**, so they take a base URL
instead of an API key, and any compatible server works — Ollama, vLLM, LM Studio,
llama.cpp, Speaches, kokoro-fastapi. DeepInterview added no new dependency for
this: it reuses `livekit-plugins-openai` with a `base_url` override.

> ### One honest caveat, up front
> **LiveKit is still the real-time transport.** Local models replace the *AI*
> vendors, not the WebRTC layer. You have two options:
> - point `LIVEKIT_URL` at LiveKit Cloud (free tier is enough for self-hosting), or
> - run `livekit-server --dev` locally for a genuinely offline stack.
>
> So the accurate claim is **"no cloud model keys / no per-minute AI vendor
> costs"** — not "no cloud at all". Everything else on this page is local.

---

## 1. Start the model servers

### LLM — Ollama

Run Ollama **natively**, not in Docker, on macOS and Windows: Docker Desktop has
no GPU passthrough, so a containerised Ollama is CPU-only and far too slow for a
live conversation. Native Ollama uses Metal on Apple Silicon.

```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh   # or: brew install ollama

# The context length is NOT optional — see "Why 16k" below.
OLLAMA_CONTEXT_LENGTH=16384 ollama serve

ollama pull qwen3:8b        # ~5 GB on disk
```

**Why 16k.** The question planner's prompt is your CV + the job description +
company research + the JSON schema it must fill. Ollama's default context window
is smaller than that, and it truncates **silently** — you get a well-formed
interview plan about a candidate the model never actually read. This is the
single most likely way to get a disappointing local run.

**Model choice.** `qwen3:8b` is the smallest model verified to produce a real,
grounded question plan (see "What we verified" below). Smaller models tend to
fail the JSON contract, which lands you on the generic fallback plan. If you have
the memory, `qwen3:14b` has more headroom.

### STT — a local Whisper server

Any server exposing `POST /v1/audio/transcriptions`:

```bash
docker run -d -p 8001:8000 ghcr.io/speaches-ai/speaches:latest-cpu

# Speaches ships no weights — download the model once, or every transcription
# 404s with "Model ... is not installed locally".
curl -X POST http://localhost:8001/v1/models/Systran/faster-whisper-base
```

**Pick the smallest Whisper that's accurate enough — this matters more than it
looks.** The OpenAI plugin hard-codes a **30-second per-request timeout that no
setting can raise**, so a slow transcription doesn't degrade gracefully; the turn
dies with `failed to recognize speech`. Measured on an M5 Pro with the local LLM
generating at the same time — the condition that actually holds mid-interview,
since the next utterance is transcribed while the agent is still replying:

| Model | Idle | Under LLM load | Resident |
|---|---|---|---|
| `faster-whisper-tiny.en` | 0.06× realtime | 0.13× | very small |
| **`faster-whisper-base`** (default) | 0.09× | ~0.7× | **~220 MB** |
| `faster-whisper-small` | 0.40× | 0.77× | **~3.4 GB** |

Accuracy on interview speech was indistinguishable across all three, so `small`
bought nothing and cost 15× the memory. It first showed up as a hang, not a
slowdown: inside a memory-constrained Docker VM (Docker Desktop defaults to a
fraction of host RAM, shared by *every* container you're running) `small` pushed
the VM into swap and a 3.6-second clip took **32 seconds**. Use `small` or
`medium` only with a GPU.

### TTS — Kokoro

```bash
docker run -d -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest
```

Kokoro-82M is small enough to run comfortably on CPU.

### Or bring them all up with the `local` profile

```bash
docker compose --profile local --profile live up
```

This starts Ollama (+ a one-shot model pull), the Whisper server and Kokoro
alongside the app. On a Mac, prefer the native Ollama above and point the
containers at it with `OLLAMA_BASE_URL=http://host.docker.internal:11434/v1`.

---

## 2. Configure

`pnpm deepinterview init` → **"100% local models"** sets all of this for you.
Or write it yourself:

```bash
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=qwen3:8b
OLLAMA_MODEL_LIVE=        # optional; blank = same model live as in prep

STT_PROVIDER=whisper
WHISPER_BASE_URL=http://localhost:8001/v1

TTS_PROVIDER=kokoro
KOKORO_BASE_URL=http://localhost:8880/v1
KOKORO_MODEL=tts-1        # do not change — see below
KOKORO_VOICE=             # blank = pick the voice from the session language

# Company research is the one remaining outbound call. Mock it for a fully
# offline run; leave it on Tavily/Exa if you want real company intel.
SEARCH_PROVIDER=mock

# Local models are slower than cloud ones. Without these, prep and scoring hit
# their ceilings and silently degrade to generic results.
LLM_CALL_TIMEOUT_SEC=300
SCORE_STAGE_TIMEOUT_SEC=300
```

**`KOKORO_MODEL=tts-1` is load-bearing.** That id is what selects the raw-audio
transport in the OpenAI plugin; any other value routes synthesis down a
server-sent-events branch that yields **no audio and no error** — the agent
simply never speaks. `kokoro-fastapi` ignores the model name itself, so pinning
it costs nothing. The worker coerces a wrong value back to `tts-1` and logs a
warning rather than going silent.

### Two model tiers: prep and live

`OLLAMA_MODEL` runs the **prep pipeline and scoring**; `OLLAMA_MODEL_LIVE`, if
set, runs the **live turn loop** instead. The two jobs have opposite constraints:

- **Prep and scoring** are batch. They take minutes, nobody is waiting
  mid-sentence, and quality shows up directly in the question plan — this is
  where a bigger model earns its keep.
- **The live loop** is judged on *time-to-first-token*. Every second before the
  interviewer starts speaking is a second of dead air in a conversation, and a
  model that reasons at length before its first word feels broken even when the
  answer is good.

This mirrors what the cloud path already does with `GEMINI_MODEL` /
`GEMINI_MODEL_LIVE` (analytic Flash for prep, Flash-Lite for the turn loop).

```bash
OLLAMA_MODEL=qwen3:8b          # prep + scoring: quality
OLLAMA_MODEL_LIVE=qwen3:1.7b   # turn loop: latency
```

**Blank is the default, and that is deliberate.** Unlike a cloud tier, the live
model has to already be pulled on your machine — a default you never pulled
would 404 every turn. Blank means "same model as prep", so nothing changes until
you opt in. `ollama pull` the smaller model first, then set it.

The trade is real in both directions: a smaller live model is quicker to speak
but calls the `save_answer` tool less reliably (see §4). The shutdown-time
transcript recovery catches that, so the report stays correct — but if you go
very small, check the worker log for `recovered N answer(s) from transcript`.

---

## 3. Known differences from the cloud path

These are consequences of the design, not bugs. They are listed here so the
local path isn't oversold.

| | Cloud path | Local path |
|---|---|---|
| **Live captions** | word-by-word | **per utterance** — the OpenAI-compatible STT is a batch endpoint, so the worker VAD-segments your speech and transcribes each chunk. There are no interim results. |
| **Barge-in** | word-gated on interim transcripts | fires later, since the gate can only run once a whole utterance is transcribed |
| **Voice languages** | 7+, incl. Vietnamese | **Kokoro has no Vietnamese voice.** A `vi` session with `TTS_PROVIDER=kokoro` honestly falls through to a cloud voice rather than reading Vietnamese with an American accent. Kokoro covers en, ja, zh, es, fr, hi, it, pt. |
| **Turn latency** | tuned and measured | **not benchmarked.** It depends heavily on your hardware and model size. `OLLAMA_MODEL_LIVE` is the lever — a smaller model on the turn loop only (see §2). |
| **CI coverage** | mock adapters, every PR | the local path is **maintainer-verified, not CI-tested** — CI has no models. |

Because Kokoro encodes the language in the voice-id prefix (`af_`/`am_` = American
English, `bf_` = British, `jf_` = Japanese, `zf_` = Chinese, `ef_` = Spanish,
`ff_` = French, `hf_` = Hindi, `if_` = Italian, `pf_` = Portuguese), picking a
voice *is* picking a language. Leave `KOKORO_VOICE` blank and the session
language chooses; set it to pin one.

---

## 4. What we verified

On an Apple M5 Pro (24 GB), Ollama 0.32.5 + `qwen3:8b`, Speaches
(`faster-whisper-small`) and kokoro-fastapi, all on CPU/Metal locally:

- **Prep → question plan on the local LLM: 121s.** Six questions, difficulty
  ramping 1→5, each grounded in the specific CV and job description — it asked
  about Postgres logical replication from the CV and Rust from the JD — with
  zero degraded stages and no fallback to the generic plan.
- **TTS → STT round trip through the real worker builders.** Kokoro synthesized
  *"Tell me about a hard bug you fixed in a payment system."* into 3.25s of PCM
  at 24 kHz, and the Whisper server transcribed that audio back **verbatim**.
  This exercises the exact code path the live worker uses, so it rules out both
  silent failure modes (the no-audio SSE branch and an empty transcript).
- Provider selection, fallback, and the language/voice routing are covered by
  unit tests that run with no models installed.

- **A live microphone interview, end to end.** A real LiveKit session with a
  human speaking: the agent spoke in Kokoro's voice, the local Whisper server
  returned real transcripts, and the report rendered `complete` — with zero
  recognition failures and zero stages falling back to a cloud provider.

**One thing to expect with small local models.** In that run `qwen3:8b` did not
reliably call the `save_answer` tool mid-interview, so the worker's shutdown-time
transcript recovery supplied the answer instead. The report was still correct —
that safety net is pre-existing and is exactly what it's for — but a local model
leans on it more than Gemini or GPT do. If your report looks thin, check the
worker log for `recovered N answer(s) from transcript`; a larger model calls the
tool more consistently.

**Not verified, and therefore not claimed:** turn latency and barge-in feel are
not benchmarked. Non-English local voice is untested, as is any hardware other
than the above.

## 5. When it goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| Interview asks one question titled **"mock"** | the model's JSON didn't parse, so the planner fell back | check the agent log for `question_planner failed, using minimal generic plan`; try a larger model |
| A plausible plan that mentions **nothing from your CV** | context window truncated the prompt | set `OLLAMA_CONTEXT_LENGTH=16384` |
| Agent **never speaks**, no error | `KOKORO_MODEL` isn't `tts-1` | set it back; check the worker log for the coercion warning |
| Speech is **chipmunk or slow-motion** | your TTS server isn't returning 24 kHz audio | the plugin decodes at a fixed 24 kHz; Kokoro's native rate already matches |
| Agent **never hears you** | Whisper server unreachable or rejecting requests | the worker refuses to start a session against an unreachable local server and names the URL + env var; check that error first |
| `failed to recognize speech after N attempts` in the worker log | transcription exceeded the plugin's fixed 30s ceiling — almost always too large a Whisper model, or memory pressure in the Docker VM | drop to `WHISPER_MODEL=Systran/faster-whisper-base` (or `tiny.en`); check `docker stats` for a server holding multiple GB, and raise Docker Desktop's memory allocation |
| Turns die after ~10s | per-request ceiling | handled automatically — selecting any local provider widens it to 30s (`LOCAL_PROVIDER_TIMEOUT_SEC`) |

---

## Related work

If you want a **pure local voice pipeline** rather than a full interview
platform, look at [`huggingface/speech-to-speech`](https://github.com/huggingface/speech-to-speech)
(Apache-2.0) — Hugging Face's cascaded VAD → STT → LLM → TTS stack, with MLX
support on Apple Silicon and an OpenAI Realtime-compatible WebSocket API. It is
the closest sibling to this page's setup and a great starting point if you're
assembling your own local speech loop.

It is **not** wired in as a provider here, and the reason is worth stating: it
exposes only a complete speech-to-speech session (`/v1/realtime`) — no
`/v1/audio/transcriptions`, no `/v1/audio/speech`, and no way to disable its LLM
stage. DeepInterview needs to own the LLM turn itself (the interviewer calls
`save_answer` / `get_next_question`, and an adaptive Director sits behind it), so
a black-box pipeline that answers for us can't slot into the cascade. If it ever
grows a transcription-only session mode, it would drop straight into
`STT_PROVIDER`.

---

## Compatibility: the adapter follows a contract, not a vendor

Each stage talks to **one OpenAI-format endpoint over a base URL**. Anything that
speaks that shape works — swapping the server means changing a URL and a model
name, never code. The provider value is case-insensitive and takes aliases, so
you can name what you actually run (or just say `local`).

| Stage | Endpoint the adapter calls | Accepted `*_PROVIDER` values | Known-working servers |
|---|---|---|---|
| **LLM** | `POST /v1/chat/completions` | `ollama` · `vllm` · `llamacpp` · `lmstudio` · `local` | Ollama *(verified)*, vLLM, LM Studio, llama.cpp, LocalAI |
| **STT** | `POST /v1/audio/transcriptions` | `whisper` · `faster-whisper` · `qwen3-asr` · `qwen-asr` · `speaches` · `local` | Speaches / faster-whisper *(verified)*, **Qwen3-ASR**, whisper.cpp server, vLLM |
| **TTS** | `POST /v1/audio/speech` | `kokoro` · `local` | kokoro-fastapi *(verified)* |

*(verified)* means it was run end to end for the v0.3.0 release; the others
implement the same endpoint but haven't been exercised here.

### The contract also reaches remote gateways

"OpenAI-format endpoint over a base URL" doesn't have to mean *local*. Point
`OLLAMA_BASE_URL` at a hosted OpenAI-compatible gateway — OpenRouter, Together,
Groq, your own vLLM box — and the same `ollama`/`vllm`/`local` providers drive it
unchanged. You trade the privacy property for someone else's GPU: prompts (CV
text, JD, answers) leave your machine.

That path has its own failure modes worth reading before you debug them — free
model slugs that rate-limit, and reasoning models that emit chain-of-thought
*before* the JSON the prep pipeline parses, which degrades the question plan to a
generic one without erroring. Both, plus what still works on a **CPU-only
machine** that can't run the live voice stack, are covered in
[`OPENROUTER_AND_CPU_ONLY.md`](OPENROUTER_AND_CPU_ONLY.md).

### Qwen3-ASR instead of Whisper

[Qwen3-ASR](https://github.com/QwenLM/Qwen3-ASR) (Alibaba, 52 languages) is a
strong alternative — particularly for non-English sessions, where Whisper's
smaller checkpoints weaken. Community servers wrap it behind the same
OpenAI-compatible `/v1/audio/transcriptions` route, and vLLM supports it
natively, so it drops in with no code change:

```bash
STT_PROVIDER=qwen3-asr
WHISPER_BASE_URL=http://localhost:8001/v1     # wherever you serve it
WHISPER_MODEL=Qwen/Qwen3-ASR-1.7B
```

The same 30-second-per-request ceiling applies, so check your throughput on your
own hardware before committing to it for live interviews.

### Adding a stage your server does differently

If a server deviates from the OpenAI shape, the change is contained to one
builder in `apps/agent/src/deepinterview_agent/worker.py`
(`_local_whisper_stt`, `_local_kokoro_tts`, `build_llm`) plus `get_llm` in
`core/adapters/llm.py` for the prep/scoring path. Everything else — provider
selection, preflight, timeouts, language routing — is already stage-generic.
