export function detectCaixinPage() {
  const url = location.href;
  const isWeekly = location.hostname === "weekly.caixin.com" && location.protocol === "https:" && !location.port && !location.username && !location.password;
  if (!isWeekly) return { ok: false, message: "当前页面不是财新页面。" };

  const absolutize = (href) => {
    try { return new URL(href, location.href).href; } catch { return ""; }
  };
  const text = (node) => (node?.textContent || "").replace(/\s+/g, " ").trim();
  const titleText = (node) => text(node).replace(/^\{+/, "").replace(/\}+$/, "").trim();
  const sectionText = (node) => {
    const cn = text(node?.querySelector?.("span"));
    const all = text(node);
    const en = cn ? all.replace(cn, "").trim() : "";
    return [cn, en].filter(Boolean).join(" · ") || all;
  };

  const detectCover = (doc) => {
    const img = doc.querySelector(".cover img");
    if (!img) return "";
    const raw = img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-original") || "";
    return absolutize(raw);
  };

  const detectIssueUrl = (doc) => {
    const link = doc.querySelector("#artInfo a")?.getAttribute("href");
    return link ? absolutize(link) : "";
  };

  const issueRoot = document.querySelector(".mainMagContent");
  if (issueRoot && /^\/\d{4}\/cw\d+\/?$/.test(location.pathname)) {
    const issue = {
      url,
      title: text(document.querySelector(".magazine-container .title")) || document.title,
      date: (text(document.querySelector(".magazine-container .source")).match(/\d{4}-\d{2}-\d{2}/) || [])[0] || "",
      number: (text(document.querySelector(".magazine-container .title")).match(/第?\d+期|总第\d+期/) || [])[0] || "",
      coverUrl: detectCover(document)
    };
    const articles = [], inventory = [], seen = new Set();
    let section = "";
    // Traverse links in DOM order, including entries the extractor cannot handle.
    for (const node of issueRoot.querySelectorAll(".reportTit, .magIntrotit, a[href]")) {
      if (node.matches(".reportTit, .magIntrotit")) { section = sectionText(node); continue; }
      if (node.closest(".reportTit, .magIntrotit, .cover, nav, footer, .pagination, .page")) continue;
      const href = absolutize(node.getAttribute("href"));
      let canonical = href, supported = false;
      try {
        const candidate = new URL(href);
        supported = candidate.protocol === "https:" && candidate.hostname === "weekly.caixin.com" && !candidate.port && !candidate.username && !candidate.password && /^\/(?:m\/)?\d{4}-\d{2}-\d{2}\/\d+\.html$/.test(candidate.pathname);
        if (supported) canonical = candidate.origin + candidate.pathname.replace(/^\/m\//, "/");
      } catch {}
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      const row = node.closest("dl, .report p, li") || node.parentElement;
      const authorLine = text(row?.querySelector("dd.date"));
      const article = { title: titleText(node) || node.querySelector('img')?.alt || href, url: canonical, section, authorLine };
      inventory.push({ ...article, status: supported ? "supported" : "unsupported", reason: supported ? "" : "不是当前支持的同站文章地址；未纳入导出。" });
      if (supported) articles.push(article);
      if (inventory.length > 150) return { ok: false, message: "目录条目超过 150 项，已停止，请核对页面结构。" };
    }
    if (!inventory.length) return { ok: false, message: "目录结构未识别到文章条目，不能确认整期清单。" };
    return { ok: true, kind: "issue", issue, articles, inventory, completeness: "unverified" };
  }

  if (/^\/(?:m\/)?\d{4}-\d{2}-\d{2}\/\d+\.html$/.test(location.pathname)) {
    const article = {
      url,
      title: titleText(document.querySelector("#conTit h1, h1")) || document.title.replace(/_财新.*$/, ""),
      section: text(document.querySelector(".crumb span:nth-of-type(2) a, .crumb a:last-of-type")),
      authorLine: text(document.querySelector("#author_baidu")) || "",
      date: text(document.querySelector("#pubtime_baidu")) || "",
      summary: document.querySelector('meta[property="og:description"], meta[name="description"]')?.content || ""
    };
    const issue = {
      url: detectIssueUrl(document) || url,
      title: text(document.querySelector("#artInfo a")) || "财新周刊",
      date: (text(document.querySelector("#artInfo")).match(/\d{4}年\d{2}月\d{2}日|\d{4}-\d{2}-\d{2}/) || [])[0] || "",
      number: (text(document.querySelector("#artInfo")).match(/第\d+期/) || [])[0] || "",
      coverUrl: detectCover(document)
    };
    return { ok: true, kind: "article", issue, article, articles: [article], inventory: [{ ...article, status: "supported", reason: "" }], completeness: "single-article" };
  }

  return { ok: false, message: "请在财新周刊期刊页或文章页打开扩展。" };
}
