"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMessages } from "@/lib/i18n/client";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/cn";

type Status = "idle" | "requesting" | "ok" | "denied" | "unsupported";

/**
 * Microphone check. Requests `getUserMedia({audio:true})`, renders a live input
 * level meter from an AudioContext AnalyserNode, and reports pass/fail. All
 * browser-API access happens inside handlers/effects (never at render) so the
 * component SSRs cleanly. Streams + AudioContext are torn down on unmount.
 */
export function DeviceCheck() {
  const messages = useMessages();
  const [status, setStatus] = useState<Status>("idle");
  const [level, setLevel] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef(false);

  const teardown = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  // Always clean up on unmount.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      teardown();
    };
  }, [teardown]);

  const start = useCallback(async () => {
    // Feature-detect: absent on insecure (non-HTTPS) origins / old browsers.
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setStatus("unsupported");
      return;
    }
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;

      type WindowWithWebkit = Window & {
        webkitAudioContext?: typeof AudioContext;
      };
      const Ctor =
        window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext;
      if (!Ctor) {
        // Mic works but no metering API — still a pass.
        setStatus("ok");
        return;
      }
      const ctx = new Ctor();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        // RMS deviation from the 128 midpoint → 0..1 input level.
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = ((data[i] ?? 128) - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setLevel(Math.min(1, rms * 2.4));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      setStatus("ok");
    } catch {
      teardown();
      if (mountedRef.current) setStatus("denied");
    }
  }, [teardown]);

  const bars = 16;
  const lit = Math.round(level * bars);

  // Release the mic after a pass (or on demand): without this the browser's
  // recording indicator stays lit while the user fills the rest of the form.
  function stop() {
    teardown();
    setLevel(0);
    setStatus("idle");
  }

  const statusText =
    status === "ok"
      ? t(messages, "setup.micWorking")
      : status === "requesting"
        ? t(messages, "setup.micRequesting")
        : status === "denied"
          ? t(messages, "setup.micDenied")
          : status === "unsupported"
            ? t(messages, "setup.micUnsupported")
            : t(messages, "setup.micIdle");

  return (
    <div className="rounded-[10px] border border-line bg-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2" role="status">
          {status === "ok" ? (
            <CheckCircle2 className="h-4 w-4 text-ok" aria-hidden />
          ) : status === "denied" || status === "unsupported" ? (
            <MicOff className="h-4 w-4 text-muted" aria-hidden />
          ) : (
            <Mic className="h-4 w-4 text-muted" aria-hidden />
          )}
          <span className="text-[13px] text-ink-soft">{statusText}</span>
        </div>
        {status === "ok" ? (
          <div className="flex items-center gap-2">
            <Badge variant="ok">{t(messages, "setup.micPassed")}</Badge>
            <Button type="button" variant="ghost" size="sm" onClick={stop}>
              {t(messages, "setup.micStop")}
            </Button>
          </div>
        ) : status === "denied" || status === "unsupported" ? (
          <Badge variant="outline">{t(messages, "setup.micFailed")}</Badge>
        ) : (
          <Button
            type="button"
            variant="out"
            size="sm"
            onClick={start}
            disabled={status === "requesting"}
          >
            {t(messages, "setup.micTest")}
          </Button>
        )}
      </div>

      {status === "ok" && (
        <div
          className="mt-3 flex h-6 items-end gap-1"
          aria-hidden
          role="presentation"
        >
          {Array.from({ length: bars }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "w-1.5 flex-1 rounded-sm transition-colors",
                i < lit ? "bg-accent" : "bg-line",
              )}
              style={{ height: `${20 + (i / bars) * 80}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
