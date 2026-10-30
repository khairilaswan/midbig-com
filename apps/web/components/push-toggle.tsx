"use client";

import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/app/actions";

type State = "loading" | "unsupported" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.register("/sw.js");
}

/** Turns price alert notifications on or off for this browser. */
export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window) || !publicKey) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    registration()
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? "on" : "off"))
      .catch(() => setState("off"));
  }, [publicKey]);

  const turnOn = async () => {
    setBusy(true);
    setMsg("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey!),
      });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const res = await savePushSubscription({ ...json, userAgent: navigator.userAgent });
      if (!res.ok) {
        await sub.unsubscribe();
        setMsg(res.error);
        return;
      }
      setState("on");
    } catch (err) {
      console.error(err);
      setMsg("This browser couldn't turn on notifications.");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setMsg("");
    try {
      const sub = await (await registration()).pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    const res = await sendTestPush();
    setBusy(false);
    setMsg(res.ok ? "Sent. It should appear in a few seconds." : res.error);
  };

  return (
    <div className="push-toggle">
      {state === "loading" && <p className="muted">Checking this device…</p>}
      {state === "unsupported" && (
        <p className="muted">
          This browser can't show notifications. On iPhone and iPad, first add midbig to your Home Screen (Share, then
          &ldquo;Add to Home Screen&rdquo;) and open it from there.
        </p>
      )}
      {state === "denied" && (
        <p className="muted">
          Notifications are blocked for this site. Allow them in your browser's site settings, then reload this page.
        </p>
      )}
      {state === "off" && (
        <button type="button" className="btn" onClick={turnOn} disabled={busy}>
          Turn on notifications on this device
        </button>
      )}
      {state === "on" && (
        <p className="row-gap">
          <span className="fresh live">
            <i aria-hidden /> Notifications are on for this device
          </span>
          <button type="button" className="btn secondary small" onClick={test} disabled={busy}>
            Send a test
          </button>
          <button type="button" className="btn link small" onClick={turnOff} disabled={busy}>
            Turn off
          </button>
        </p>
      )}
      {msg && <p className="muted small">{msg}</p>}
    </div>
  );
}
