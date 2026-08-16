"use client";

import { useEffect, useState } from "react";
import { BellRing, Download, WifiOff, X } from "lucide-react";

import { Button } from "@/components/ui";

/**
 * PWA runtime: registers the service worker, offers install and push
 * enrolment, and warns when the device drops offline.
 *
 * Mounted once from the root layout. Every prompt is dismissible and
 * remembers the dismissal — nobody should be nagged twice.
 */
export function PwaRuntime({ signedIn = false }: { signedIn?: boolean }) {
  useServiceWorker();

  return (
    <>
      <OfflineBanner />
      <InstallPrompt />
      {/* Only offered to someone signed in. This runs from the root layout, so
          it also covers the login page, the public website and the certificate
          verification page. An anonymous visitor was asked to enable
          notifications, and saying yes POSTed a subscription to a route that
          401s — so nothing was stored, and browser permission was now
          "granted", which is not "default", which is the condition this prompt
          waits for. That browser could never be asked again, including after
          the parent signed in, and there was no way back short of clearing
          site permissions by hand. */}
      {signedIn ? <PushPrompt /> : null}
    </>
  );
}

function useServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((error) => console.warn("[pwa] service worker registration failed", error));
    };

    // Wait for load so registration never competes with first paint.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
}

// -----------------------------------------------------------------------------
// Offline indicator
// -----------------------------------------------------------------------------

function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-[60] flex items-center justify-center gap-2 bg-[var(--warning)] px-4 py-2 text-sm font-medium text-white"
    >
      <WifiOff className="size-4" />
      You are offline. Changes will not be saved until the connection returns.
    </div>
  );
}

// -----------------------------------------------------------------------------
// Install
// -----------------------------------------------------------------------------

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem("pwa:install-dismissed")) return;

    const handler = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    window.localStorage.setItem("pwa:install-dismissed", "1");
    setVisible(false);
  }

  if (!visible || !deferred) return null;

  return (
    <div className="card fixed right-4 bottom-4 z-50 flex max-w-sm items-start gap-3 p-4 shadow-lg">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
        <Download className="size-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Install the app</p>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Add it to your home screen for faster access and offline viewing.
        </p>
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            onClick={async () => {
              await deferred.prompt();
              await deferred.userChoice;
              setVisible(false);
            }}
          >
            Install
          </Button>
          <Button size="sm" variant="ghost" onClick={dismiss}>
            Not now
          </Button>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="rounded p-1 text-[var(--text-subtle)] hover:bg-[var(--bg-subtle)]"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Push enrolment
// -----------------------------------------------------------------------------

function PushPrompt() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (Notification.permission !== "default") return;
    if (window.localStorage.getItem("pwa:push-dismissed")) return;

    // Give the user a moment to orient before asking for permission.
    const timer = window.setTimeout(() => setVisible(true), 12_000);
    return () => window.clearTimeout(timer);
  }, []);

  function dismiss() {
    window.localStorage.setItem("pwa:push-dismissed", "1");
    setVisible(false);
  }

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        dismiss();
        return;
      }
      await subscribeToPush();
      setVisible(false);
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="card fixed right-4 bottom-4 z-50 flex max-w-sm items-start gap-3 p-4 shadow-lg">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
        <BellRing className="size-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Turn on notifications</p>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Get alerted about fee reminders, results and school announcements.
        </p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={enable} disabled={busy}>
            {busy ? "Enabling…" : "Enable"}
          </Button>
          <Button size="sm" variant="ghost" onClick={dismiss}>
            No thanks
          </Button>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="rounded p-1 text-[var(--text-subtle)] hover:bg-[var(--bg-subtle)]"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/** Subscribes this device and registers the subscription server-side. */
export async function subscribeToPush(): Promise<boolean> {
  try {
    const keyResponse = await fetch("/api/push/key");
    const { publicKey } = (await keyResponse.json()) as { publicKey: string };
    if (!publicKey) return false;

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }));

    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...subscription.toJSON(),
        userAgent: navigator.userAgent,
      }),
    });

    return response.ok;
  } catch (error) {
    console.warn("[pwa] push subscription failed", error);
    return false;
  }
}

/** VAPID keys are base64url; the Push API wants raw bytes. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}
