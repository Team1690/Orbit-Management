import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { Scanner } from "./scanner";

export const metadata: Metadata = { title: "Scan" };

export default async function ScanPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Scan to check in</h1>
      <p className="mb-4 text-sm text-slate-500">Point your camera at the QR code on the meeting slide.</p>
      <Scanner />
    </div>
  );
}
