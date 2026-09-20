// Self-authored synthetic content. No publisher article body or account data.
export const articleUrl = 'https://weekly.caixin.com/2026-09-18/100000001.html';
export const issueUrl = 'https://weekly.caixin.com/2026/cw9999/';
export const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=', 'base64'));
export const articleHtml = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>自有测试材料</title></head><body>
<article id="the_content"><h1>自有演示：这是用于核对中文标点、长标题换行和表格的合成文章</h1>
<p id="author_baidu">作者：Synthetic Fixture Author</p><p id="pubtime_baidu">2026-09-18</p>
<div id="Main_Content_Val"><p>这是独立编写的测试短文。“引号”、顿号、破折号——以及 &amp; 符号应正确显示。<sup><a id="ref-one" href="#note-one">[1]</a></sup></p>
<h2>表格与图注</h2><table><caption>合成阅读记录</caption><thead><tr><th scope="col">条目</th><th scope="col">说明</th></tr></thead><tbody><tr><td rowspan="2">演示</td><td>第一行</td></tr><tr><td>第二行</td></tr></tbody></table>
<figure><img src="https://img.caixin.com/synthetic.png" alt="自有单像素图片"><figcaption>图注：自有测试图；来源与署名应保留。</figcaption></figure>
<p><img src="https://img.caixin.com/missing.png" alt="故意缺失的测试图片"></p>
<p id="note-one">[1] 这是合成脚注。<a href="#ref-one">返回正文</a></p>
<p>版权说明：本段为自有测试材料。AI 内容标识仅作格式测试。</p></div></article></body></html>`;
export const issueHtml = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>自有合成测试期刊</title></head><body>
<div class="magazine-container"><h1 class="title">自有合成测试总第9999期</h1><p class="source">2026-09-18</p></div>
<div class="mainMagContent"><div class="reportTit"><span>测试栏目</span></div><dl><dt><a href="${articleUrl}">自有测试文章</a></dt><dd class="date">Synthetic Fixture Author</dd></dl></div></body></html>`;
