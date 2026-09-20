# Privacy / 隐私

Effective: 2026-09-20 · Caixin Companion 1.0

The developer does not receive or collect data through this extension. There is no developer server, analytics, advertising, telemetry, account system, payment service, or cloud sync.

- Article text and images are processed in extension memory and saved as an EPUB to the location you choose. They are not uploaded to the developer.
- The extension opens Caixin article pages using your existing browser session. Those pages can use Caixin's own scripts, cookies and third-party services. Images are requested from the declared Caixin image hosts without credentials. Caixin and its service providers may receive ordinary network information; their own policies apply. This tool is not a network privacy blocker.
- Local extension storage holds one task record: article titles and URLs, progress, warnings, timestamps, temporary tab identifiers, and a browser download identifier. A random browser-session identifier is stored in session storage. Article bodies, passwords and login cookies are not stored by the extension.
- Delete the task record on the completed, failed or cancelled task page. Finished records older than 24 hours are removed on the next extension activity, after any temporary tabs are cleaned up. This is not an exact 24-hour timer. Removing the extension deletes its storage; browser history, download history and saved files are managed separately by you.
- Help pages bundled with the extension work offline. Opening GitHub links or submitting an issue shares your request and anything you choose to post with GitHub. Issues are public. Do not post personal details or publisher content.

Permissions: `activeTab` and `scripting` inspect supported pages after you start; Caixin host access loads articles and images; `downloads` saves the EPUB and checks completion; `storage` keeps the temporary task record. No cookie-reading permission or access to all websites is requested.

开发者不会通过此扩展收集或接收你的数据。正文与图片在本地处理；导出时仍会访问财新网页和图片，适用原站的隐私政策。浏览器内暂存文章标题、链接及任务状态，可在任务结束后删除；超过 24 小时的已结束记录会在下次使用扩展时清理。扩展没有账户、支付、分析统计或云同步。你主动提交的 GitHub Issue 是公开的，请勿上传个人信息或财新内容。
