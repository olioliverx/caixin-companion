import { parseRenderedArticleDocument } from './article.js';
import { detectCaixinPage } from './detect.js';
import { isArticleUrl, isImageUrl, isSameArticleUrl, inspectRenderedPage, findFullArticleUrl, sanitizeFileName, canonicalArticleUrl, scrollPendingArticleImage } from './caixin.js';
import { readBounded } from './network.js';
import { buildEpub } from './epub.js';

export const LIMITS = Object.freeze({ articleBytes: 2 * 1024 * 1024, textBytes: 16 * 1024 * 1024, imageBytes: 8 * 1024 * 1024, allImages: 40 * 1024 * 1024, renderMs: 20000, downloadMs: 10 * 60 * 1000 });
export function pause(ms, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
export async function runExport({ sourceTabId, send, signal }) {
  const update = async (phase, percent, text, extra = {}) => {
    signal.throwIfAborted();
    const state = await send({ type: 'progress', phase, percent, text, ...extra });
    if (state.cancelled) throw new DOMException('已取消导出。', 'AbortError');
  };
  await update('discovery', 0, '正在复核原站目录…');
  const [{ result: detected }] = await chrome.scripting.executeScript({ target: { tabId: sourceTabId }, func: detectCaixinPage });
  if (!detected?.ok) throw new Error(detected?.message || '无法识别原站页面。');
  if (!detected.articles?.length || detected.articles.length > 150 || detected.articles.some(ref => !isArticleUrl(ref.url))) throw new Error('文章清单为空、超出上限或含无效地址。');
  const inventory = detected.inventory || detected.articles.map(ref => ({ ...ref, status: 'supported' }));
  const warnings = [];
  await update('validation', 0, '正在准备读取文章…', { inventory, warnings });
  if (inventory.some(item => item.status === 'unsupported')) throw new Error('目录含未支持条目，已停止整期导出。请查看文章清单。');
  const articles = [];
  let textBytes = 0;
  for (let index = 0; index < detected.articles.length; index++) {
    signal.throwIfAborted();
    const ref = detected.articles[index];
    const item = inventory.find(item => canonicalArticleUrl(item.url) === canonicalArticleUrl(ref.url));
    item.status = 'reading';
    await update('access', Math.round(index / detected.articles.length * 65), `检查访问权限 ${index + 1}/${detected.articles.length}：${ref.title}`, { inventory });
    try {
      const article = await readArticle(ref, send, signal, () => update('reading', Math.round(index / detected.articles.length * 65), `正在读取：${ref.title}`));
      textBytes += new TextEncoder().encode(article.bodyHtml + article.leadHtml).byteLength;
      if (textBytes > LIMITS.textBytes) throw new Error('本期正文超出 16 MiB 内存处理上限。');
      warnings.push(...(article.warnings || []));
      articles.push(article); item.status = 'read';
    } catch (error) {
      item.status = 'failed'; item.reason = error.message;
      await send({ type: 'progress', phase: 'validation', percent: 0, text: '文章未能完整读取，已停止。', inventory, warnings });
      throw error;
    }
    await update('validation', Math.round((index + 1) / detected.articles.length * 65), `已核对 ${index + 1} 篇`, { inventory, warnings });
    if (index + 1 < detected.articles.length) await pause(900, signal);
  }
  const imageCache = await collectImages(detected.issue, articles, update, warnings, signal);
  await update('packaging', 85, '正在生成 EPUB…', { warnings });
  const epub = await buildEpub({ issue: detected.issue, articles, imageCache, warnings });
  imageCache.clear();
  articles.length = 0;
  await update('saving', 95, '请选择保存位置，等待浏览器确认。取消时请同时关闭浏览器保存对话框。');
  await saveBlob(epub, `${sanitizeFileName(detected.issue.title)}.epub`, send, signal);
  return warnings;
}

export async function waitForArticle(tabId, originalUrl, signal, timeout = LIMITS.renderMs, prepareImages) {
  const deadline = Date.now() + timeout;
  let last = '', stable = 0, pendingMessage = '';
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    const tab = await chrome.tabs.get(tabId);
    if (tab.status !== 'complete') { await pause(700, signal); continue; }
    if (!isSameArticleUrl(tab.url, originalUrl)) throw new Error('文章跳转到登录页、其他文章或不支持的页面。');
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: inspectRenderedPage });
    if (!isSameArticleUrl(result?.url, originalUrl)) throw new Error('页面来源已变化。');
    if (result.tooLarge) throw new Error('页面正文或导航超出处理上限。');
    const stamp = JSON.stringify([result.textLength, result.links]);
    stable = result.readyState === 'complete' && result.textLength > 0 && stamp === last ? stable + 1 : 0;
    last = stamp;
    if (stable >= 2) {
      const [{ result: access }] = await chrome.scripting.executeScript({ target: { tabId }, func: parseRenderedArticleDocument, args: [originalUrl, {}, 100, 'inspect'] });
      if (access?.ok) return result;
      pendingMessage = access?.message || '';
      if (access?.access?.reason === 'image-loading') {
        await prepareImages?.();
        await chrome.scripting.executeScript({ target: { tabId }, func: scrollPendingArticleImage });
      }
      if (!['loading', 'image-loading', 'empty-access-wall', 'missing-body', 'empty-body'].includes(access?.access?.reason)) throw new Error(access?.message || '无法确认页面可读状态。');
    }
    await pause(700, signal);
  }
  throw new Error(pendingMessage || '页面渲染或权限状态未在限定时间内稳定，请回原站确认后重试。');
}
async function readArticle(ref, send, signal, reading) {
  const { tabId } = await send({ type: 'openArticle', url: ref.url });
  try {
    let activated = false;
    const prepareImages = async () => {
      if (activated) return;
      await send({ type: 'activateArticle', tabId }); activated = true;
    };
    let page = await waitForArticle(tabId, ref.url, signal, LIMITS.renderMs, prepareImages);
    const full = findFullArticleUrl(page.links, page.url);
    if (full) {
      await send({ type: 'navigateArticle', tabId, url: full, originalUrl: ref.url });
      page = await waitForArticle(tabId, ref.url, signal, LIMITS.renderMs, prepareImages);
    }
    if (page.links.some(link => /全文|下一页/.test(link.text) || (/^\d+$/.test(link.text.trim()) && /[?&]p\d+/.test(link.href)))) throw new Error('页面仍含分页入口，无法确认全文，已停止。');
    await reading(); signal.throwIfAborted();
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: parseRenderedArticleDocument, args: [ref.url, ref, 100] });
    if (!result?.ok || result.access?.status !== 'READABLE') throw new Error(result?.message || '未确认正文可读状态。');
    if (!isSameArticleUrl(result.article.url, ref.url) || !result.article.bodyHtml) throw new Error('正文地址变化或内容为空。');
    result.article.url = canonicalArticleUrl(ref.url);
    return result.article;
  } finally { await send({ type: 'closeArticle', tabId }); }
}
export async function collectImages(issue, articles, update, warnings, signal) {
  const urls = new Set([...(issue.coverUrl ? [issue.coverUrl] : []), ...articles.flatMap(article => article.images.map(image => image.url))]);
  const cache = new Map();
  let total = 0, count = 0;
  for (const url of urls) {
    signal.throwIfAborted();
    await update('reading', 68 + Math.round(++count / urls.size * 12), `正在保存图片 ${count}/${urls.size}`);
    if (!isImageUrl(url) || total >= LIMITS.allImages) continue;
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error('图片请求超时。')), 15000);
    try {
      const response = await fetch(url, { credentials: 'omit', cache: 'force-cache', redirect: 'error', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const type = response.headers.get('content-type')?.split(';')[0].trim();
      if (!['image/jpeg', 'image/png'].includes(type)) { await response.body?.cancel(); continue; }
      const bytes = await readBounded(response, Math.min(LIMITS.imageBytes, LIMITS.allImages - total));
      const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      if (type === 'image/png' ? !png : !jpeg) continue;
      total += bytes.length;
      cache.set(url, { bytes, mediaType: type, extension: type === 'image/png' ? 'png' : 'jpg' });
    } catch { signal.throwIfAborted(); }
    finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
  }
  if (cache.size < urls.size) warnings.push(`${urls.size - cache.size} 张图片未保存（网络、格式或大小限制）；输出会标示缺图。`);
  return cache;
}
export async function saveBlob(blob, filename, send, signal, timeout = LIMITS.downloadMs) {
  signal.throwIfAborted();
  const url = URL.createObjectURL(blob);
  let id;
  try {
    await send({ type: 'prepareDownload', url });
    signal.throwIfAborted();
    id = await chrome.downloads.download({ url, filename, saveAs: true });
    await send({ type: 'recordDownload', downloadId: id });
    const deadline = Date.now() + timeout;
    while (true) {
      const [item] = await chrome.downloads.search({ id });
      if (item?.state === 'complete') return;
      if (!item || item.state === 'interrupted') throw new Error('下载未完成或保存已取消。');
      if (signal.aborted || Date.now() > deadline) {
        await chrome.downloads.cancel(id).catch(() => {});
        const [final] = await chrome.downloads.search({ id });
        if (final?.state === 'complete') return;
        throw signal.reason || new Error('等待保存超时，请重新导出。');
      }
      // Polling is confined to the task document, never used to keep a worker alive.
      await pause(500);
    }
  } catch (error) {
    if (id !== undefined) {
      const [item] = await chrome.downloads.search({ id }).catch(() => []);
      if (item?.state === 'in_progress') await chrome.downloads.cancel(id).catch(() => {});
    }
    throw error;
  } finally { URL.revokeObjectURL(url); }
}
