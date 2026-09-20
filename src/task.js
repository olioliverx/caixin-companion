import { runExport } from './export.js';
import { JOB_KEY, JOB_TIMEOUT_MS, isRunning } from './jobs.js';

const id = new URL(location.href).searchParams.get('job');
const controller = new AbortController();
const send = async message => {
  const result = await chrome.runtime.sendMessage({ ...message, id });
  if (!result || result.error) throw new Error(result?.error || '任务协调器未响应，请重新打开扩展。');
  return result;
};
function render(job) {
  if (!job || job.id !== id) return;
  document.getElementById('progress').value = job.percent;
  document.getElementById('progressText').textContent = job.phase === 'failed' ? '导出未完成' : job.text;
  document.getElementById('taskHint').hidden = !isRunning(job);
  document.getElementById('cancelExport').hidden = !isRunning(job);
  document.getElementById('clearJob').hidden = isRunning(job);
  const errors = document.getElementById('errors');
  errors.textContent = job.phase === 'failed' ? job.text : ''; errors.hidden = !errors.textContent;
  const notes = [...new Set(job.warnings || [])];
  document.getElementById('exportNotes').hidden = isRunning(job) || !notes.length;
  document.getElementById('exportNotesList').replaceChildren(...notes.map(note => {
    const li = document.createElement('li'); li.textContent = note; return li;
  }));
  if (job.phase === 'failed') document.getElementById('inventoryDetails').open = true;
  document.getElementById('inventory').replaceChildren(...(job.inventory || []).map(item => {
    const li = document.createElement('li');
    const link = document.createElement('a'); link.textContent = item.title || item.url;
    if (/^https?:\/\//.test(item.url)) { link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    const labels = { discovered: '已发现', supported: '支持', unsupported: '未支持', reading: '读取中', read: '已读取', failed: '失败' };
    li.append(link, ` — ${labels[item.status] || item.status}${item.reason ? `：${item.reason}` : ''}`); return li;
  }));
  if (job.cancelRequested || !isRunning(job)) controller.abort(new DOMException('已取消或结束导出。', 'AbortError'));
}
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes[JOB_KEY]) render(changes[JOB_KEY].newValue); });
document.getElementById('cancelExport').addEventListener('click', () => { controller.abort(new DOMException('已取消导出。', 'AbortError')); send({ type: 'cancelExport' }).catch(showError); });
document.getElementById('clearJob').addEventListener('click', () => send({ type: 'clearJob' }).then(() => { document.getElementById('inventory').replaceChildren(); document.getElementById('progressText').textContent = '记录已删除。'; document.getElementById('errors').hidden = true; document.getElementById('exportNotes').hidden = true; document.getElementById('clearJob').hidden = true; }).catch(showError));
function showError(error) { document.getElementById('errors').textContent = error.message; document.getElementById('errors').hidden = false; }
async function start() {
  if (!id) return; // Marked temporary staging tab; it never launches an export.
  const state = await send({ type: 'getState' });
  render(state.job);
  if (!isRunning(state.job) || state.job.id !== id) return;
  const { sourceTabId } = await send({ type: 'claimJob' });
  const timeout = setTimeout(() => controller.abort(new Error('导出超过 30 分钟，请重新开始。')), JOB_TIMEOUT_MS);
  try {
    const warnings = await runExport({ sourceTabId, send, signal: controller.signal });
    await send({ type: 'finishJob', phase: 'complete', text: 'EPUB 已保存。', warnings });
  } catch (error) {
    const phase = error.name === 'AbortError' ? 'cancelled' : 'failed';
    await send({ type: 'finishJob', phase, text: error.message || '导出未完成。' }).catch(showError);
  } finally { clearTimeout(timeout); }
}
start().catch(showError);
