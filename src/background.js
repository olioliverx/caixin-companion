import { isArticleUrl, isSameArticleUrl } from './caixin.js';
import { JOB_KEY, JOB_TTL_MS, JOB_TIMEOUT_MS, PHASES, isRunning, taskUrl, markedUrl, jobView, cleanInventory, cleanupTabs } from './jobs.js';

let bootId;
let job;
let queue = Promise.resolve();
const write = async () => { job.updatedAt = Date.now(); await chrome.storage.local.set({ [JOB_KEY]: job }); };
const ready = (async () => {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  const session = await chrome.storage.session.get('exportBootId');
  bootId = session.exportBootId || crypto.randomUUID();
  if (!session.exportBootId) await chrome.storage.session.set({ exportBootId: bootId });
  job = (await chrome.storage.local.get(JOB_KEY))[JOB_KEY];
  if (!job) return;
  if (isRunning(job)) await recoverIfInterrupted();
  await expireRecord();
})();

function serial(fn) {
  const result = queue.then(async () => { await ready; return fn(); });
  queue = result.catch(() => {});
  return result;
}
async function expireRecord() {
  if (job && !isRunning(job) && Date.now() - job.updatedAt > JOB_TTL_MS) {
    const unclosed = await cleanupTabs(job, bootId);
    if (unclosed.length) return; // Keep ownership evidence until cleanup succeeds.
    await chrome.storage.local.remove(JOB_KEY); job = null;
  }
}
async function finish(phase, text, warnings = []) {
  const unclosed = await cleanupTabs(job, bootId);
  job.tempTabIds = unclosed;
  job.phase = phase; job.text = String(text).slice(0, 2000);
  job.warnings = [...new Set([...(job.warnings || []), ...warnings, ...(unclosed.length ? ['临时标签页关闭失败，请关闭任务创建的文章标签页。'] : [])])].slice(0, 200);
  job.percent = phase === 'complete' ? 100 : job.percent;
  delete job.documentId; delete job.blobUrl;
  await write();
}
async function recoverIfInterrupted(force = false) {
  if (!isRunning(job)) return;
  const tab = job.taskTabId && await chrome.tabs.get(job.taskTabId).catch(() => null);
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [taskUrl(job.id)] });
  const ownsDocument = contexts.some(context => context.tabId === job.taskTabId);
  const opening = tab?.status === 'loading' && !job.documentId && Date.now() - job.createdAt < 20000;
  const expired = Date.now() - job.updatedAt > JOB_TIMEOUT_MS;
  // tabs.Tab.url can be withheld for extension pages without the broad tabs permission.
  // runtime contexts prove ownership of our own task document without that permission.
  if (!force && !expired && job.bootId === bootId && tab && (ownsDocument || opening)) return;
  let saved = false;
  if (job.downloadId !== undefined) {
    let [download] = await chrome.downloads.search({ id: job.downloadId });
    if (download?.state === 'in_progress') {
      await chrome.downloads.cancel(download.id).catch(() => {});
      [download] = await chrome.downloads.search({ id: download.id });
    }
    saved = download?.state === 'complete';
  }
  await finish(saved ? 'complete' : 'failed', saved ? '已恢复浏览器确认的保存结果。' : '任务被关闭或浏览器中断。正文未缓存，请重新开始导出。');
}
function trusted(sender) {
  if (sender.id !== chrome.runtime.id) return false;
  try { const url = new URL(sender.url); return url.protocol === 'chrome-extension:' && url.hostname === chrome.runtime.id && ['/src/popup.html', '/src/task.html'].includes(url.pathname); }
  catch { return false; }
}
function owner(sender, id) {
  if (!isRunning(job) || job.id !== id || sender.tab?.id !== job.taskTabId || sender.url !== taskUrl(job.id) || sender.documentId !== job.documentId) throw new Error('此任务已中断或由另一个任务页持有，请重新开始。');
}
async function handle(message, sender) {
  if (message.type === 'getState') { await recoverIfInterrupted(); await expireRecord(); return { job: jobView(job) }; }
  if (message.type === 'startExport') {
    await recoverIfInterrupted();
    if (isRunning(job)) { await chrome.tabs.update(job.taskTabId, { active: true }); return { job: jobView(job) }; }
    if (!Number.isInteger(message.sourceTabId)) throw new Error('请先选择原站目录标签页。');
    const source = await chrome.tabs.get(message.sourceTabId);
    if (!source.url?.startsWith('https://weekly.caixin.com/')) throw new Error('请在受支持的原站页面开始导出。');
    // Clear leftovers from a previous terminal job before replacing its checkpoint.
    if (job && (await cleanupTabs(job, bootId)).length) throw new Error('请先关闭上次任务未能清理的临时标签页。');
    job = { id: crypto.randomUUID(), bootId, phase: 'discovery', percent: 0, text: '正在打开导出任务页…',
      sourceTabId: source.id, taskTabId: null, tempTabIds: [], inventory: [], warnings: [], createdAt: Date.now(), updatedAt: Date.now() };
    await write();
    try {
      const task = await chrome.tabs.create({ url: taskUrl(job.id), active: true });
      job.taskTabId = task.id; await write();
    } catch (error) { await finish('failed', error.message); throw error; }
    return { job: jobView(job) };
  }
  if (message.type === 'claimJob') {
    if (!isRunning(job) || job.id !== message.id || sender.tab?.id !== job.taskTabId || sender.url !== taskUrl(job.id)) throw new Error('任务已结束，请重新开始。');
    if (job.documentId && job.documentId !== sender.documentId) { await recoverIfInterrupted(true); throw new Error('任务页已重新加载，未保存正文，请重新开始。'); }
    if (!sender.documentId) throw new Error('无法识别任务页。');
    job.documentId = sender.documentId; await write();
    return { sourceTabId: job.sourceTabId, job: jobView(job) };
  }
  if (message.type === 'cancelExport') {
    if (isRunning(job)) { job.cancelRequested = true; job.text = '正在取消…'; await write(); }
    return { job: jobView(job) };
  }
  if (message.type === 'clearJob') {
    if (isRunning(job)) throw new Error('请先取消或结束任务。');
    if (job && (await cleanupTabs(job, bootId)).length) throw new Error('请先关闭任务创建的临时标签页后再删除记录。');
    await chrome.storage.local.remove(JOB_KEY); job = null; return {};
  }
  owner(sender, message.id);
  switch (message.type) {
    case 'progress': {
      if (!PHASES.slice(0, 6).includes(message.phase)) throw new Error('无效任务阶段。');
      job.phase = message.phase; job.percent = Math.max(0, Math.min(99, Number(message.percent) || 0));
      job.text = String(message.text || '').slice(0, 1000);
      if (message.inventory) job.inventory = cleanInventory(message.inventory);
      if (message.warnings) job.warnings = message.warnings.map(w => String(w).slice(0, 1000)).slice(0, 200);
      await write(); return { cancelled: !!job.cancelRequested };
    }
    case 'openArticle': {
      if (job.cancelRequested) throw new Error('已取消导出。');
      if (!isArticleUrl(message.url) || job.tempTabIds.length) throw new Error('无效文章地址或已有临时标签页。');
      // Create a marked staging page first so even an interrupted create can be found.
      const tab = await chrome.tabs.create({ url: markedUrl(chrome.runtime.getURL('src/task.html?temporary=1'), job.id), active: false });
      job.tempTabIds.push(tab.id); await write();
      await chrome.tabs.update(tab.id, { url: markedUrl(message.url, job.id) });
      return { tabId: tab.id };
    }
    case 'activateArticle': {
      if (job.cancelRequested) throw new Error('已取消导出。');
      if (!job.tempTabIds.includes(message.tabId)) throw new Error('只能打开本任务创建的文章标签页。');
      await chrome.tabs.update(message.tabId, { active: true }); return {};
    }
    case 'navigateArticle': {
      if (!job.tempTabIds.includes(message.tabId) || !isSameArticleUrl(message.url, message.originalUrl)) throw new Error('不允许的分页导航。');
      await chrome.tabs.update(message.tabId, { url: markedUrl(message.url, job.id) }); return {};
    }
    case 'closeArticle': {
      if (job.tempTabIds.includes(message.tabId)) {
        const closing = await chrome.tabs.get(message.tabId).catch(() => null);
        // Return only if our temporary article still owns focus; never steal it back.
        if (closing?.active) await chrome.tabs.update(job.taskTabId, { active: true }).catch(() => {});
        await chrome.tabs.remove(message.tabId).catch(() => {});
        if (await chrome.tabs.get(message.tabId).catch(() => null)) throw new Error('临时标签页未能关闭。');
        job.tempTabIds = job.tempTabIds.filter(id => id !== message.tabId); await write();
      }
      return {};
    }
    case 'prepareDownload': {
      if (!String(message.url).startsWith(`blob:${chrome.runtime.getURL('')}`)) throw new Error('无效下载来源。');
      job.blobUrl = message.url; await write(); return {};
    }
    case 'recordDownload': {
      const [item] = await chrome.downloads.search({ id: message.downloadId });
      if (!item || item.url !== job.blobUrl || item.byExtensionId !== chrome.runtime.id) throw new Error('无法核对下载记录。');
      job.downloadId = item.id; await write(); return {};
    }
    case 'finishJob': {
      if (!['complete', 'cancelled', 'failed'].includes(message.phase)) throw new Error('无效终态。');
      if (message.phase === 'complete') {
        const [item] = job.downloadId !== undefined ? await chrome.downloads.search({ id: job.downloadId }) : [];
        if (item?.state !== 'complete') throw new Error('浏览器尚未确认保存完成。');
      }
      await finish(message.phase, message.text, message.warnings || []); return { job: jobView(job) };
    }
    default: throw new Error('未知任务请求。');
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!trusted(sender)) return;
  serial(() => handle(message, sender)).then(respond, error => respond({ error: error.message, status: error.status }));
  return true;
});
chrome.tabs.onRemoved.addListener(tabId => { serial(async () => {
  if (isRunning(job) && job.taskTabId === tabId) await recoverIfInterrupted(true);
}).catch(() => {}); });
chrome.tabs.onUpdated.addListener((tabId, change) => { serial(async () => {
  if (isRunning(job) && job.taskTabId === tabId && change.url && change.url !== taskUrl(job.id)) await recoverIfInterrupted(true);
}).catch(() => {}); });
chrome.downloads.onCreated.addListener(item => { serial(async () => {
  if (isRunning(job) && job.blobUrl === item.url && item.byExtensionId === chrome.runtime.id) {
    job.downloadId = item.id; await write();
  }
}).catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { serial(() => recoverIfInterrupted()).catch(() => {}); });
