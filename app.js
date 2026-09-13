// ============================================================
// 全局状态
// ============================================================
let novelsIndex = null;
let allTracks = [];
let currentNovel = null;
let currentPlaying = null;

const audio = new Audio();
audio.preload = 'none';

const SPEEDS = [1, 1.25, 1.5, 2, 0.75];
let speedIndex = 0;

const AUDIO_CACHE = 'audio-v1';
const blobUrlCache = new Map();
const partIndex = new Map();
const novelDataCache = new Map();

let currentTask = null;

// ============================================================
// DOM 引用
// ============================================================
const headerTitle = document.getElementById('headerTitle');
const headerBackBtn = document.getElementById('headerBackBtn');
const headerManagerBtn = document.getElementById('headerManagerBtn');
const controlsBar = document.getElementById('controlsBar');
const searchInput = document.getElementById('searchInput');
const categorySelect = document.getElementById('categorySelect');
const mainView = document.getElementById('mainView');

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
const ICON_BACK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>';
const ICON_CLOUD_DOWN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 13v8"/><path d="m8 17 4 4 4-4"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/></svg>';
const ICON_CLOUD_CHECK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM10 17l-3.5-3.5 1.41-1.41L10 14.17 15.18 9l1.41 1.41L10 17z"/></svg>';
const ICON_MANAGER = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
const ICON_TRASH = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

mpPlayBtn.innerHTML = ICON_PLAY;
mpCloseBtn.innerHTML = ICON_CLOSE;
mpCacheBtn.innerHTML = ICON_CLOUD_DOWN;
headerManagerBtn.innerHTML = ICON_MANAGER;
headerBackBtn.innerHTML = ICON_BACK;
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
    if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
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
// 数据扁平化
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

// ============================================================
// 视图切换
// ============================================================
async function showNovelList() {
    currentNovel = null;
    allTracks = [];
    partIndex.clear();

    headerTitle.textContent = '转载奇刀君';
    headerBackBtn.style.display = 'none';
    controlsBar.style.display = 'none';

    const url = new URL(window.location);
    url.searchParams.delete('novel');
    history.pushState({}, '', url);

    renderNovelList();
}

async function showNovelDetail(id, pushState = true) {
    let raw = novelDataCache.get(id);
    if (!raw) {
        const novel = novelsIndex.novels.find(n => n.id === id);
        if (!novel) {
            alert('未找到该小说');
            showNovelList();
            return;
        }
        try {
            const resp = await fetch(novel.file);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            raw = await resp.json();
            novelDataCache.set(id, raw);
        } catch (e) {
            mainView.innerHTML = `<div class="empty-message">⚠️ 无法加载小说数据：${e.message}</div>`;
            return;
        }
    }

    currentNovel = novelsIndex.novels.find(n => n.id === id) || { id, title: id };
    allTracks = flattenData(raw);
    buildPartIndex();

    headerTitle.textContent = currentNovel.title;
    headerBackBtn.style.display = 'flex';
    controlsBar.style.display = 'flex';
    searchInput.value = '';

    if (pushState) {
        const url = new URL(window.location);
        url.searchParams.set('novel', id);
        history.pushState({ novelId: id }, '', url);
    }

    populateCategories(allTracks);
    renderTrackList(allTracks);
}

// ============================================================
// 渲染：小说列表
// ============================================================
function renderNovelList() {
    if (!novelsIndex || !novelsIndex.novels || novelsIndex.novels.length === 0) {
        mainView.innerHTML = `<div class="empty-message">暂无小说</div>`;
        return;
    }

    mainView.innerHTML = `
        <div class="novel-grid">
            ${novelsIndex.novels.map(n => `
                <div class="novel-card" data-id="${escapeHtml(n.id)}" title="${escapeHtml(n.title)}">
                    ${n.cover
                        ? `<img class="novel-card-cover" src="${escapeHtml(n.cover)}" alt="" loading="lazy" onerror="this.style.display='none'">`
                        : `<div class="novel-card-cover"></div>`}
                    <div class="novel-card-title">${escapeHtml(n.title)}</div>
                </div>
            `).join('')}
        </div>
    `;
}

