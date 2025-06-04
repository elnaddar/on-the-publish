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
  // Create a new cache and add all files to it
  async function addFilesToCache() {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
  }

  event.waitUntil(addFilesToCache());
});

sw.addEventListener('activate', (event) => {
  // Remove previous cached data from disk
  async function deleteOldCaches() {
    for (const key of await caches.keys()) {
      if (key !== CACHE) await caches.delete(key);
    }
  }

  event.waitUntil(deleteOldCaches());
});

sw.addEventListener('fetch', (event) => {
  // Ignore non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  async function respond() {
    const url = new URL(event.request.url);
    const cache = await caches.open(CACHE);

    // Serve assets directly from cache
    if (ASSETS.includes(url.pathname)) {
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }
    }

    // For other requests, try network first, then fallback to cache
    try {
      const response = await fetch(event.request);

      // If the request was successful, cache it
      // Server errors (4xx, 5xx) should not be cached unless specifically handled
      if (response.ok) {
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
      //   return caches.match('/offline.html');
      // }

      // If not in cache and not a navigation, or no fallback, re-throw the error
      throw error;
    }
  }

  event.respondWith(respond());
}); 