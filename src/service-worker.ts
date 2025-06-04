/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, prerendered, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

// Create a unique cache name for this deployment
const CACHE = `cache-${version}`;

const ASSETS = [
  ...build, // a list of URLs representing files built by Vite
  ...files, // a list of URLs representing files in the static directory
  ...prerendered // a list of URLs representing prerendered pages
];

sw.addEventListener('install', (event) => {
  // Create a new cache, add all files to it, and then skip waiting
  async function addFilesToCacheAndSkipWaiting() {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    sw.skipWaiting(); // Force the waiting service worker to become the active service worker.
  }

  event.waitUntil(addFilesToCacheAndSkipWaiting());
});

sw.addEventListener('activate', (event) => {
  // Remove previous cached data from disk and claim clients
  async function deleteOldCachesAndClaimClients() {
    for (const key of await caches.keys()) {
      if (key !== CACHE) {
        await caches.delete(key);
      }
    }
    await sw.clients.claim(); // Claim control of all clients in scope
  }

  event.waitUntil(deleteOldCachesAndClaimClients());
});

sw.addEventListener('fetch', (event) => {
  // Ignore non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  async function respond() {
    const url = new URL(event.request.url);
    const cache = await caches.open(CACHE);

    // Serve assets directly from cache if they are part of ASSETS
    // Ensure we are only trying to match pathnames for ASSETS
    if (ASSETS.includes(url.pathname.startsWith('/') ? url.pathname : '/' + url.pathname)) {
      const cachedResponse = await cache.match(event.request); // Match the original request
      if (cachedResponse) {
        return cachedResponse;
      }
    }

    // For other requests, try network first, then fallback to cache
    try {
      const response = await fetch(event.request);

      // If the request was successful (status 200), cache it
      if (response.ok) { // response.ok checks for status in the range 200-299
        // IMPORTANT: Clone the response. A response is a stream
        // and because we want the browser to consume the response
        // as well as the cache consuming the response, we need
        // to clone it so we have two streams.
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch (error) {
      // Network request failed, try to serve from cache
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }

      // If it's a navigation request and not in cache, you might serve a fallback offline page
      // For example, if you have an offline.html page:
      // if (event.request.mode === 'navigate') {
      //   const offlinePage = await cache.match('/offline.html');
      //   if (offlinePage) return offlinePage;
      // }

      // If not in cache and not a navigation, or no fallback, re-throw the error
      throw error;
    }
  }

  event.respondWith(respond());
}); 