// ============================================================
// 渲染：扁平集列表（和旧版一致）
// ============================================================
function renderTrackList(tracks) {
    if (tracks.length === 0) {
        mainView.innerHTML = `<div class="empty-message">🔍 没有找到匹配的音频</div>`;
        return;
    }

    mainView.innerHTML = `
        <div class="audio-list">
            ${tracks.map((t, i) => `
                <div class="audio-item" data-idx="${t._idx}">
                    <span class="audio-index">${i + 1}</span>
                    <span class="audio-title">${escapeHtml(t.title)}</span>
                    ${t.category ? `<span class="audio-category">${escapeHtml(t.category)}</span>` : ''}
                </div>
            `).join('')}
        </div>
    `;

    updateHighlight();
}

// ============================================================
// 分类下拉框
// ============================================================
function populateCategories(tracks) {
    const categories = [...new Set(tracks.map(item => item.category).filter(Boolean))];
    categorySelect.innerHTML = '<option value="">全部</option>' +
        categories.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('');
}

// ============================================================
// 搜索 + 分类筛选
// ============================================================
function applyFilter() {
    if (!currentNovel) return;

    const keyword = searchInput.value.toLowerCase().trim();
    const cat = categorySelect.value;

    const filtered = allTracks.filter(item => {
        const titleMatch = item.title.toLowerCase().includes(keyword);
        const catOk = !cat || item.category === cat;
        const keywordOk = !keyword || titleMatch;
        return keywordOk && catOk;
    });

    renderTrackList(filtered);
}

