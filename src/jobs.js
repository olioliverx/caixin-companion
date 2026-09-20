export const JOB_KEY = 'exportJob';
export const JOB_TTL_MS = 24 * 60 * 60 * 1000;
export const JOB_TIMEOUT_MS = 30 * 60 * 1000;
export const PHASES = ['discovery', 'access', 'reading', 'validation', 'packaging', 'saving', 'complete', 'cancelled', 'failed'];
export const isRunning = job => !!job && !['complete', 'cancelled', 'failed'].includes(job.phase);
export const taskUrl = id => chrome.runtime.getURL(`src/task.html?job=${id}`);
export const marker = id => `cw-export-${id}`;
export function markedUrl(url, id) {
  const target = new URL(url);
  target.hash = `${target.hash.replace(/^#/, '')}${target.hash ? '&' : ''}${marker(id)}`;
  return target.href;
}
export function hasMarker(url, id) {
  try { return new URL(url).hash.slice(1).split('&').includes(marker(id)); } catch { return false; }
}
export function jobView(job) {
  if (!job) return null;
  const { id, phase, percent, text, warnings, inventory, cancelRequested, taskTabId, updatedAt } = job;
  return { id, phase, percent, text, warnings, inventory, cancelRequested, taskTabId, updatedAt };
}
export function cleanInventory(items) {
  if (!Array.isArray(items) || items.length > 150) throw new Error('文章清单超出上限。');
  return items.map(item => ({
    url: String(item.url || '').slice(0, 2048), title: String(item.title || '').slice(0, 500),
    section: String(item.section || '').slice(0, 200), status: ['discovered', 'supported', 'unsupported', 'reading', 'read', 'failed'].includes(item.status) ? item.status : 'discovered',
    reason: String(item.reason || '').slice(0, 500)
  }));
}

// IDs are trusted only within the same browser session. Restored tabs must carry
// this job's random fragment marker; never close a tab by a stale ID alone.
export async function cleanupTabs(job, bootId) {
  const candidates = new Map();
  if (job.bootId === bootId) for (const id of job.tempTabIds || []) candidates.set(id, true);
  for (const tab of await chrome.tabs.query({})) {
    if (hasMarker(tab.url, job.id)) candidates.set(tab.id, true);
  }
  for (const context of await chrome.runtime.getContexts({ contextTypes: ['TAB'] })) {
    if (hasMarker(context.documentUrl, job.id)) candidates.set(context.tabId, true);
  }
  const failures = [];
  for (const id of candidates.keys()) {
    try { await chrome.tabs.remove(id); }
    catch { if (await chrome.tabs.get(id).catch(() => null)) failures.push(id); }
  }
  return failures;
}
