"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type TouchList } from "react";
import { checkInWithScan, type ScanResult } from "@/actions/presence";
import { CheckIcon, XIcon } from "@/components/icons";

type Phase = { kind: "starting" } | { kind: "scanning" } | { kind: "checking" } | { kind: "done"; result: ScanResult } | { kind: "error"; message: string };

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;
/** The camera's own zoom range, where the phone offers one (most Android phones). */
type CameraZoom = { min: number; max: number };

/** Zoom buttons; pinching picks anything in between. */
const ZOOM_STEPS = [1, 2, 3, 4];
/** Without camera zoom the picture is enlarged digitally, which stops helping beyond this. */
const DIGITAL_MAX = 4;
const CAMERA_MAX = 8;

function fingerDistance(t: TouchList) {
  return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
}

// Uses the camera inside the app (iPhone and Android), so the installed app's login is used.
// BarcodeDetector is fast where it exists (Android Chrome); jsQR covers Safari on iPhone.
// Zoom (buttons or pinch) uses the camera's own zoom where there is one. Otherwise it enlarges the
// picture and only the middle of the frame is searched, at full resolution, which reads far-away codes.
export function Scanner() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });
  const [attempt, setAttempt] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [cameraZoom, setCameraZoom] = useState<CameraZoom | null>(null);
  // The scan loop reads these without restarting the camera.
  const zoomRef = useRef(1);
  const cameraZoomRef = useRef<CameraZoom | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const applyZoom = useCallback((wanted: number, force = false) => {
    const cam = cameraZoomRef.current;
    const max = cam ? Math.min(cam.max, CAMERA_MAX) : DIGITAL_MAX;
    const value = Math.round(Math.min(max, Math.max(1, wanted)) * 10) / 10;
    if (value === zoomRef.current && !force) return;
    zoomRef.current = value;
    setZoom(value);
    const track = streamRef.current?.getVideoTracks()[0];
    if (cam && track) {
      const constraint = { zoom: Math.min(cam.max, Math.max(cam.min, value)) } as MediaTrackConstraintSet;
      track.applyConstraints({ advanced: [constraint] }).catch(() => {});
    }
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
        // High resolution so a code on a far-away screen still has enough pixels to read.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
      } catch {
        setPhase({ kind: "error", message: "Camera access was blocked. Allow camera access for this app in your phone's settings, then try again." });
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as { zoom?: CameraZoom };
      const cam = caps.zoom && caps.zoom.max >= 2 ? { min: caps.zoom.min, max: caps.zoom.max } : null;
      cameraZoomRef.current = cam;
      setCameraZoom(cam);
      if (zoomRef.current > 1) applyZoom(zoomRef.current, true);

      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => {});
      setPhase({ kind: "scanning" });

      const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      const detector = Ctor ? new Ctor({ formats: ["qr_code"] }) : null;
      const jsQR = detector ? null : (await import("jsqr")).default;
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

      // Without zoom the whole frame is searched, so a code anywhere on screen counts. On iPhones (jsQR)
      // every other try also reads the middle of the view at full resolution, which catches small codes.
      let frame = 0;
      const scan = async () => {
        if (cancelled) return;
        let text: string | null = null;
        if (video.readyState >= 2 && video.videoWidth > 0) {
          try {
            const digital = cameraZoomRef.current ? 1 : zoomRef.current;
            if (detector && digital === 1) {
              text = (await detector.detect(video))[0]?.rawValue ?? null;
            } else {
              const vw = video.videoWidth;
              const vh = video.videoHeight;
              const middle = !detector && frame++ % 2 === 1;
              // The part of the frame on screen (digital zoom), or the middle 60% of it.
              const factor = digital / (middle ? 0.6 : 1);
              const sw = Math.round(vw / factor);
              const sh = Math.round(vh / factor);
              // jsQR: at most 1080 px. BarcodeDetector: enlarge a small crop so the code has room.
              const scale = Math.min(detector ? 2 : 1, 1080 / Math.max(sw, sh));
              canvas.width = Math.round(sw * scale);
              canvas.height = Math.round(sh * scale);
              ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
              if (detector) {
                text = (await detector.detect(canvas))[0]?.rawValue ?? null;
              } else if (jsQR) {
                const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
                text = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
              }
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
  }, [attempt, stopCamera, applyZoom]);

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

  const maxZoom = cameraZoom ? Math.min(cameraZoom.max, CAMERA_MAX) : DIGITAL_MAX;
  return (
    <div
      className="relative touch-pan-y overflow-hidden rounded-3xl bg-black shadow-lg select-none"
      onTouchStart={(e) => {
        if (e.touches.length === 2) pinchRef.current = { distance: fingerDistance(e.touches), zoom: zoomRef.current };
      }}
      onTouchMove={(e) => {
        const pinch = pinchRef.current;
        if (pinch && e.touches.length === 2) applyZoom((pinch.zoom * fingerDistance(e.touches)) / pinch.distance);
      }}
      onTouchEnd={(e) => {
        if (e.touches.length < 2) pinchRef.current = null;
      }}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        className="aspect-[3/4] w-full object-cover transition-transform duration-150"
        style={cameraZoom ? undefined : { transform: `scale(${zoom})` }}
      />
      <canvas ref={canvasRef} className="hidden" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {/* A large guide: the code can be anywhere inside it (or even outside it). */}
        <div className="aspect-square w-[85%] rounded-3xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
      </div>
      {phase.kind === "scanning" && (
        <>
          {/* In the strip above the guide, clear of the code and of the status line. */}
          {!ZOOM_STEPS.includes(zoom) && (
            <div className="absolute top-3.5 right-3 rounded-full bg-black/50 px-2 py-1 text-xs font-semibold text-white tabular-nums">{zoom.toFixed(1)}×</div>
          )}
          <div className="absolute inset-x-0 top-2 flex justify-center gap-2">
            {ZOOM_STEPS.filter((z) => z <= maxZoom).map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => applyZoom(z)}
                aria-label={`Zoom ${z}×`}
                aria-pressed={zoom === z}
                className={`flex size-11 items-center justify-center rounded-full text-sm font-semibold backdrop-blur ${
                  zoom === z ? "bg-white text-slate-900" : "bg-black/45 text-white"
                }`}
              >
                {z}×
              </button>
            ))}
          </div>
        </>
      )}
      <div className="absolute inset-x-0 bottom-0 p-4 text-center text-sm font-medium text-white">
        {phase.kind === "starting" && "Starting camera…"}
        {phase.kind === "scanning" && "Looking for the code… Far away? Zoom in."}
        {phase.kind === "checking" && "Checking you in…"}
      </div>
    </div>
  );
}
