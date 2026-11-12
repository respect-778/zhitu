import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { gateRequest } from "@deepinterview/ee";
import { presignUpload } from "@/lib/r2";
import { isR2Configured, isSupabaseConfigured } from "@/lib/env";
import { getUser } from "@/lib/supabase/server";

// CV uploads only. Allowlist the document types the prep extractor can read
// (markitdown handles PDF/DOCX); reject everything else so the bucket can't be
// used as open file hosting.
const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/x-pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "text/markdown",
]);

// Hard ceiling on a presigned CV upload (bytes). A résumé is a few hundred KB;
// 10 MB is generous headroom without inviting storage abuse.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const BodySchema = z.object({
  filename: z.string().min(1),
  content_type: z.string().min(1),
  // Client reports the byte size so we can bound it and bind it into the
  // signature; the presigned PUT then has to match it exactly.
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

export async function POST(request: Request) {
  // Presigned uploads cost storage and are a classic abuse target. When
  // Supabase is configured (hosted), require a signed-in user — mirroring the
  // interview token path — before handing out a PUT URL. The distribution gate
  // (no-op in OSS) adds the required-auth check for closed distributions.
  const user = await getUser();
  if (isSupabaseConfigured() && !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const gate = gateRequest({
    pathname: "/api/upload",
    isAuthenticated: Boolean(user),
  });
  if (!gate.allow) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const normalizedType = (body.content_type.split(";", 1)[0] ?? "")
    .trim()
    .toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.has(normalizedType)) {
    return NextResponse.json(
      { error: "Unsupported file type. Upload a PDF, DOCX, or text CV." },
      { status: 415 },
    );
  }

  if (!isR2Configured()) {
    return NextResponse.json({ error: "R2 not configured" }, { status: 501 });
  }

  // Random, unguessable key segment (not a millisecond timestamp) so an
  // uploaded CV can't be found by guessing the URL. Strip path separators from
  // the display name we keep for readability.
  const safeName = body.filename.replace(/[/\\]/g, "_").slice(0, 100);
  const key = `uploads/${randomUUID()}-${safeName}`;

  // Sign the exact content-type the client will PUT (so the signature matches);
  // the allowlist check above ran on its normalized form.
  const result = await presignUpload(key, body.content_type, body.size);
  return NextResponse.json(result);
}
