import { existsSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import {
  intro,
  outro,
  select,
  text,
  password,
  confirm,
  isCancel,
  cancel,
  note,
  log,
} from "@clack/prompts";
import { LANGUAGES } from "@deepinterview/shared";
import { parseEnv, renderEnv } from "../lib/env-template";

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, ".env.example"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

/** Show a secret as ••••last4 — never echo a key back in full. */
function mask(value: string): string {
  if (!value) return "(empty)";
  return value.length <= 4 ? "••••" : `••••${value.slice(-4)}`;
}

function isSecretKey(key: string): boolean {
  return /(KEY|SECRET|TOKEN)/.test(key) && !key.endsWith("_PROVIDER");
}

/** Abort cleanly when the user hits Ctrl-C / Esc at any prompt. */
function ensure<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel("Setup cancelled — no files were written.");
    process.exit(0);
  }
  return value as T;
}

/** Ask for a secret, offering to keep an already-configured value. */
async function secret(
  label: string,
  existing: string | undefined,
): Promise<string> {
  if (existing) {
    const keep = ensure(
      await confirm({
        message: `${label} is already set (${mask(existing)}). Keep it?`,
        initialValue: true,
      }),
    );
    if (keep) return existing;
  }
  const value = ensure(
    await password({
      message: `${label}${existing ? " — new value" : " (leave blank to skip)"}`,
    }),
  );
  return value ?? "";
}

/** Ask for a plain (non-secret) value, prefilled with any existing one. */
async function field(
  label: string,
  existing: string | undefined,
  placeholder = "",
): Promise<string> {
  const value = ensure(
    await text({ message: label, placeholder, initialValue: existing ?? "" }),
  );
  return (value ?? "").trim();
}

type Values = Record<string, string>;

async function collectLlm(existing: Values, values: Values): Promise<void> {
  const provider = ensure(
    await select({
      message: "LLM provider (prep questions, scoring, live answers)",
      initialValue: existing.LLM_PROVIDER || "gemini",
      options: [
        { value: "gemini", label: "Google Gemini", hint: "default" },
        { value: "openai", label: "OpenAI" },
        { value: "ollama", label: "Ollama (local)", hint: "no key" },
        { value: "mock", label: "Mock — offline, no key" },
      ],
    }),
  );
  values.LLM_PROVIDER = provider;
  if (provider === "gemini") {
    values.GEMINI_API_KEY = await secret(
      "Gemini API key",
      existing.GEMINI_API_KEY,
    );
  } else if (provider === "openai") {
    values.OPENAI_API_KEY = await secret(
      "OpenAI API key",
      existing.OPENAI_API_KEY,
    );
  } else if (provider === "ollama") {
    // Local servers authenticate with nothing — a base URL replaces the key.
    values.OLLAMA_BASE_URL = await field(
      "Ollama base URL",
      existing.OLLAMA_BASE_URL,
      "http://localhost:11434/v1",
    );
    values.OLLAMA_MODEL = await field(
      "Ollama model",
      existing.OLLAMA_MODEL || "qwen3:8b",
      "qwen3:8b",
    );
    // Optional second tier for the turn loop. Blank stays blank: the worker
    // reads that as "same model as prep", and a model the user has not pulled
    // would 404 every turn.
    values.OLLAMA_MODEL_LIVE = await field(
      "Live-interview model (optional — blank = same as above; a smaller one answers faster)",
      existing.OLLAMA_MODEL_LIVE ?? "",
      "e.g. qwen3:1.7b",
    );
  }
}

async function collectStt(existing: Values, values: Values): Promise<void> {
  const provider = ensure(
    await select({
      message: "Speech-to-text provider",
      initialValue: existing.STT_PROVIDER || "deepgram",
      options: [
        {
          value: "deepgram",
          label: "Deepgram",
          hint: "nova-3, the tested path",
        },
        { value: "soniox", label: "Soniox" },
        { value: "whisper", label: "Whisper (local)", hint: "no key" },
      ],
    }),
  );
  values.STT_PROVIDER = provider;
  if (provider === "whisper") {
    values.WHISPER_BASE_URL = await field(
      "Whisper server base URL (OpenAI-compatible)",
      existing.WHISPER_BASE_URL,
      "http://localhost:8000/v1",
    );
    return;
  }
  const key = provider === "deepgram" ? "DEEPGRAM_API_KEY" : "SONIOX_API_KEY";
  values[key] = await secret(`${provider} API key`, existing[key]);
}

