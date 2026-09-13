// ============================================================
// 全局状态
// ============================================================
let allTracks = [];
let currentIdx = -1;
const audio = new Audio();
audio.preload = 'none';

const SPEEDS = [1, 1.25, 1.5, 2, 0.75];
let speedIndex = 0;

// 音频缓存名
const AUDIO_CACHE = 'audio-v1';

// 已缓存的 blob URL 映射：原始 url → blob url
const blobUrlCache = new Map();

// part 索引：url → { url, tracks: [...] }
const partIndex = new Map();

// 当前下载任务（同一时刻最多一个）
// { url, controller, received, total, startedAt }
let currentTask = null;

// ============================================================
// DOM 引用
// ============================================================
const audioListEl = document.getElementById('audioList');
const searchInput = document.getElementById('searchInput');
const categorySelect = document.getElementById('categorySelect');
const miniPlayer = document.getElementById('miniPlayer');
const mpCover = document.getElementById('mpCover');
const mpTitle = document.getElementById('mpTitle');
const mpTitleInner = document.getElementById('mpTitleInner');
const mpProgressWrap = document.getElementById('mpProgressWrap');
const mpProgressBar = document.getElementById('mpProgressBar');
const mpTime = document.getElementById('mpTime');
const mpSpeedBtn = document.getElementById('mpSpeedBtn');
const mpPlayBtn = document.getElementById('mpPlayBtn');
const mpCacheBtn = document.getElementById('mpCacheBtn');
const mpCloseBtn = document.getElementById('mpCloseBtn');

const headerManagerBtn = document.getElementById('headerManagerBtn');
const managerMask = document.getElementById('managerMask');
const manager = document.getElementById('manager');
const managerCloseBtn = document.getElementById('managerCloseBtn');
const managerBody = document.getElementById('managerBody');
const managerFooter = document.getElementById('managerFooter');

// ============================================================
// SVG 图标
// ============================================================
const ICON_PLAY = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICON_CLOUD_DOWN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 13v8"/><path d="m8 17 4 4 4-4"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/></svg>';
const ICON_CLOUD_CHECK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM10 17l-3.5-3.5 1.41-1.41L10 14.17 15.18 9l1.41 1.41L10 17z"/></svg>';
const ICON_MANAGER = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
const ICON_TRASH = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

mpPlayBtn.innerHTML = ICON_PLAY;
mpCloseBtn.innerHTML = ICON_CLOSE;
mpCacheBtn.innerHTML = ICON_CLOUD_DOWN;
headerManagerBtn.innerHTML = ICON_MANAGER;
managerCloseBtn.innerHTML = ICON_CLOSE;

