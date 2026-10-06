import type { Metadata } from "next";
import { StyleGuide } from "./StyleGuide";

export const metadata: Metadata = {
  title: "Design system",
  description: "Archie's tokens and components in every state, rendered live in light and dark.",
  robots: { index: false },
};

export default function DesignPage() {
  return <StyleGuide />;
}
