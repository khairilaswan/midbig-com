import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth-forms";
import { googleEnabled } from "@/lib/auth";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const { reset } = await searchParams;
  return (
    <div className="narrow">
      <h1 className="page-title">Log in</h1>
      {reset && <p className="notice">Your password is changed. Log in with the new one.</p>}
      <Suspense>
        <LoginForm google={googleEnabled} />
      </Suspense>
    </div>
  );
}