// ============================================================
// 工具函数
// ============================================================
function formatTime(sec) {
    if (sec == null || isNaN(sec) || !isFinite(sec) || sec < 0) return '0:00';
    const total = Math.floor(sec);
    const s = total % 60;
    const m = Math.floor(total / 60) % 60;
    const h = Math.floor(total / 3600);
    if (h > 0) {
        return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
    return m + ':' + String(s).padStart(2, '0');
}

function formatSize(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(2) + ' GB';
}

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ============================================================
// part 索引
// ============================================================
function buildPartIndex() {
    partIndex.clear();
    allTracks.forEach(t => {
        if (!t.url) return;
        if (!partIndex.has(t.url)) {
            partIndex.set(t.url, { url: t.url, tracks: [] });
        }
        partIndex.get(t.url).tracks.push(t);
    });
}

function getPartSizeFromStorage(url) {
    const v = localStorage.getItem('part-size:' + url);
    return v ? parseInt(v, 10) : 0;
}

function setPartSizeToStorage(url, size) {
    localStorage.setItem('part-size:' + url, String(size));
}

function removePartSizeFromStorage(url) {
    localStorage.removeItem('part-size:' + url);
}

// ============================================================
// 缓存操作
// ============================================================
async function isUrlCached(url) {
    if (!('caches' in window)) return false;
    try {
        const cache = await caches.open(AUDIO_CACHE);
        const resp = await cache.match(url);
        return !!resp;
    } catch (e) {
        return false;
    }
}

// 返回可给 audio.src 使用的地址
async function getAudioSrc(url) {
    if (!url || url === '占位符') return url;
    if (blobUrlCache.has(url)) return blobUrlCache.get(url);

    try {
        const cache = await caches.open(AUDIO_CACHE);
        const resp = await cache.match(url);
        if (resp) {
            const blob = await resp.blob();
            const blobUrl = URL.createObjectURL(blob);
            blobUrlCache.set(url, blobUrl);
            return blobUrl;
        }
    } catch (e) {
        console.warn('[Cache] 读取失败:', e);
    }
    return url;
}

// 更新播放器上缓存按钮的状态
async function refreshCacheBtn() {
    if (currentIdx < 0) {
        mpCacheBtn.innerHTML = ICON_CLOUD_DOWN;
        mpCacheBtn.classList.remove('cached', 'downloading');
        mpCacheBtn.title = '';
        return;
    }

    const track = allTracks[currentIdx];
    if (!track || !track.url) return;

    // 下载中
    if (currentTask && currentTask.url === track.url) {
        updateDownloadingUI();
        return;
    }

    const cached = await isUrlCached(track.url);
    if (cached) {
        mpCacheBtn.innerHTML = ICON_CLOUD_CHECK;
        mpCacheBtn.classList.remove('downloading');
        mpCacheBtn.classList.add('cached');
        mpCacheBtn.title = '已缓存（点击删除）';
    } else {
        mpCacheBtn.innerHTML = ICON_CLOUD_DOWN;
        mpCacheBtn.classList.remove('cached', 'downloading');
        mpCacheBtn.title = '缓存本 part';
    }
}

function updateDownloadingUI() {
    if (!currentTask) return;
    mpCacheBtn.classList.add('downloading');
    mpCacheBtn.classList.remove('cached');

    let text = '取消';
    if (currentTask.total > 0) {
        const pct = Math.min(100, Math.round(currentTask.received / currentTask.total * 100));
        text = pct + '%';
    } else if (currentTask.received > 0) {
        text = formatSize(currentTask.received);
    }
    mpCacheBtn.innerHTML = `<span style="font-size:0.62rem;font-weight:700">${text}</span>`;
    mpCacheBtn.title = '点击取消下载';
}

// ============================================================
// 下载
// ============================================================
async function startDownload(url) {
    const info = partIndex.get(url);
    const count = info ? info.tracks.length : 0;

    // 尝试获取大小（HEAD 请求）
    let sizeText = '大小未知';
    try {
        const head = await fetch(url, { method: 'HEAD', mode: 'cors' });
        const len = head.headers.get('Content-Length');
        if (len) {
            sizeText = formatSize(parseInt(len, 10));
        }
    } catch (e) {
        // 忽略
    }

    const msg = `本 part 包含 ${count} 集，${sizeText}。\n\n缓存后可离线收听这些集。\n\n开始缓存？`;
    if (!confirm(msg)) return;

    const controller = new AbortController();
    currentTask = {
        url,
        controller,
        received: 0,
        total: 0,
        startedAt: Date.now(),
    };

    updateDownloadingUI();
    if (manager.classList.contains('open')) renderManager();

    try {
        const resp = await fetch(url, { signal: controller.signal, mode: 'cors' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);

        const total = parseInt(resp.headers.get('Content-Length') || '0', 10);
        currentTask.total = total;

        const reader = resp.body.getReader();
        const chunks = [];
        let received = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.length;
            currentTask.received = received;
            updateDownloadingUI();
            // 管理面板同步更新（每 512KB 才刷新）
            if (manager.classList.contains('open') && received % 524288 < value.length) {
                renderManager();
            }
        }

        const blob = new Blob(chunks, { type: 'audio/mp4' });

        const cache = await caches.open(AUDIO_CACHE);
        await cache.put(url, new Response(blob, {
            headers: {
                'Content-Type': 'audio/mp4',
                'Content-Length': String(blob.size),
            },
        }));

        setPartSizeToStorage(url, blob.size);
    } catch (err) {
        if (err.name === 'AbortError') {
            console.log('[Cache] 用户已取消');
        } else {
            console.error('缓存失败:', err);
            alert('缓存失败：' + (err.message || err) + '\n\n可能原因：服务器不支持跨域请求（CORS）。');
        }
    } finally {
        currentTask = null;
        await refreshCacheBtn();
        if (manager.classList.contains('open')) renderManager();
    }
}

// ============================================================
// 缓存按钮点击
// ============================================================
async function onCacheBtnClick() {
    if (currentIdx < 0) return;
    const track = allTracks[currentIdx];
    if (!track || !track.url || track.url === '占位符') return;

    const url = track.url;

    // 正在下载本 part → 取消
    if (currentTask && currentTask.url === url) {
        currentTask.controller.abort();
        return;
    }

    // 有其他任务在跑 → 提示
    if (currentTask) {
        alert('已有下载任务进行中，请先等待完成或取消。');
        return;
    }

    // 已缓存 → 询问删除
    if (await isUrlCached(url)) {
        if (!confirm('本 part 已缓存。\n\n确定要删除缓存吗？删除后此 part 将无法离线收听。')) {
            return;
        }
        await deletePartByUrl(url);
        return;
    }

    // 开始下载
    await startDownload(url);
}

// ============================================================
// 删除
// ============================================================
async function deletePartByUrl(url) {
    try {
        const cache = await caches.open(AUDIO_CACHE);
        await cache.delete(url);
        removePartSizeFromStorage(url);
        if (blobUrlCache.has(url)) {
            URL.revokeObjectURL(blobUrlCache.get(url));
            blobUrlCache.delete(url);
        }
    } catch (e) {
        console.error('删除失败:', e);
    }
    await refreshCacheBtn();
    if (manager.classList.contains('open')) renderManager();
}

// ============================================================
// 缓存管理弹层
// ============================================================
function openManager() {
    manager.classList.add('open');
    managerMask.classList.add('open');
    document.body.style.overflow = 'hidden';
    renderManager();
}

function closeManager() {
    manager.classList.remove('open');
    managerMask.classList.remove('open');
    document.body.style.overflow = '';
}

async function renderManager() {
    const cache = await caches.open(AUDIO_CACHE);

    // 遍历 partIndex 找到已缓存的
    const cachedItems = [];
    for (const [url, info] of partIndex) {
        const resp = await cache.match(url);
        if (resp) {
            const size = getPartSizeFromStorage(url);
            cachedItems.push({
                url,
                count: info.tracks.length,
                size,
                title: info.tracks[0] ? info.tracks[0].title : url,
            });
        }
    }

    // 进行中的任务
    const tasks = currentTask ? [currentTask] : [];

    // 计算总占用
    let totalSize = 0;
    cachedItems.forEach(i => { totalSize += i.size; });

    // 渲染
    let html = '';

    if (tasks.length > 0) {
        html += `<div class="manager-section-title">进行中</div>`;
        tasks.forEach(t => {
            const pct = t.total > 0 ? Math.min(100, Math.round(t.received / t.total * 100)) : 0;
            const sub = t.total > 0
                ? `${formatSize(t.received)} / ${formatSize(t.total)} · ${pct}%`
                : `${formatSize(t.received)} · 计算中`;
            html += `
                <div class="manager-task">
                    <div class="mt-info">
                        <div class="mt-title">缓存中…</div>
                        <div class="mt-sub">${sub}</div>
                        <div class="mt-progress"><div class="mt-progress-bar" style="width:${pct}%"></div></div>
                    </div>
                    <button class="mt-cancel" data-action="cancel">取消</button>
                </div>
            `;
        });
    }

    if (cachedItems.length > 0) {
        html += `<div class="manager-section-title">已缓存 · ${cachedItems.length} 项 · ${formatSize(totalSize)}</div>`;
        cachedItems.forEach(i => {
            html += `
                <div class="manager-item">
                    <div class="mi-info">
                        <div class="mi-title">${escapeHtml(i.title)}</div>
                        <div class="mi-sub">共 ${i.count} 集 · ${i.size > 0 ? formatSize(i.size) : '未知大小'}</div>
                    </div>
                    <button class="mi-delete" data-url="${escapeHtml(i.url)}" aria-label="删除">${ICON_TRASH}</button>
                </div>
            `;
        });
    }

    if (html === '') {
        html = `<div class="manager-empty">暂无缓存</div>`;
    }

    managerBody.innerHTML = html;

    // 底栏
    if (cachedItems.length > 0) {
        managerFooter.innerHTML = `
            <button class="mf-clear" id="mfClearBtn">清空全部（${formatSize(totalSize)}）</button>
        `;
        document.getElementById('mfClearBtn').addEventListener('click', clearAllCache);
    } else {
        managerFooter.innerHTML = '';
    }

    // 绑定事件
    managerBody.querySelectorAll('.mt-cancel').forEach(btn => {
        btn.addEventListener('click', () => {
            if (currentTask) currentTask.controller.abort();
        });
    });
    managerBody.querySelectorAll('.mi-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            const url = btn.dataset.url;
            if (confirm('删除这项缓存？')) {
                await deletePartByUrl(url);
            }
        });
    });
}

