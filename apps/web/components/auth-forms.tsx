"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Turnstile } from "@/components/turnstile";

/** Only same-site paths, so a crafted link can't send people elsewhere after login. */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/portfolio";
}

function errorText(err: { message?: string; code?: string } | null | undefined): string {
  if (!err) return "Something went wrong. Please try again.";
  if (err.code === "INVALID_EMAIL_OR_PASSWORD") return "That email and password don't match.";
  if (err.code === "INVALID_CODE" || err.code === "INVALID_TWO_FACTOR_CODE") return "That code didn't match. Try the newest one.";
  if (err.code === "INVALID_BACKUP_CODE") return "That backup code isn't valid or was already used.";
  if (err.code?.startsWith("CAPTCHA") || err.code === "MISSING_RESPONSE" || err.code === "VERIFICATION_FAILED") {
    return "The human check didn't pass. Please try again.";
  }
  if (err.code === "USER_ALREADY_EXISTS" || err.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
    return "There's already an account with that email. Try logging in.";
  }
  return err.message || "Something went wrong. Please try again.";
}

function GoogleButton({ next }: { next: string }) {
  return (
    <>
      <button
        type="button"
        className="btn secondary wide"
        onClick={() => authClient.signIn.social({ provider: "google", callbackURL: next })}
      >
        Continue with Google
      </button>
      <p className="or">or</p>
    </>
  );
}

export function LoginForm({ google }: { google: boolean }) {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [needCode, setNeedCode] = useState(false);

  if (needCode) {
    return (
      <TwoFactorStep
        onDone={() => {
          router.push(next);
          router.refresh();
        }}
      />
    );
  }

  return (
    <form
      className="form auth"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        const { data, error } = await authClient.signIn.email({
          email: String(f.get("email")),
          password: String(f.get("password")),
          rememberMe: true,
        });
        setBusy(false);
        if (error) return setError(errorText(error));
        if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) return setNeedCode(true);
        router.push(next);
        router.refresh();
      }}
    >
      {google && <GoogleButton next={next} />}
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn wide" disabled={busy}>
        {busy ? "Logging in…" : "Log in"}
      </button>
      <p className="muted small">
        <Link href="/forgot-password">Forgot your password?</Link> · New here?{" "}
        <Link href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link>
      </p>
    </form>
  );
}

/** Second login step for accounts with two-factor login on. */
function TwoFactorStep({ onDone }: { onDone: () => void }) {
  const [backup, setBackup] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="form auth"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const code = String(f.get("code")).trim().replace(backup ? /\s/g : /\D/g, "");
        const trustDevice = f.get("trust") === "on";
        setBusy(true);
        setError("");
        const { error } = backup
          ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice })
          : await authClient.twoFactor.verifyTotp({ code, trustDevice });
        setBusy(false);
        if (error) return setError(errorText(error));
        onDone();
      }}
    >
      <p>{backup ? "Type one of your backup codes." : "Open your authenticator app and type the 6-digit code for midbig."}</p>
      <label>
        {backup ? "Backup code" : "Code"}
        <input
          key={backup ? "backup" : "totp"}
          name="code"
          autoComplete="one-time-code"
          inputMode={backup ? "text" : "numeric"}
          autoFocus
          required
        />
      </label>
      <label className="check">
        <input type="checkbox" name="trust" /> Don&rsquo;t ask again on this device for 30 days
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn wide" disabled={busy}>
        {busy ? "Checking…" : "Log in"}
      </button>
      <p className="muted small">
        <button type="button" className="btn link small" onClick={() => setBackup((b) => !b)}>
          {backup ? "Use the app code instead" : "Lost your phone? Use a backup code"}
        </button>
      </p>
    </form>
  );
}

export function SignupForm({ google, captchaSiteKey }: { google: boolean; captchaSiteKey: string | null }) {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  // Each token works once, so a failed attempt needs a fresh check.
  const [captchaRound, setCaptchaRound] = useState(0);

  return (
    <form
      className="form auth"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const email = String(f.get("email")).trim();
        setBusy(true);
        setError("");
        const { error } = await authClient.signUp.email(
          {
            name: String(f.get("name")).trim() || email.split("@")[0]!,
            email,
            password: String(f.get("password")),
          },
          captcha ? { headers: { "x-captcha-response": captcha } } : undefined,
        );
        setBusy(false);
        if (error) {
          setCaptcha(null);
          setCaptchaRound((n) => n + 1);
          return setError(errorText(error));
        }
        router.push(next);
        router.refresh();
      }}
    >
      {google && <GoogleButton next={next} />}
      <label>
        Name <span className="muted">(optional)</span>
        <input name="name" autoComplete="name" maxLength={60} />
      </label>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Password <span className="muted">(8 characters or more)</span>
        <input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
      </label>
      {captchaSiteKey && <Turnstile key={captchaRound} siteKey={captchaSiteKey} onToken={setCaptcha} />}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn wide" disabled={busy || (captchaSiteKey != null && !captcha)}>
        {busy ? "Creating your account…" : "Create account"}
      </button>
      <p className="muted small">
        By creating an account you agree to the <Link href="/terms">Terms</Link> and{" "}
        <Link href="/rules">Community rules</Link>, and confirm you&rsquo;re 18 or older. See how we handle your data
        in the <Link href="/privacy">Privacy policy</Link>.
      </p>
      <p className="muted small">
        Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`}>Log in</Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (sent) {
    return (
      <p className="notice">
        If there's an account with that email, a reset link is on its way. It works for one hour.
      </p>
    );
  }
  return (
    <form
      className="form auth"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        const { error } = await authClient.requestPasswordReset({
          email: String(f.get("email")),
          redirectTo: "/reset-password",
        });
        setBusy(false);
        if (error) return setError(errorText(error));
        setSent(true);
      }}
    >
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn wide" disabled={busy}>
        Send reset link
      </button>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [error, setError] = useState(params.get("error") ? "That reset link has expired. Ask for a new one." : "");
  const [busy, setBusy] = useState(false);
  if (!token) {
    return (
      <p className="notice">
        {error || "This page needs the link from your reset email."} <Link href="/forgot-password">Get a new link</Link>
      </p>
    );
  }
  return (
    <form
      className="form auth"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        const { error } = await authClient.resetPassword({ newPassword: String(f.get("password")), token });
        setBusy(false);
        if (error) return setError(errorText(error));
        router.push("/login?reset=1");
      }}
    >
      <label>
        New password <span className="muted">(8 characters or more)</span>
        <input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn wide" disabled={busy}>
        Save new password
      </button>
    </form>
  );
}
