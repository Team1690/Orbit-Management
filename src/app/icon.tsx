import { ImageResponse } from "next/og";
import { AppIconImage } from "@/lib/app-icon";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<AppIconImage size={64} rounded />, size);
}
