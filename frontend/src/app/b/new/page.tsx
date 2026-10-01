import type { Metadata } from "next";
import { Suspense } from "react";
import { NewBoard } from "./NewBoard";

export const metadata: Metadata = { title: "New board", robots: { index: false, follow: false } };

export default function NewBoardPage() {
  return (
    <Suspense>
      <NewBoard />
    </Suspense>
  );
}
