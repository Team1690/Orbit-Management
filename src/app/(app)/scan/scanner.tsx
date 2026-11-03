"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { checkInWithScan, type ScanResult } from "@/actions/presence";
import { CheckIcon, XIcon } from "@/components/icons";

type Phase = { kind: "starting" } | { kind: "scanning" } | { kind: "checking" } | { kind: "done"; result: ScanResult } | { kind: "error"; message: string };

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

// Uses the camera inside the app (iPhone and Android), so the installed app's login is used.
// BarcodeDetector is fast where it exists (Android Chrome); jsQR covers Safari on iPhone.
export function Scanner() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });
  const [attempt, setAttempt] = useState(0);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPhase({
          kind: "error",
          message: window.isSecureContext
            ? "This browser can't use the camera. Scan the code with your phone's camera app instead."
            : "The camera only works over a secure (https) connection. Scan the code with your phone's camera app instead.",
        });
        return;
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch {
        setPhase({ kind: "error", message: "Camera access was blocked. Allow camera access for this app in your phone's settings, then try again." });
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => {});
      setPhase({ kind: "scanning" });

      const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      const detector = Ctor ? new Ctor({ formats: ["qr_code"] }) : null;
      const jsQR = detector ? null : (await import("jsqr")).default;
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

      const scan = async () => {
        if (cancelled) return;
        let text: string | null = null;
        if (video.readyState >= 2 && video.videoWidth > 0) {
          try {
            if (detector) {
              text = (await detector.detect(video))[0]?.rawValue ?? null;
            } else if (jsQR) {
              const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
              canvas.width = Math.round(video.videoWidth * scale);
              canvas.height = Math.round(video.videoHeight * scale);
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              text = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
            }
          } catch {
            text = null;
          }
        }
        if (text && !cancelled) {
          stopCamera();
          setPhase({ kind: "checking" });
          const result = await checkInWithScan(text);
          if (!cancelled) setPhase({ kind: "done", result });
          return;
        }
        timer = setTimeout(scan, 150);
      };
      scan();
    }

    start();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      stopCamera();
    };
  }, [attempt, stopCamera]);

  const retry = () => {
    setPhase({ kind: "starting" });
    setAttempt((a) => a + 1);
  };

  if (phase.kind === "done" || phase.kind === "error") {
    const ok = phase.kind === "done" && phase.result.ok;
    const message = phase.kind === "done" ? phase.result.message : phase.message;
    return (
      <div className="card flex flex-col items-center p-8 text-center">
        <span className={`flex size-16 items-center justify-center rounded-full ${ok ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"}`}>
          {ok ? <CheckIcon width={34} height={34} /> : <XIcon width={34} height={34} />}
        </span>
        <p className="mt-4 text-lg font-semibold">{ok ? "You're in!" : "Didn't work"}</p>
        <p className="mt-1 text-sm text-slate-600">{message}</p>
        <div className="mt-6 flex w-full gap-2">
          {ok ? (
            <button
              type="button"
              className="btn btn-primary flex-1"
              onClick={() => {
                router.push("/");
                router.refresh();
              }}
            >
              Done
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-primary flex-1" onClick={retry}>
                Try again
              </button>
              <Link href="/" className="btn btn-secondary">
                Home
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-3xl bg-black shadow-lg">
      <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="size-3/5 rounded-3xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      </div>
      <div className="absolute inset-x-0 bottom-0 p-4 text-center text-sm font-medium text-white">
        {phase.kind === "starting" && "Starting camera…"}
        {phase.kind === "scanning" && "Looking for the code…"}
        {phase.kind === "checking" && "Checking you in…"}
      </div>
    </div>
  );
}
