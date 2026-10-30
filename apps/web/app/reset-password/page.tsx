import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default function ResetPasswordPage() {
  return (
    <div className="narrow">
      <h1 className="page-title">Choose a new password</h1>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
