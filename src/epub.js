import { escapeHtml } from "./caixin.js";
import { zipStore } from "./zip.js";

const BOOK_CSS = `
body {
  color: #1f1f1f;
  font-family: "Noto Serif CJK SC", "Songti SC", serif;
  line-height: 1.75;
  text-align: justify;
}
h1, h2 {
  font-family: "Noto Sans CJK SC", "PingFang SC", sans-serif;
  line-height: 1.35;
}
h1 { font-size: 1.55em; margin: 0 0 .7em; }
h2 { font-size: 1.2em; margin-top: 1.4em; }
p { margin: .8em 0; text-indent: 1em; }
.article-body p { text-indent: 1em; }
.meta, .summary, .figcaption { color: #666; font-size: .88em; text-indent: 0; }
.figure { margin: 1em 0; page-break-inside: avoid; text-indent: 0; }
img { max-width: 100%; height: auto; }
.cover-image { display: block; margin: 0 auto; max-height: 100%; }
.toc li { margin: .35em 0; }
h1, td, th { overflow-wrap: break-word; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #999; padding: .3em; }
.u { text-decoration: underline; }
.s { text-decoration: line-through; }
`;

export async function buildEpub({ issue, articles, imageCache, warnings = [] }) {
  const files = [];
  const identifier = `caixin-weekly-${crypto.randomUUID()}`;
  const imageNames = mapImages(imageCache);
  files.push({ name: "mimetype", data: "application/epub+zip" });
  files.push({ name: "META-INF/container.xml", data: containerXml() });
  files.push({ name: "OEBPS/styles/book.css", data: BOOK_CSS });
  files.push({ name: "OEBPS/toc.xhtml", data: tocXhtml(issue, articles, warnings) });
  files.push({ name: "OEBPS/nav.ncx", data: navNcx(issue, articles, identifier) });
  files.push({ name: "OEBPS/content.opf", data: contentOpf(issue, articles, imageNames, identifier) });

  if (issue.coverUrl && imageNames.has(issue.coverUrl)) {
    files.push({
      name: "OEBPS/cover.xhtml",
      data: chapterShell("封面", `<div class="figure"><img class="cover-image" alt="原内容封面" src="${imageNames.get(issue.coverUrl)}" /></div>`, "styles/book.css")
    });
  }

  articles.forEach((article, index) => {
    files.push({
      name: `OEBPS/chapters/chapter-${index + 1}.xhtml`,
      data: articleXhtml(article, index, imageNames)
    });
  });

  for (const [url, asset] of imageCache.entries()) {
    const href = imageNames.get(url);
    if (href) files.push({ name: `OEBPS/${href}`, data: asset.bytes });
  }

  return zipStore(files, "application/epub+zip");
}

function mapImages(imageCache) {
  const map = new Map();
  let index = 1;
  for (const [url, asset] of imageCache.entries()) {
    map.set(url, `images/image-${index}.${asset.extension}`);
    index += 1;
  }
  return map;
}

