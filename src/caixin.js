// Only links observed in the rendered article navigation are candidates.
export function findFullArticleUrl(links, url) {
  if (!isArticleUrl(url) || !Array.isArray(links)) return "";
  for (const link of links) {
    if (!/^(?:余下|剩余)?全文(?:阅读)?$/.test((link.text || "").replace(/\s+/g, ""))) continue;
    const candidate = absolutize(link.href, url);
    if (isSameArticleUrl(candidate, url) && new URL(candidate).search === "?p0" &&
        new URL(url).search !== "?p0") return candidate;
  }
  return "";
}

export function isSameArticleUrl(candidate, original) {
  return isArticleUrl(candidate) && isArticleUrl(original) && new URL(candidate).pathname.replace(/^\/m\//, "/") === new URL(original).pathname.replace(/^\/m\//, "/");
}

export function canonicalArticleUrl(value) {
  return isArticleUrl(value) ? new URL(value).origin + new URL(value).pathname.replace(/^\/m\//, "/") : "";
}

// Self-contained because chrome.scripting serializes this function into an isolated world.
export function inspectRenderedPage() {
  const body = document.querySelector("#Main_Content_Val, .text[id*='Content'], .article .content .text");
  let textLength = 0, nodes = 0;
  if (body) {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_ALL);
    while (walker.nextNode()) {
      if (walker.currentNode.nodeType === Node.TEXT_NODE) textLength += walker.currentNode.nodeValue.length;
      if (++nodes > 20000 || textLength > 2 * 1024 * 1024) return { url: location.href, tooLarge: true };
    }
  }
  const root = body?.closest("#the_content, article, .article") || body?.parentElement;
  const links = [];
  for (const anchor of root?.querySelectorAll("#pageNext a[href], .page a[href], .pagination a[href]") || []) {
    if (anchor.closest("footer, .related, .recommend")) continue;
    let visible = true;
    for (let node = anchor; node; node = node.parentElement) {
      const style = document.defaultView.getComputedStyle(node);
      if (node.hidden || style.display === "none" || style.visibility === "hidden" || style.opacity === "0") { visible = false; break; }
    }
    if (visible) links.push({ href: (anchor.getAttribute("href") || '').slice(0, 2048), text: (anchor.textContent || "").trim().slice(0, 200) });
    if (links.length > 150) return { url: location.href, tooLarge: true };
  }
  return { url: location.href, readyState: document.readyState, textLength, links };
}

export function sanitizeFileName(value) {
  return (value || "Caixin Weekly")
    .replace(/[\u0000-\u001f\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function absolutize(href, baseUrl) {
  try { return new URL(href, baseUrl).href; } catch { return ""; }
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function isArticleUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "weekly.caixin.com" && !url.port &&
      !url.username && !url.password && /^\/(?:m\/)?\d{4}-\d{2}-\d{2}\/\d+\.html$/.test(url.pathname);
  } catch { return false; }
}

export function isImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.port && !url.username && !url.password &&
      (["img.caixin.com", "file.caixin.com", "weekly.caixin.com"].includes(url.hostname) ||
       (url.hostname === "datanews.caixin.com" && url.pathname.startsWith("/mobile/article/")));
  } catch { return false; }
}


// Normal scrolling lets the publisher's own lazy loader observe its image.
// No source URL, CSS, access wall or image visibility is modified.
export function scrollPendingArticleImage() {
  const body = document.querySelector("#Main_Content_Val, .text[id*='Content'], .article .content .text");
  if (!body) return;
  const image = [...body.querySelectorAll('img.cx-img-loader'), ...document.querySelectorAll('.article_media_pic img.cx-img-loader')]
    .find(node => {
      if (getComputedStyle(node).opacity !== '0') return false;
      for (let element = node; element; element = element.parentElement) {
        const style = getComputedStyle(element);
        if (element.hidden || style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility) ||
            style.contentVisibility === 'hidden' || (element !== node && style.opacity === '0')) return false;
      }
      return true;
    });
  image?.scrollIntoView({ block: 'center', behavior: 'instant' });
}
