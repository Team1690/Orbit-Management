import { ImageResponse } from "next/og";
import { AppIconImage } from "@/lib/app-icon";

// Android home-screen icons referenced from the web app manifest.
export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const requested = Number((await params).size);
  const size = [192, 512].includes(requested) ? requested : 192;
  return new ImageResponse(<AppIconImage size={size} />, {
    width: size,
    height: size,
    headers: { "Cache-Control": "public, max-age=604800, immutable" },
  });
}