function rewriteImages(html, imageNames, prefix = "") {
  const rewritten = html.replace(/<img\b([^>]*?)\bsrc\s*=\s*(["'])(.*?)\2([^>]*)>/gi, (match, before, quote, src, after) => {
    const href = imageNames.get(src.replace(/&amp;/g, "&"));
    if (!href) return '<span class="meta">[图片未保存，请查看原文]</span>';
    return `<img${before}src=${quote}${prefix}${href}${quote}${after}>`;
  });
  return rewritten;
}

function articleXhtml(article, index, imageNames) {
  const meta = [article.section, article.author, article.date].filter(Boolean).map(escapeHtml).join(" · ");
  const summary = article.summary ? `<p class="summary">${escapeHtml(article.summary)}</p>` : "";
  const body = rewriteImages(`${article.leadHtml || ""}${article.bodyHtml || ""}`, imageNames, "../");
  return chapterShell(article.title, `
    <h1>${escapeHtml(article.title)}</h1>
    <p class="meta">${meta}</p>
    ${summary}
    <div class="article-body">${body}</div>
    <p class="meta">原文：<a href="${escapeHtml(article.url)}">${escapeHtml(article.url)}</a></p>
  `, "../styles/book.css");
}

function chapterShell(title, body, cssHref = "styles/book.css") {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN" lang="zh-CN">
<head>
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" type="text/css" href="${cssHref}"/>
</head>
<body>${body}</body>
</html>`;
}

function tocXhtml(issue, articles, warnings) {
  return chapterShell("目录", `
    <h1>${escapeHtml(issue.title || "财新周刊")}</h1>
    <p class="meta">${escapeHtml([issue.number, issue.date].filter(Boolean).join(" · "))}</p>
    <p class="meta">本地格式转换文件，由 Caixin Companion 生成；非原出版方官方发行电子刊。作者署名与原内容来源保留在各篇文章中。</p>
    ${issue.url ? `<p class="meta">原内容来源：<a href="${escapeHtml(issue.url)}">${escapeHtml(issue.sourceName || '财新周刊原站页面')}</a></p>` : ''}
    ${warnings.length ? `<div class="meta"><h2>导出范围与质量提示</h2><ul>${[...new Set(warnings)].map(warning => `<li>${escapeHtml(warning)}</li>`).join('')}</ul></div>` : ''}
    <ol class="toc">
      ${articles.map((article, index) => `<li><a href="chapters/chapter-${index + 1}.xhtml">${escapeHtml(article.title)}</a></li>`).join("")}
    </ol>
  `);
}

function contentOpf(issue, articles, imageNames, identifier) {
  const coverHref = issue.coverUrl && imageNames.has(issue.coverUrl)
    ? imageNames.get(issue.coverUrl)
    : "";
  const imageItems = [...imageNames.entries()]
    .filter(([url]) => !coverHref || url !== issue.coverUrl)
    .map(([, href], index) =>
      `<item id="img${index + 1}" href="${href}" media-type="${href.endsWith(".png") ? "image/png" : "image/jpeg"}"/>`
    ).join("\n");
  const coverImgItem = coverHref
    ? `<item id="cover-img" href="${coverHref}" media-type="${coverHref.endsWith(".png") ? "image/png" : "image/jpeg"}"/>`
    : "";
  const coverPageItem = coverHref
    ? '<item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>'
    : "";
  const coverMeta = coverHref
    ? '<meta name="cover" content="cover-img"/>'
    : "";
  const coverSpine = coverPageItem ? '<itemref idref="cover-page"/>' : "";
  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${identifier}</dc:identifier>
    <dc:title>${escapeHtml(issue.title || "财新周刊")}</dc:title>
    <dc:language>zh-CN</dc:language>
    ${[...new Set(articles.map(article => article.author).filter(Boolean))].map(author => `<dc:creator>${escapeHtml(author)}</dc:creator>`).join('\n')}
    <dc:publisher>Local format conversion — Caixin Companion</dc:publisher>
    ${issue.url ? `<dc:source>${escapeHtml(issue.url)}</dc:source>` : ''}
    <dc:description>本地格式转换；非原出版方官方发行。内容来源和作者见原文链接与篇章署名。</dc:description>
    <dc:date>${escapeHtml(normalizeDate(issue.date))}</dc:date>
    ${coverMeta}
  </metadata>
  <manifest>
    <item id="ncx" href="nav.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="styles/book.css" media-type="text/css"/>
    <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml"/>
    ${coverImgItem}
    ${coverPageItem}
    ${articles.map((_, index) => `<item id="chapter${index + 1}" href="chapters/chapter-${index + 1}.xhtml" media-type="application/xhtml+xml"/>`).join("\n")}
    ${imageItems}
  </manifest>
  <spine toc="ncx">
    <itemref idref="toc"/>
    ${coverSpine}
    ${articles.map((_, index) => `<itemref idref="chapter${index + 1}"/>`).join("\n")}
  </spine>
</package>`;
}

function navNcx(issue, articles, identifier) {
  return `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="${identifier}"/></head>
  <docTitle><text>${escapeHtml(issue.title || "财新周刊")}</text></docTitle>
  <navMap>
    <navPoint id="toc" playOrder="1"><navLabel><text>目录</text></navLabel><content src="toc.xhtml"/></navPoint>
    ${articles.map((article, index) => `
    <navPoint id="chapter${index + 1}" playOrder="${index + 2}">
      <navLabel><text>${escapeHtml(article.title)}</text></navLabel>
      <content src="chapters/chapter-${index + 1}.xhtml"/>
    </navPoint>`).join("")}
  </navMap>
</ncx>`;
}

function normalizeDate(value) {
  const date = String(value || '').match(/(\d{4})[-年](\d{2})[-月](\d{2})/);
  return date ? `${date[1]}-${date[2]}-${date[3]}` : new Date().toISOString().slice(0, 10);
}

function containerXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}
