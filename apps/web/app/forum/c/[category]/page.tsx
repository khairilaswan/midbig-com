import { permanentRedirect } from "next/navigation";

/** Phase 5 forum categories became b/ hubs. */
const HUBS: Record<string, string> = {
  general: "general",
  crypto: "crypto",
  stocks: "stocks",
  forex: "forex",
  strategy: "strategy",
  feedback: "midbig",
};

export default async function OldCategory({ params }: { params: Promise<{ category: string }> }) {
  const hub = HUBS[(await params).category];
  permanentRedirect(hub ? `/b/${hub}` : "/forum");
}
