/* eslint-disable no-restricted-globals */
/**
 * Service worker.
 *
 * Two jobs: keep the app usable on the intermittent connectivity that is
 * normal on Ghanaian mobile networks, and deliver push notifications.
 *
 * Caching strategy is deliberately conservative — anything that reads or
 * writes school data goes to the network first, so staff never act on a
 * stale register or a stale fee balance.
 */

const VERSION = "v1";
const SHELL_CACHE = `shell-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;

const SHELL_ASSETS = ["/offline", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API responses or file downloads — always live data.
  if (url.pathname.startsWith("/api/")) return;

  // Immutable build output: cache first, it can never go stale.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // Pages: network first, falling back to the offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((cached) => cached ?? caches.match("/offline")),
      ),
    );
  }
});

// -----------------------------------------------------------------------------
// Push notifications
// -----------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "School Management System", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Notification", {
      body: payload.body ?? "",
      icon: payload.icon ?? "/icons/icon-192.png",
      badge: payload.badge ?? "/icons/badge-72.png",
      tag: payload.tag,
      // Re-showing an updated notification with the same tag should still
      // alert — a second fee reminder matters as much as the first.
      renotify: Boolean(payload.tag),
      data: { url: payload.url ?? "/", ...(payload.data ?? {}) },
      actions: payload.url ? [{ action: "open", title: "Open" }] : undefined,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Focus an existing tab rather than opening a duplicate.
        for (const client of clientList) {
          if (client.url.includes(target) && "focus" in client) return client.focus();
        }
        if (clientList.length && "navigate" in clientList[0]) {
          return clientList[0].focus().then((client) => client.navigate(target));
        }
        return self.clients.openWindow(target);
      }),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  // The browser rotated the subscription; re-register it server-side.
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription?.options ?? { userVisibleOnly: true })
      .then((subscription) =>
        fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription),
        }),
      )
      .catch(() => undefined),
  );
});