async function collectTts(existing: Values, values: Values): Promise<void> {
  const provider = ensure(
    await select({
      message: "Text-to-speech provider",
      initialValue: existing.TTS_PROVIDER || "cartesia",
      options: [
        { value: "cartesia", label: "Cartesia", hint: "default" },
        { value: "elevenlabs", label: "ElevenLabs" },
        { value: "kokoro", label: "Kokoro (local)", hint: "no key" },
      ],
    }),
  );
  values.TTS_PROVIDER = provider;
  if (provider === "kokoro") {
    values.KOKORO_BASE_URL = await field(
      "Kokoro base URL (OpenAI-compatible)",
      existing.KOKORO_BASE_URL,
      "http://localhost:8880/v1",
    );
    // Pinned, not asked: this id selects the raw-audio transport in the
    // OpenAI plugin. Any other value silently yields no audio at all.
    values.KOKORO_MODEL = "tts-1";
    return;
  }
  const key =
    provider === "cartesia" ? "CARTESIA_API_KEY" : "ELEVENLABS_API_KEY";
  values[key] = await secret(`${provider} API key`, existing[key]);
}

async function collectLiveKit(existing: Values, values: Values): Promise<void> {
  values.LIVEKIT_URL = await field(
    "LiveKit URL (wss://your-project.livekit.cloud)",
    existing.LIVEKIT_URL,
    "wss://…",
  );
  values.LIVEKIT_API_KEY = await secret(
    "LiveKit API key",
    existing.LIVEKIT_API_KEY,
  );
  values.LIVEKIT_API_SECRET = await secret(
    "LiveKit API secret",
    existing.LIVEKIT_API_SECRET,
  );
}

async function collectSearch(existing: Values, values: Values): Promise<void> {
  const provider = ensure(
    await select({
      message: "Company research (web search for interview intel)",
      initialValue: existing.SEARCH_PROVIDER || "tavily",
      options: [
        { value: "tavily", label: "Tavily" },
        { value: "exa", label: "Exa" },
        { value: "mock", label: "Mock — offline, no real research" },
      ],
    }),
  );
  values.SEARCH_PROVIDER = provider;
  if (provider === "tavily") {
    values.TAVILY_API_KEY = await secret(
      "Tavily API key",
      existing.TAVILY_API_KEY,
    );
  } else if (provider === "exa") {
    values.EXA_API_KEY = await secret("Exa API key", existing.EXA_API_KEY);
  }
}

