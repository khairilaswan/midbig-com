import type { Metadata } from "next";
import { Suspense } from "react";
import { SignupForm } from "@/components/auth-forms";
import { googleEnabled, turnstile } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Create a free account",
  description: "Save a watchlist, track your crypto portfolio's profit and loss, and get price alerts. Free.",
};
// The Google button and the bot check depend on settings read when the site starts, not at build time.
export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <div className="narrow">
      <h1 className="page-title">Create a free account</h1>
      <p className="lede">Save a watchlist, track your portfolio's profit and loss, and get price alerts on your phone.</p>
      <Suspense>
        <SignupForm google={googleEnabled} captchaSiteKey={turnstile?.siteKey ?? null} />
      </Suspense>
    </div>
  );
}
