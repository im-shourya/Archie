"use client";

import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useCompactLayout } from "./useCompactLayout";

/** Height of the bottom sheet's peek on phones (docs/33 Step 3). */
export const SHEET_PEEK_PX = 88;

/**
 * Fit the graph to the canvas. On phones, keep labels legible (zoom ≥ 0.5, so a 14 px label
 * renders ≥ 10 px) and leave room for the sheet's peek; the user pans for the rest.
 */
export function useFit() {
  const { fitView } = useReactFlow();
  const { compact } = useCompactLayout();
  return useCallback(
    (duration = 250) =>
      fitView(
        compact
          ? {
              padding: {
                top: "16px",
                left: "16px",
                right: "16px",
                bottom: `${SHEET_PEEK_PX + 16}px`,
              },
              minZoom: 0.5,
              duration,
            }
          : { padding: 0.2, duration },
      ),
    [fitView, compact],
  );
}