async function clearAllCache() {
    if (!confirm('确定清空所有已缓存的 part 吗？')) return;

    if (currentTask) {
        currentTask.controller.abort();
    }

    try {
        const cache = await caches.open(AUDIO_CACHE);
        const keys = await cache.keys();
        for (const k of keys) {
            await cache.delete(k);
        }
    } catch (e) {
        console.error('清空缓存失败:', e);
    }

    Object.keys(localStorage).forEach(k => {
        if (k.startsWith('part-size:')) localStorage.removeItem(k);
    });

    blobUrlCache.forEach(u => URL.revokeObjectURL(u));
    blobUrlCache.clear();

    await refreshCacheBtn();
    renderManager();
}

// ============================================================
// 标题自动滚动
// ============================================================
let _titleScrollTimer = null;
function setupTitleScroll() {
    const inner = mpTitleInner;
    inner.classList.remove('scrolling');
    inner.style.removeProperty('--scroll-dist');
    inner.style.removeProperty('--scroll-duration');
    void inner.offsetWidth;

    const innerW = inner.scrollWidth;
    const outerW = mpTitle.clientWidth;
    const overflow = innerW - outerW;

    if (overflow > 6) {
        const duration = Math.max(4, Math.min(14, overflow / 18));
        inner.style.setProperty('--scroll-dist', `-${overflow + 6}px`);
        inner.style.setProperty('--scroll-duration', `${duration}s`);
        inner.classList.add('scrolling');
    }
}

