const CACHE_NAME = 'url-tools-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/filter.html',
    '/assets/css/common.css',
    '/assets/css/sitemap.css',
    '/assets/css/filter.css',
    '/assets/js/utils.js',
    '/assets/js/sitemap.js',
    '/assets/js/filter.js',
    '/assets/lib/papaparse.min.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});