// ============================================================
// 高亮
// ============================================================
function updateHighlight() {
    document.querySelectorAll('.audio-item').forEach(el => {
        const idx = parseInt(el.dataset.idx, 10);
        const t = allTracks[idx];
        const isPlaying = currentPlaying && t &&
            t.url === currentPlaying.url &&
            t.start === currentPlaying.start;
        el.classList.toggle('playing', isPlaying);
    });
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

async function refreshCacheBtn() {
    if (!currentPlaying) {
        mpCacheBtn.innerHTML = ICON_CLOUD_DOWN;
        mpCacheBtn.classList.remove('cached', 'downloading');
        mpCacheBtn.title = '缓存本 part（离线收听）';
        return;
    }

    const url = currentPlaying.url;
    if (!url || url === '占位符') return;

    if (currentTask && currentTask.url === url) {
        updateDownloadingUI();
        return;
    }

    const cached = await isUrlCached(url);
    if (cached) {
        mpCacheBtn.innerHTML = ICON_CLOUD_CHECK;
        mpCacheBtn.classList.remove('downloading');
        mpCacheBtn.classList.add('cached');
        mpCacheBtn.title = '已缓存（点击删除）';
    } else {
        mpCacheBtn.innerHTML = ICON_CLOUD_DOWN;
        mpCacheBtn.classList.remove('cached', 'downloading');
        mpCacheBtn.title = '缓存本 part（离线收听）';
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

    let sizeText = '大小未知';
    try {
        const head = await fetch(url, { method: 'HEAD', mode: 'cors' });
        const len = head.headers.get('Content-Length');
        if (len) sizeText = formatSize(parseInt(len, 10));
    } catch (e) {}

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

async function onCacheBtnClick() {
    if (!currentPlaying) return;
    const url = currentPlaying.url;
    if (!url || url === '占位符') return;

    if (currentTask && currentTask.url === url) {
        currentTask.controller.abort();
        return;
    }

    if (currentTask) {
        alert('已有下载任务进行中，请先等待完成或取消。');
        return;
    }

    if (await isUrlCached(url)) {
        if (!confirm('本 part 已缓存。\n\n确定要删除缓存吗？删除后此 part 将无法离线收听。')) {
            return;
        }
        await deletePartByUrl(url);
        return;
    }

    await startDownload(url);
}

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
// 缓存管理
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

    const tasks = currentTask ? [currentTask] : [];
    let totalSize = 0;
    cachedItems.forEach(i => { totalSize += i.size; });

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
                    <button class="mt-cancel" title="取消下载">取消</button>
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
                    <button class="mi-delete" data-url="${escapeHtml(i.url)}" aria-label="删除" title="删除此项缓存">${ICON_TRASH}</button>
                </div>
            `;
        });
    }

    if (html === '') {
        html = `<div class="manager-empty">暂无缓存</div>`;
    }

    managerBody.innerHTML = html;

    if (cachedItems.length > 0) {
        managerFooter.innerHTML = `
            <button class="mf-clear" id="mfClearBtn" title="清空全部缓存">清空全部（${formatSize(totalSize)}）</button>
        `;
        document.getElementById('mfClearBtn').addEventListener('click', clearAllCache);
    } else {
        managerFooter.innerHTML = '';
    }

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

    if (currentTask) currentTask.controller.abort();

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
// 播放
// ============================================================
async function playTrack(track) {
    if (!track) return;

    const isSame = currentPlaying &&
        currentPlaying.url === track.url &&
        currentPlaying.start === track.start;

    if (isSame) {
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

    const sameFile = currentPlaying && currentPlaying.url === track.url && audio.src;
    currentPlaying = track;

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
    if (!currentPlaying) return;
    const track = currentPlaying;
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
    currentPlaying = null;
    miniPlayer.classList.remove('active');
    updateHighlight();
    refreshCacheBtn();
}

// ============================================================
// 事件绑定
// ============================================================
mainView.addEventListener('click', (e) => {
    const card = e.target.closest('.novel-card');
    if (card) {
        const id = card.dataset.id;
        showNovelDetail(id);
        return;
    }

    const item = e.target.closest('.audio-item');
    if (item) {
        const idx = parseInt(item.dataset.idx, 10);
        playTrack(allTracks[idx]);
    }
});

headerBackBtn.addEventListener('click', () => {
    history.back();
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
    if (!currentPlaying) return;
    const delta = parseInt(btn.dataset.skip, 10);
    audio.currentTime = Math.max(
        currentPlaying.start,
        Math.min(currentPlaying.end, audio.currentTime + delta)
    );
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
    if (!currentPlaying) return;
    const dur = currentPlaying.end - currentPlaying.start;
    if (dur <= 0) return;

    const rect = mpProgressWrap.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = currentPlaying.start + pct * dur;
    updateProgress();
});

audio.addEventListener('play', () => {
    mpPlayBtn.innerHTML = ICON_PAUSE;
});

audio.addEventListener('pause', () => {
    mpPlayBtn.innerHTML = ICON_PLAY;
});

audio.addEventListener('timeupdate', () => {
    if (!currentPlaying) return;
    const track = currentPlaying;

    updateProgress();

    if (!audio.paused && audio.currentTime >= track.end - 0.05) {
        const idx = allTracks.findIndex(t =>
            t.url === track.url && t.start === track.start
        );
        if (idx >= 0 && idx + 1 < allTracks.length) {
            playTrack(allTracks[idx + 1]);
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

setInterval(() => {
    if (currentTask && manager.classList.contains('open')) {
        renderManager();
    }
}, 1000);

// ============================================================
// URL 参数处理
// ============================================================
function handleUrl() {
    const params = new URLSearchParams(window.location.search);
    const novelId = params.get('novel');
    if (novelId) {
        showNovelDetail(novelId, false);
    } else {
        showNovelList();
    }
}

window.addEventListener('popstate', handleUrl);

// ============================================================
// 悬停提示
// ============================================================
function setupTooltips() {
    headerManagerBtn.title = '缓存管理';
    headerBackBtn.title = '返回小说列表';

    mpPlayBtn.title = '播放 / 暂停';
    mpSpeedBtn.title = '切换播放速度';
    mpCacheBtn.title = '缓存本 part（离线收听）';
    mpCloseBtn.title = '关闭播放器';

    document.querySelectorAll('[data-skip="-15"]').forEach(b => {
        b.title = '后退 15 秒';
    });
    document.querySelectorAll('[data-skip="15"]').forEach(b => {
        b.title = '前进 15 秒';
    });

    managerCloseBtn.title = '关闭';
}

// ============================================================
// 初始化
// ============================================================
async function init() {
    updateSpeedBtn();
    setupTooltips();
    try {
        const resp = await fetch('novels.json');
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        novelsIndex = await resp.json();
    } catch (e) {
        mainView.innerHTML = `<div class="empty-message">⚠️ 无法加载 novels.json：${e.message}</div>`;
        return;
    }
    handleUrl();
}

init();

// ============================================================
// Service Worker 注册
// ============================================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then((reg) => console.log('[PWA] SW 已注册，作用域:', reg.scope))
            .catch((err) => console.error('[PWA] SW 注册失败:', err));
    });
}
