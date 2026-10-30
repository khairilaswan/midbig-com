import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <div className="narrow">
      <h1 className="page-title">Reset your password</h1>
      <p className="lede">Enter the email you signed up with and we'll send you a link to choose a new password.</p>
      <ForgotPasswordForm />
    </div>
  );
}