window.addEventListener('resize', () => {
    clearTimeout(_titleScrollTimer);
    _titleScrollTimer = setTimeout(setupTitleScroll, 150);
});

// ============================================================
// 数据扁平化 & 渲染
// ============================================================
function flattenData(raw) {
    const defaults = raw.defaults || {};
    const categories = raw.categories || {};
    const audios = raw.audios || [];
    const flat = [];

    audios.forEach(zone => {
        const catMeta = categories[zone.category] || {};
        const cover = zone.cover || catMeta.cover || defaults.cover || '';
        const tracks = Array.isArray(zone.tracks) ? zone.tracks : [];
        tracks.forEach(t => {
            flat.push({
                title: t.title || '',
                url: zone.url || '',
                start: Number(t.start) || 0,
                end: Number(t.end) || 0,
                category: zone.category || '',
                cover: cover,
            });
        });
    });

    flat.forEach((t, i) => { t._idx = i; });
    return flat;
}

async function loadData() {
    try {
        const response = await fetch('data.json');
        if (!response.ok) throw new Error('无法加载 data.json');
        const raw = await response.json();
        allTracks = flattenData(raw);
        buildPartIndex();
        renderList(allTracks);
        populateCategories(allTracks);
    } catch (error) {
        audioListEl.innerHTML = `<div class="empty-message">⚠️ 数据加载失败，请确保 data.json 与 index.html 在同一目录下。</div>`;
        console.error(error);
    }
}

