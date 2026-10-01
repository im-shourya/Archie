import type { Metadata } from "next";
import { BoardScreen } from "@/features/board/BoardScreen";

export const metadata: Metadata = { title: "Board · Archie" };

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BoardScreen id={id} />;
}
