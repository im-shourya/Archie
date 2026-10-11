import type { Metadata } from "next";
import { LegalPage } from "@/features/legal/LegalPage";
import { loadLegalDoc } from "@/features/legal/docs";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Legal",
  description:
    "Archie's privacy policy, terms of use, third-party services and accessibility statement.",
  alternates: { canonical: "/legal" },
};

export default function LegalIndex() {
  return <LegalPage doc={loadLegalDoc("README")} current="/legal" />;
}
