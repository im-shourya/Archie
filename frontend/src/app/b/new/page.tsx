import { Suspense } from "react";
import { NewBoard } from "./NewBoard";

export default function NewBoardPage() {
  return (
    <Suspense>
      <NewBoard />
    </Suspense>
  );
}