function renderList(tracks) {
    if (tracks.length === 0) {
        audioListEl.innerHTML = `<div class="empty-message">🔍 没有找到匹配的音频</div>`;
        return;
    }

    audioListEl.innerHTML = tracks.map((t, i) => {
        return `
            <div class="audio-item" data-idx="${t._idx}">
                <span class="audio-index">${i + 1}</span>
                <span class="audio-title">${escapeHtml(t.title)}</span>
                ${t.category ? `<span class="audio-category">${escapeHtml(t.category)}</span>` : ''}
            </div>
        `;
    }).join('');

    updateHighlight();
}

function populateCategories(tracks) {
    const categories = [...new Set(tracks.map(item => item.category).filter(Boolean))];
    categorySelect.innerHTML = '<option value="">全部</option>' +
        categories.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('');
}

function applyFilter() {
    const keyword = searchInput.value.toLowerCase().trim();
    const cat = categorySelect.value;

    const filtered = allTracks.filter(item => {
        const titleMatch = item.title.toLowerCase().includes(keyword);
        const catOk = !cat || item.category === cat;
        const keywordOk = !keyword || titleMatch;
        return keywordOk && catOk;
    });

    renderList(filtered);
}

function updateHighlight() {
    document.querySelectorAll('.audio-item').forEach(el => {
        const idx = parseInt(el.dataset.idx, 10);
        el.classList.toggle('playing', idx === currentIdx);
    });
}

// ============================================================
// 播放
// ============================================================
async function playTrack(idx) {
    const track = allTracks[idx];
    if (!track) return;

    if (idx === currentIdx) {
        if (audio.paused) {
            audio.play().catch(console.error);
        } else {
            audio.pause();
        }
        return;
    }

    if (!navigator.onLine) {
        const cached = await isUrlCached(track.url);
        if (!cached) {
            alert('此集未缓存，需要联网播放。\n\n提示：联网后点击播放器上的缓存按钮可缓存本 part，之后离线可听。');
            return;
        }
    }

    const prevTrack = currentIdx >= 0 ? allTracks[currentIdx] : null;
    const sameFile = prevTrack && prevTrack.url === track.url && audio.src;
    currentIdx = idx;

    if (sameFile) {
        audio.currentTime = track.start;
        applySpeed();
        if (audio.paused) {
            audio.play().catch(console.error);
        }
        updateMiniPlayer(track);
        updateProgress();
        updateHighlight();
        refreshCacheBtn();
    } else {
        const src = await getAudioSrc(track.url);
        audio.src = src;
        applySpeed();
        const onLoaded = () => {
            audio.removeEventListener('loadedmetadata', onLoaded);
            audio.currentTime = track.start;
            audio.play().catch(err => {
                console.error('播放失败:', err);
                mpTitleInner.textContent = '播放失败：' + track.title;
            });
        };
        audio.addEventListener('loadedmetadata', onLoaded);
        audio.load();
        updateMiniPlayer(track);
        updateHighlight();
        refreshCacheBtn();
    }
}

function applySpeed() {
    const rate = SPEEDS[speedIndex];
    audio.playbackRate = rate;
    audio.defaultPlaybackRate = rate;
}

function updateSpeedBtn() {
    const rate = SPEEDS[speedIndex];
    mpSpeedBtn.textContent = rate + 'x';
    mpSpeedBtn.classList.toggle('active', rate !== 1);
}

function updateMiniPlayer(track) {
    if (track.cover) {
        mpCover.src = track.cover;
        mpCover.style.display = '';
    } else {
        mpCover.style.display = 'none';
    }
    mpTitleInner.textContent = track.title || '—';
    mpProgressBar.style.width = '0%';
    mpTime.textContent = '0:00 / 0:00';
    miniPlayer.classList.add('active');

    requestAnimationFrame(() => requestAnimationFrame(setupTitleScroll));
}

