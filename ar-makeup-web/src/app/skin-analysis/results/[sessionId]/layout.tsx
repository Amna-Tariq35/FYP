import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Skin results",
  description: "Your skin profile and a morning and evening product routine.",
};

export default function SkinResultsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
