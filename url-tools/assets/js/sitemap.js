import { saveState, loadState, downloadCsv } from './utils.js';

let sitemapState = loadState('sitemapExtractorState') || {
    urls: [],
    results: [],
    csvData: [['Sitemap URL', 'Extracted URL']],
    processedCount: 0,
    totalUrls: 0,
    isProcessing: false,
    errors: [],
    shouldStop: false
};

const PROXY_URLS = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?'
];
const REQUEST_LIMIT = 10; // Max requests per minute
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
let requestCount = 0;
let lastReset = Date.now();

function init() {
    if (sitemapState.urls.length) {
        document.getElementById('sitemapUrls').value = sitemapState.urls.join('\n');
        updateSitemapResults();
        updateProgress();
        document.getElementById('resumeButton').disabled = !sitemapState.isProcessing;
    }
    registerServiceWorker();
}

async function extractUrls() {
    const textarea = document.getElementById('sitemapUrls');
    const resultsDiv = document.getElementById('sitemapResults');
    const loader = document.getElementById('loader');
    const rawUrls = textarea.value.trim().split('\n').filter(url => url.trim()).slice(0, 100);

    if (!rawUrls.length) {
        resultsDiv.innerHTML = '<div class="error">Please enter at least one sitemap URL.</div>';
        return;
    }

    sitemapState = {
        urls: rawUrls,
        results: [],
        csvData: [['Sitemap URL', 'Extracted URL']],
        processedCount: 0,
        totalUrls: rawUrls.length,
        isProcessing: true,
        errors: [],
        shouldStop: false
    };
    saveState('sitemapExtractorState', sitemapState);
    resultsDiv.innerHTML = '';
    loader.style.display = 'block';
    document.getElementById('resumeButton').disabled = false;
    document.getElementById('stopButton').disabled = false;

    await processUrls(rawUrls, 0);
}

async function resumeExtraction() {
    if (!sitemapState.isProcessing || !sitemapState.urls) return;

    sitemapState.shouldStop = false;
    const resultsDiv = document.getElementById('sitemapResults');
    resultsDiv.innerHTML = '';
    document.getElementById('loader').style.display = 'block';
    document.getElementById('stopButton').disabled = false;
    updateSitemapResults();
    await processUrls(sitemapState.urls, sitemapState.processedCount);
}

function stopExtraction() {
    sitemapState.shouldStop = true;
    saveState('sitemapExtractorState', sitemapState);
    document.getElementById('stopButton').disabled = true;
}

async function processUrls(urls, startIndex) {
    const resultsDiv = document.getElementById('sitemapResults');
    const loader = document.getElementById('loader');

    for (let i = startIndex; i < urls.length; i++) {
        if (sitemapState.shouldStop) {
            resultsDiv.innerHTML += '<div class="result-item">Extraction stopped by user.</div>';
            break;
        }

        const rawUrl = urls[i];
        try {
            const url = normalizeSitemapUrl(rawUrl);
            const cached = getCachedSitemap(url);
            let pageUrls;
            if (cached) {
                pageUrls = cached.urls;
            } else {
                await checkRateLimit();
                pageUrls = await fetchAllSitemapUrls(url);
                cacheSitemap(url, pageUrls);
            }
            pageUrls.forEach(pageUrl => sitemapState.csvData.push([url, pageUrl]));
            const result = `<div class="result-item">Extracted ${pageUrls.length} URLs from ${url}${cached ? ' (cached)' : ''}</div>`;
            sitemapState.results.push(result);
            resultsDiv.innerHTML += result;
        } catch (error) {
            const errorMsg = `<div class="error">Error processing ${rawUrl}: ${error.message}</div>`;
            sitemapState.results.push(errorMsg);
            sitemapState.errors.push(error.message);
            resultsDiv.innerHTML += errorMsg;
        }

        sitemapState.processedCount = i + 1;
        updateProgress();
        saveState('sitemapExtractorState', sitemapState);
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    if (!sitemapState.shouldStop && sitemapState.csvData.length > 1) {
        downloadCsv(sitemapState.csvData, 'sitemap_urls.csv');
    } else if (!sitemapState.shouldStop) {
        resultsDiv.innerHTML += '<div class="error">No URLs extracted for CSV.</div>';
    }

    if (sitemapState.errors.length) {
        resultsDiv.innerHTML += `<div class="error">Summary: ${sitemapState.errors.length} errors occurred.</div>`;
    }

    sitemapState.isProcessing = false;
    saveState('sitemapExtractorState', sitemapState);
    loader.style.display = 'none';
    document.getElementById('resumeButton').disabled = true;
    document.getElementById('stopButton').disabled = true;
}

function updateProgress() {
    const percentage = sitemapState.totalUrls > 0 ? (sitemapState.processedCount / sitemapState.totalUrls) * 100 : 0;
    document.getElementById('progressBar').style.width = `${percentage}%`;
    document.getElementById('progressText').textContent = `${percentage.toFixed(1)}% Complete (${sitemapState.processedCount}/${sitemapState.totalUrls} URLs processed)`;
}

function updateSitemapResults() {
    document.getElementById('sitemapResults').innerHTML = sitemapState.results.join('');
}

function clearSitemapData() {
    localStorage.removeItem('sitemapExtractorState');
    localStorage.removeItem('sitemapCache');
    sitemapState = { urls: [], results: [], csvData: [['Sitemap URL', 'Extracted URL']], processedCount: 0, totalUrls: 0, isProcessing: false, errors: [], shouldStop: false };
    document.getElementById('sitemapUrls').value = '';
    document.getElementById('sitemapResults').innerHTML = '';
    document.getElementById('progressBar').style.width = '0%';
    document.getElementById('progressText').textContent = '0% Complete (0/0 URLs processed)';
    document.getElementById('resumeButton').disabled = true;
    document.getElementById('stopButton').disabled = true;
}

function normalizeSitemapUrl(rawUrl) {
    let url = rawUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.origin + (url.endsWith('/sitemap_index.xml') || url.endsWith('/sitemap.xml') ? parsedUrl.pathname : '/sitemap_index.xml');
    } catch {
        throw new Error('Invalid URL format');
    }
}

