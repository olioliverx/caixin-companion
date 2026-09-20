# Caixin Companion design adoption

Small utility: detect the current issue, review its articles, export an EPUB, and see the saved result.

Vanilla HTML/CSS/JavaScript with native buttons, links, disclosure and progress elements. No component library or remote fonts. Wonder UI is pinned at `a66f9b5c7601a5b898ffb4a2091ab41b4547fab5`; its scoped CSS is vendored unchanged. Local layout lives in `src/popup.css`. System light/dark preference supplies the theme; no preference is stored.

Proposed recipe: `caixin-companion`. A 390px popup and a 640px task column, 20px product name, 13px metadata, neutral primary action, 24px content padding. Narrow windows use full available width. OS fonts, browser save dialogs and extension permissions remain platform-owned.

Empty: explain which page to open. Ready: title, article count, optional inventory and one export action. Working: real progress and cancel action. Failed: explicit reason and inventory. Partial images: retain warnings. Waiting: explain the browser save dialog. Complete: show success only after browser confirmation and offer metadata deletion.

Keep extraction, access checks, article order, attribution, download recovery and cancellation. Billing removal is a separately requested functional change. No visual change adds requests or collection. Test with self-authored fixtures; compare light/dark, narrow layouts and keyboard focus. Before/after evidence stays in ignored output. Rollback: restore the prior HTML/CSS and remove the theme adapter, without changing extraction logic.
