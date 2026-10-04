import type { Metadata } from "next";
import { SharedBoard } from "@/features/share/SharedBoard";

// Shared boards live in the link's hash, which never reaches the server: never index them.
export const metadata: Metadata = { title: "Shared board", robots: { index: false, follow: false } };

export default function SharedPage() {
  return <SharedBoard />;
}
