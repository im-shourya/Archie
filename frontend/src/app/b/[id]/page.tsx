import type { Metadata } from "next";
import { BoardScreen } from "@/features/board/BoardScreen";

// Boards are private to the visitor's browser: never index them.
export const metadata: Metadata = { title: "Board", robots: { index: false, follow: false } };

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BoardScreen id={id} />;
}
