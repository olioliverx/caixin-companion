# Caixin Companion · 财新周刊助手

<img src="assets/icons/icon-128.png" width="80" alt="Caixin Companion icon">

A free, open-source Chrome / Edge extension for personal offline reading of permitted Caixin Weekly content as EPUB. No payment, extension account, analytics, or developer server.

免费的开源工具，为财新订阅用户改善个人离线阅读体验。仅处理你已经能阅读、且获准转换的内容；不解锁付费墙。

## Install / 安装

1. Download **[caixin-companion.zip](https://github.com/olioliverx/caixin-companion/releases/latest/download/caixin-companion.zip)** and unzip it to a folder you will keep.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Turn on **Developer mode / 开发者模式** → **Load unpacked / 加载已解压的扩展程序**, then choose the folder containing `manifest.json`.
4. Log in to Caixin on its own website. Open a Weekly issue or article, click the extension, review the article list, then choose **导出 EPUB**.

Keep the export task tab open until saving finishes. Missing images are reported. Unsupported or unreadable articles stop the export. To update, replace the files in the same folder and click **Reload / 重新加载** on the extensions page. To uninstall, choose **Remove / 移除**; saved EPUBs must be deleted separately. Chromium 120+ required. Firefox and Safari are not supported.

## Content and privacy

Independent personal project; not affiliated with, endorsed by, or authorized by Caixin. Caixin and other rights holders retain their content and trademarks. **Do not share, upload, redistribute, or sell exported content.** A subscription alone does not establish permission to copy or convert it: [Caixin's terms](https://corp.caixin.com/item/) restrict copying and compilation without prior written authorization. Use only where permitted by applicable terms and law. No publisher content is included in this repository or release.

The developer receives no data from the extension. Processing is local, but Caixin pages and images are fetched over the network. Temporary task metadata stays in your browser. See [Privacy](docs/PRIVACY.md) and [Support](docs/SUPPORT.md).

Software is provided as is, without warranty, with liability limited to the extent permitted by law. The [MIT license](LICENSE) covers this software, **not Caixin content**.

## Development

Node.js 24+. No runtime dependencies or build step needed to load the source folder.

```sh
npm ci
npm test
npm run package
npx playwright install chromium
npm run test:browser
EPUBCHECK_JAR=/path/to/epubcheck.jar npm run test:epub
```

The ZIP is written to `dist/caixin-companion.zip`. Tests use self-authored synthetic content. [Verification and limitations](docs/VERIFICATION.md).
