// ============================================================
// Service Worker
// ============================================================
// 职责（第 1 轮）：
//   1. install 时预缓存应用壳（HTML / CSS / manifest）
//   2. data.json 走"网络优先"，保证新增音频后能看到，离线退回缓存
//   3. 导航请求走"网络优先"，离线退回缓存的 index.html
//   4. 音频文件本轮不处理（放行给网络），第 2 轮再加缓存逻辑
//
// 版本更新机制：
//   - 改 VERSION 常量即可。缓存名跟着变，activate 时清理旧缓存
//   - skipWaiting() + clients.claim() 让新 SW 立刻接管，无需用户关页面
//
// 调试提示：
//   - Edge F12 → 应用程序 → Service Worker，可 Unregister
//   - Edge F12 → 应用程序 → 存储 → 清除站点数据，可彻底重置
// ============================================================

const VERSION = 'v4';
const APP_CACHE = `app-${VERSION}`;
const DATA_CACHE = `data-${VERSION}`;

// 应用壳：首次安装时预缓存
// 用相对路径，兼容 GitHub Pages 子路径部署（如 /repo/）
const APP_SHELL = [
    './',
    './index.html',
    './style.css',
    './manifest.json',
];

// ============================================================
// install：预缓存应用壳
// ============================================================
// 逐项 add，单个失败不影响整体安装（比如 manifest 还没写好时）
// 全部完成后 skipWaiting，让新 SW 不进入 waiting 状态
// ============================================================
self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(APP_CACHE);
        await Promise.all(
            APP_SHELL.map(async (url) => {
                try {
                    await cache.add(url);
                } catch (err) {
                    console.warn('[SW] 预缓存失败:', url, err);
                }
            })
        );
        await self.skipWaiting();
    })());
});

// ============================================================
// activate：清理旧版本缓存，接管所有页面
// ============================================================
// 保留当前版本的 APP_CACHE 和 DATA_CACHE，其他全删
// clients.claim() 让当前已打开的页面也被这个 SW 控制
// ============================================================
self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(
            keys.map((key) => {
                if (key !== APP_CACHE && key !== DATA_CACHE) {
                    return caches.delete(key);
                }
            })
        );
        await self.clients.claim();
    })());
});

// ============================================================
// fetch：按请求类型分流
// ============================================================
// 顺序很重要：
//   1. 非 GET 直接放行（POST 等不缓存）
//   2. 跨源请求本轮放行（音频第 2 轮再处理）
//   3. 导航请求 → 网络优先
//   4. data.json → 网络优先
//   5. 音频 → 本轮放行
//   6. 其他同源资源 → 缓存优先
// ============================================================
self.addEventListener('fetch', (event) => {
    const req = event.request;

    // 只处理 GET
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // 第 1 轮：跨源请求全部放行（音频源通常跨源）
    // 第 2 轮会在这里加音频缓存分支
    if (url.origin !== self.location.origin) {
        // 音频放行，不做任何处理
        if (isAudio(url.pathname)) return;
        // 其他跨源资源也放行
        return;
    }

    // 导航请求：用户地址栏打开或点击链接
    if (req.mode === 'navigate') {
        event.respondWith(networkFirstNavigate(req));
        return;
    }

    // 所有 .json：网络优先（含 novels.json 和 data-*.json）
    if (url.pathname.endsWith('.json')) {
        event.respondWith(networkFirst(req, DATA_CACHE));
        return;
    }

    // 音频：本轮放行，第 2 轮处理
    if (isAudio(url.pathname)) return;

    // 其他同源资源：缓存优先
    event.respondWith(cacheFirst(req, APP_CACHE));
});

// ============================================================
// 工具函数
// ============================================================

function isAudio(pathname) {
    return /\.(m4a|mp2|mp3|aac|ogg|wav|flac)$/i.test(pathname);
}

// 缓存优先：先看缓存，没有则走网络并写入
async function cacheFirst(req, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(req);
    if (cached) return cached;

    try {
        const resp = await fetch(req);
        // 只缓存有效的同源响应
        if (resp && resp.status === 200 && resp.type === 'basic') {
            cache.put(req, resp.clone());
        }
        return resp;
    } catch (err) {
        return new Response('离线且无缓存', {
            status: 503,
            statusText: 'Offline',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }
}

// 网络优先：先请求网络，失败退回缓存
async function networkFirst(req, cacheName) {
    const cache = await caches.open(cacheName);
    try {
        const resp = await fetch(req);
        if (resp && resp.status === 200) {
            cache.put(req, resp.clone());
        }
        return resp;
    } catch (err) {
        const cached = await cache.match(req);
        if (cached) return cached;
        return new Response('离线且无缓存', {
            status: 503,
            statusText: 'Offline',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }
}

// 导航请求专用：网络优先，离线退回预缓存的 index.html
// 注意：不用 cache.match(req)，因为 req.url 可能带查询串
// 统一退回 './index.html'
async function networkFirstNavigate(req) {
    try {
        const resp = await fetch(req);
        if (resp && resp.status === 200) {
            const cache = await caches.open(APP_CACHE);
            cache.put('./index.html', resp.clone());
        }
        return resp;
    } catch (err) {
        const cache = await caches.open(APP_CACHE);
        const cached = await cache.match('./index.html');
        if (cached) return cached;
        return new Response('离线且无缓存', {
            status: 503,
            statusText: 'Offline',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }
}