async function collectSupabase(
  existing: Values,
  values: Values,
): Promise<void> {
  const use = ensure(
    await confirm({
      message:
        "Configure Supabase (sign-in, file storage, saved reports)? The OSS app runs fine without it.",
      initialValue: Boolean(existing.SUPABASE_URL),
    }),
  );
  if (!use) return;
  const url = await field(
    "Supabase project URL (https://xxxx.supabase.co)",
    existing.SUPABASE_URL,
    "https://…supabase.co",
  );
  values.SUPABASE_URL = url;
  // The browser auth client reads the NEXT_PUBLIC_-prefixed name; it's the same URL.
  values.NEXT_PUBLIC_SUPABASE_URL = url;
  values.SUPABASE_SERVICE_ROLE_KEY = await secret(
    "Supabase service-role key",
    existing.SUPABASE_SERVICE_ROLE_KEY,
  );
  values.NEXT_PUBLIC_SUPABASE_ANON_KEY = await secret(
    "Supabase anon (public) key",
    existing.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

async function runWizard(existing: Values): Promise<Values> {
  const values: Values = {};
  const mode = ensure(
    await select({
      message: "What do you want to run?",
      options: [
        {
          value: "voice",
          label: "Live voice interview",
          hint: "real STT + AI + TTS + LiveKit",
        },
        {
          value: "prep",
          label: "Prep + scoring only",
          hint: "real AI, no microphone",
        },
        {
          value: "local",
          label: "100% local models",
          hint: "Ollama + Whisper + Kokoro — no model keys",
        },
        {
          value: "offline",
          label: "Offline demo",
          hint: "zero keys — mock providers",
        },
      ],
    }),
  );

  if (mode === "local") {
    values.LLM_PROVIDER = "ollama";
    values.STT_PROVIDER = "whisper";
    values.TTS_PROVIDER = "kokoro";
    // Company research is the one remaining outbound call; keep it offline so
    // "no data leaves your machine" is actually true in this mode.
    values.SEARCH_PROVIDER = "mock";
    values.EMBEDDINGS_PROVIDER = "mock";
    // Local models are slower; the cloud defaults (90s/60s) time out and
    // silently degrade prep and scoring to generic results.
    values.LLM_CALL_TIMEOUT_SEC = "300";
    values.SCORE_STAGE_TIMEOUT_SEC = "300";
    values.OLLAMA_BASE_URL = await field(
      "Ollama base URL",
      existing.OLLAMA_BASE_URL,
      "http://localhost:11434/v1",
    );
    values.OLLAMA_MODEL = await field(
      "Ollama model",
      existing.OLLAMA_MODEL || "qwen3:8b",
      "qwen3:8b",
    );
    // Optional second tier for the turn loop. Blank stays blank: the worker
    // reads that as "same model as prep", and a model the user has not pulled
    // would 404 every turn.
    values.OLLAMA_MODEL_LIVE = await field(
      "Live-interview model (optional — blank = same as above; a smaller one answers faster)",
      existing.OLLAMA_MODEL_LIVE ?? "",
      "e.g. qwen3:1.7b",
    );
    values.WHISPER_BASE_URL = await field(
      "Whisper server base URL (OpenAI-compatible)",
      existing.WHISPER_BASE_URL,
      "http://localhost:8000/v1",
    );
    values.KOKORO_BASE_URL = await field(
      "Kokoro base URL (OpenAI-compatible)",
      existing.KOKORO_BASE_URL,
      "http://localhost:8880/v1",
    );
    values.KOKORO_MODEL = "tts-1";
    note(
      "Every model runs on your machine — no LLM, STT or TTS keys.\n" +
        "LiveKit is still the real-time transport: use LiveKit Cloud, or run\n" +
        "`livekit-server --dev` locally for a fully offline stack.\n" +
        "See docs/LOCAL_MODELS.md for the model-server setup.",
      "100% local models",
    );
    await collectLiveKit(existing, values);
    await collectSupabase(existing, values);
    return values;
  }

  if (mode === "offline") {
    values.LLM_PROVIDER = "mock";
    values.SEARCH_PROVIDER = "mock";
    note(
      "The full stack runs on deterministic mock providers — no keys needed.\nThe live voice worker is not used in this mode.",
      "Offline demo",
    );
    return values;
  }

  await collectLlm(existing, values);
  if (mode === "voice") {
    await collectStt(existing, values);
    await collectTts(existing, values);
    await collectLiveKit(existing, values);
  }
  await collectSearch(existing, values);
  await collectSupabase(existing, values);
  return values;
}

function summarize(values: Values): string {
  return Object.keys(values)
    .map((key) => {
      const value = values[key] ?? "";
      const shown = isSecretKey(key) ? mask(value) : value || "(empty)";
      return `${key}=${shown}`;
    })
    .join("\n");
}

/** Overwrite an app-local copy from the freshly written root .env. */
function writeAppCopy(source: string, target: string, root: string): void {
  const label = relative(root, target);
  if (!existsSync(dirname(target))) {
    log.warn(`Skipped ${label} (directory not found)`);
    return;
  }
  copyFileSync(source, target);
  log.success(`Synced ${label}`);
}

function nextSteps(values: Values): string {
  const lines = [
    "Next steps:",
    "  docker compose up            # full stack with the keys you just set",
    "  (or) pnpm dev                # web :3000 + agent API :8000",
  ];
  if (values.STT_PROVIDER || values.LIVEKIT_URL) {
    lines.push(
      "  docker compose --profile live up   # add the live voice worker",
    );
  }
  lines.push(
    "",
    "Re-run `deepinterview init` anytime — existing values are offered as defaults.",
  );
  return lines.join("\n");
}

/**
 * Non-interactive fallback (CI, piped stdin, `--no-input`): keep the original
 * copy-from-template behaviour so scripted setups and the local-dev copies still
 * work without a TTY. The interactive key wizard runs only on a real terminal.
 */
function runNonInteractive(
  root: string,
  example: string,
  target: string,
  force: boolean,
): void {
  if (existsSync(target) && !force) {
    console.error(
      ".env already exists — re-run with --force to re-sync the local-dev " +
        "copies (apps/agent/.env, apps/web/.env.local), or run `deepinterview " +
        "init` in a terminal for the interactive key wizard.",
    );
    process.exit(1);
  }
  if (!existsSync(target)) {
    copyFileSync(example, target);
    console.log(
      `✓ Wrote ${target} from .env.example (non-interactive). Fill in keys, or ` +
        "run `deepinterview init` in a terminal for the guided wizard.",
    );
  } else {
    console.log(`✓ Kept ${target} (sync source — your keys are preserved)`);
  }
  syncCopy(target, join(root, "apps", "agent", ".env"), root, force);
  syncCopy(target, join(root, "apps", "web", ".env.local"), root, force);
  console.log(
    `\nDeepInterview supports ${LANGUAGES.length} languages (English-first).`,
  );
}

/** Copy the root .env into an app-local copy (create-if-missing; --force to overwrite). */
function syncCopy(
  source: string,
  target: string,
  root: string,
  force: boolean,
): void {
  const label = relative(root, target);
  if (!existsSync(dirname(target))) {
    console.log(`- Skipped ${label} (directory not found)`);
    return;
  }
  if (existsSync(target) && !force) {
    console.log(`- Kept existing ${label} (use --force to overwrite)`);
    return;
  }
  copyFileSync(source, target);
  console.log(`✓ Wrote ${label}`);
}

export async function runInit(args: string[]): Promise<void> {
  const force = args.includes("--force");
  const noInput = args.includes("--no-input") || args.includes("--yes");
  const root = findRepoRoot(process.cwd());
  const example = join(root, ".env.example");
  const target = join(root, ".env");

  if (!existsSync(example)) {
    console.error(`Could not find .env.example near ${root}`);
    process.exit(1);
  }

  const interactive = Boolean(process.stdin.isTTY) && !noInput;
  if (!interactive) {
    runNonInteractive(root, example, target, force);
    return;
  }

  const template = readFileSync(example, "utf8");
  const existing = existsSync(target)
    ? parseEnv(readFileSync(target, "utf8"))
    : {};

  intro("DeepInterview setup");
  if (Object.keys(existing).length > 0) {
    log.info(
      "Found an existing .env — current values are offered as defaults.",
    );
  }

  const values = await runWizard(existing);
  note(summarize(values), "Will write to .env");
  const go = ensure(
    await confirm({
      message: "Write .env and sync the local-dev copies?",
      initialValue: true,
    }),
  );
  if (!go) {
    cancel("Nothing written.");
    process.exit(0);
  }

  const merged = { ...existing, ...values };
  writeFileSync(target, `${renderEnv(template, merged)}\n`);
  log.success(`Wrote ${relative(root, target)}`);
  writeAppCopy(target, join(root, "apps", "agent", ".env"), root);
  writeAppCopy(target, join(root, "apps", "web", ".env.local"), root);

  outro(nextSteps(values));
}
