"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { renderSVG } from "uqr";
import { authClient } from "@/lib/auth-client";

type Step = { kind: "idle" } | { kind: "scan"; uri: string; secret: string; codes: string[] } | { kind: "codes"; codes: string[] };

function BackupCodes({ codes }: { codes: string[] }) {
  return (
    <>
      <p>
        <strong>Save these backup codes</strong> somewhere safe, such as a password manager. Each one logs you in once
        if you lose your phone.
      </p>
      <pre className="backup-codes">{codes.join("\n")}</pre>
    </>
  );
}

export function TwoFactorSettings({ enabled, hasPassword }: { enabled: boolean; hasPassword: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const password = (f: FormData) => (hasPassword ? { password: String(f.get("password")) } : {});
  const fail = (e: { message?: string; code?: string }) =>
    setError(e.code === "INVALID_PASSWORD" ? "Your password is wrong." : e.message || "That didn't work.");

  if (step.kind === "scan") {
    return (
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const code = String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "");
          const { error } = await authClient.twoFactor.verifyTotp({ code });
          setBusy(false);
          if (error) return setError(error.message || "That code didn't match. Try the newest one.");
          setError("");
          setStep({ kind: "codes", codes: step.codes });
          router.refresh();
        }}
      >
        <p>1. Scan this with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy).</p>
        <div className="qr" dangerouslySetInnerHTML={{ __html: renderSVG(step.uri, { border: 2 }) }} />
        <p className="muted small">
          Can&rsquo;t scan? On this phone, <a href={step.uri}>open it in your app</a>, or type this key:{" "}
          <code>{step.secret}</code>
        </p>
        <label>
          2. Type the 6-digit code it shows
          <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required />
        </label>
        {error && <p className="form-error">{error}</p>}
        <p className="row-gap">
          <button className="btn" disabled={busy}>
            Turn on
          </button>
          <button type="button" className="btn link" onClick={() => setStep({ kind: "idle" })}>
            Cancel
          </button>
        </p>
      </form>
    );
  }

  if (step.kind === "codes") {
    return (
      <div className="form">
        <p className="notice">Two-factor login is on. Next time you log in, you&rsquo;ll be asked for a code.</p>
        <BackupCodes codes={step.codes} />
        <p>
          <button type="button" className="btn secondary" onClick={() => setStep({ kind: "idle" })}>
            I&rsquo;ve saved them
          </button>
        </p>
      </div>
    );
  }

  if (!enabled) {
    return (
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const { data, error } = await authClient.twoFactor.enable(password(new FormData(e.currentTarget)));
          setBusy(false);
          if (error || !data || !("totpURI" in data) || !data.totpURI) return fail(error ?? {});
          setError("");
          const secret = new URL(data.totpURI).searchParams.get("secret") ?? "";
          setStep({ kind: "scan", uri: data.totpURI, secret, codes: data.backupCodes ?? [] });
        }}
      >
        <p className="muted">
          Off. With it on, logging in with your password also needs a code from an app on your phone, so a stolen
          password isn&rsquo;t enough. Moderators must turn it on.
        </p>
        {hasPassword && (
          <label>
            Your password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
        )}
        {error && <p className="form-error">{error}</p>}
        <p>
          <button className="btn secondary" disabled={busy}>
            Set up two-factor login
          </button>
        </p>
      </form>
    );
  }

  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const which = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
        setBusy(true);
        if (which === "codes") {
          const { data, error } = await authClient.twoFactor.generateBackupCodes(password(f));
          setBusy(false);
          if (error || !data) return fail(error ?? {});
          setError("");
          setStep({ kind: "codes", codes: data.backupCodes });
          return;
        }
        const { error } = await authClient.twoFactor.disable(password(f));
        setBusy(false);
        if (error) return fail(error);
        setError("");
        router.refresh();
      }}
    >
      <p>
        <strong>On.</strong> <span className="muted">Logging in with your password also asks for a code from your app.</span>
      </p>
      {hasPassword && (
        <label>
          Your password <span className="muted">(to change this)</span>
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
      )}
      {error && <p className="form-error">{error}</p>}
      <p className="row-gap">
        <button className="btn secondary" name="action" value="codes" disabled={busy}>
          New backup codes
        </button>
        <button className="btn danger" name="action" value="off" disabled={busy}>
          Turn off
        </button>
      </p>
    </form>
  );
}