function updateProgress() {
    if (currentIdx < 0) return;
    const track = allTracks[currentIdx];
    const dur = track.end - track.start;
    const pos = Math.max(0, Math.min(dur, audio.currentTime - track.start));

    const pct = dur > 0 ? (pos / dur) * 100 : 0;
    mpProgressBar.style.width = pct + '%';
    mpTime.textContent = formatTime(pos) + ' / ' + formatTime(dur);
}

function closePlayer() {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    currentIdx = -1;
    miniPlayer.classList.remove('active');
    updateHighlight();
    refreshCacheBtn();
}

// ============================================================
// 事件绑定
// ============================================================
audioListEl.addEventListener('click', (e) => {
    const item = e.target.closest('.audio-item');
    if (!item) return;
    const idx = parseInt(item.dataset.idx, 10);
    playTrack(idx);
});

mpPlayBtn.addEventListener('click', () => {
    if (!audio.src) return;
    if (audio.paused) {
        audio.play().catch(console.error);
    } else {
        audio.pause();
    }
});

miniPlayer.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-skip]');
    if (!btn) return;
    if (currentIdx < 0) return;
    const delta = parseInt(btn.dataset.skip, 10);
    const track = allTracks[currentIdx];
    audio.currentTime = Math.max(track.start, Math.min(track.end, audio.currentTime + delta));
    updateProgress();
});

mpCloseBtn.addEventListener('click', closePlayer);
mpCacheBtn.addEventListener('click', onCacheBtnClick);

headerManagerBtn.addEventListener('click', openManager);
managerCloseBtn.addEventListener('click', closeManager);
managerMask.addEventListener('click', closeManager);

mpSpeedBtn.addEventListener('click', () => {
    speedIndex = (speedIndex + 1) % SPEEDS.length;
    applySpeed();
    updateSpeedBtn();
});

mpProgressWrap.addEventListener('click', (e) => {
    if (currentIdx < 0) return;
    const track = allTracks[currentIdx];
    const dur = track.end - track.start;
    if (dur <= 0) return;

    const rect = mpProgressWrap.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = track.start + pct * dur;
    updateProgress();
});

audio.addEventListener('play', () => {
    mpPlayBtn.innerHTML = ICON_PAUSE;
});

audio.addEventListener('pause', () => {
    mpPlayBtn.innerHTML = ICON_PLAY;
});

audio.addEventListener('timeupdate', () => {
    if (currentIdx < 0) return;
    const track = allTracks[currentIdx];

    updateProgress();

    if (!audio.paused && audio.currentTime >= track.end - 0.05) {
        if (currentIdx + 1 < allTracks.length) {
            playTrack(currentIdx + 1);
        } else {
            audio.pause();
            audio.currentTime = track.end;
            updateProgress();
        }
    }
});

audio.addEventListener('loadedmetadata', updateProgress);
audio.addEventListener('durationchange', updateProgress);

audio.addEventListener('ended', () => {
    mpPlayBtn.innerHTML = ICON_PLAY;
    mpProgressBar.style.width = '0%';
});

audio.addEventListener('error', () => {
    console.error('音频加载失败');
    mpTime.textContent = '0:00 / --:--';
});

searchInput.addEventListener('input', applyFilter);
categorySelect.addEventListener('change', applyFilter);

// 下载中：管理面板开着时定时刷新
setInterval(() => {
    if (currentTask && manager.classList.contains('open')) {
        renderManager();
    }
}, 1000);

// ============================================================
// 初始化
// ============================================================
updateSpeedBtn();
loadData();

// ============================================================
// Service Worker 注册
// ============================================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then((reg) => {
                console.log('[PWA] SW 已注册，作用域:', reg.scope);
            })
            .catch((err) => {
                console.error('[PWA] SW 注册失败:', err);
            });
    });
}