async function checkRateLimit() {
    const now = Date.now();
    if (now - lastReset > 60 * 1000) {
        requestCount = 0;
        lastReset = now;
    }
    if (requestCount >= REQUEST_LIMIT) {
        const waitTime = 60 * 1000 - (now - lastReset);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        requestCount = 0;
        lastReset = Date.now();
    }
    requestCount++;
}

function getCachedSitemap(url) {
    const cache = loadState('sitemapCache') || {};
    const cached = cache[url];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached;
    }
    return null;
}

function cacheSitemap(url, urls) {
    const cache = loadState('sitemapCache') || {};
    cache[url] = { urls, timestamp: Date.now() };
    saveState('sitemapCache', cache);
}

async function fetchWithRetry(url, proxy, retries = 3, timeout = 5000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            const response = await fetch(proxy + encodeURIComponent(url), {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/xml, text/xml',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/118.0.0.0 Safari/537.36'
                }
            });
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.text();
        } catch (error) {
            if (attempt === retries) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

async function fetchSitemap(url) {
    let lastError;
    for (const proxy of PROXY_URLS) {
        try {
            return await fetchWithRetry(url, proxy);
        } catch (error) {
            lastError = error;
        }
    }
    throw new Error(`Network error: ${lastError.message}`);
}

async function fetchAllSitemapUrls(url) {
    try {
        let sitemapResponse = await fetchSitemap(url);
        const parser = new DOMParser();
        let xmlDoc = parser.parseFromString(sitemapResponse, 'text/xml');
        const sitemapNodes = xmlDoc.getElementsByTagName('sitemap');
        if (sitemapNodes.length > 0) {
            const sitemapUrls = Array.from(sitemapNodes).map(node => node.getElementsByTagName('loc')[0].textContent);
            let allPageUrls = [];
            for (const sitemapUrl of sitemapUrls) {
                if (sitemapState.shouldStop) break;
                await checkRateLimit();
                const subSitemapResponse = await fetchSitemap(sitemapUrl);
                const subXmlDoc = parser.parseFromString(subSitemapResponse, 'text/xml');
                const pageUrls = Array.from(subXmlDoc.getElementsByTagName('loc')).map(node => node.textContent);
                allPageUrls = allPageUrls.concat(pageUrls);
            }
            return allPageUrls;
        } else {
            return Array.from(xmlDoc.getElementsByTagName('loc')).map(node => node.textContent);
        }
    } catch (error) {
        if (url.endsWith('/sitemap_index.xml')) {
            const fallbackUrl = url.replace('/sitemap_index.xml', '/sitemap.xml');
            try {
                await checkRateLimit();
                const sitemapResponse = await fetchSitemap(fallbackUrl);
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(sitemapResponse, 'text/xml');
                return Array.from(xmlDoc.getElementsByTagName('loc')).map(node => node.textContent);
            } catch (fallbackError) {
                throw new Error(`Network error: ${fallbackError.message}`);
            }
        }
        throw error;
    }
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(error => {
            console.error('Service Worker registration failed:', error);
        });
    }
}

window.extractUrls = extractUrls;
window.resumeExtraction = resumeExtraction;
window.stopExtraction = stopExtraction;
window.clearSitemapData = clearSitemapData;

init();
