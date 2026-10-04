import type { Metadata } from "next";
import { ReplayScreen } from "@/features/replay/ReplayScreen";

export const metadata: Metadata = { title: "Replay", robots: { index: false, follow: false } };

export default async function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReplayScreen id={id} />;
}
