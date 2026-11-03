import { ImageResponse } from "next/og";
import { AppIconImage } from "@/lib/app-icon";

// iPhone home-screen icon. iOS rounds the corners itself.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<AppIconImage size={180} />, size);
}
