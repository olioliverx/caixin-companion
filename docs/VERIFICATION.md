# Verification — 1.0.0

2026-09-20, macOS, Node 26.8.1 (CI uses Node 24).

- Unit/package/coordinator suite: 30 passed. Access checks, synthetic extraction, EPUB structure and attribution, URL boundaries, bounded resources, recovery and private-file exclusion.
- Real Chromium extension integration: passed. Synthetic offline fixtures, actual extension APIs, download completion, service-worker restart, cancellation, task closure, redirects, denied save, network failure and unsupported inventory. No publisher content or logged-in profile used.
- EPUBCheck 5.4.0: zero errors and warnings on the self-authored synthetic EPUB.
- Dependency audit: zero known vulnerabilities reported.
- UI: light/dark at 320, 390, 768 and 1440px, no horizontal overflow; keyboard disclosure and visible focus passed. Synthetic screenshots visually reviewed at popup widths. This is not a screen-reader audit.
- Icon: generated from the user-selected WonderTag reference, exported as RGB PNG at 16/32/48/64/128/1024px. New artwork, no Caixin logo. Reference selection is confirmed; the generated artwork has not received a separate user taste review.

Limitations: desktop EPUB-reader visual acceptance could not be completed because native file-picker automation did not reliably open the fixture. Apple Books, e-ink readers and a separate Microsoft Edge integration run remain unverified. The owner reported successful real-site export before this release; this session did not repeat a live subscriber-content comparison. Browser stores have not been submitted.

Release scope: open-source software and a manual-install ZIP, with no publisher articles, images or EPUBs. This does not certify publisher authorization. Caixin's terms restrict copying and compilation; the MIT license grants no rights to publisher content. Prior paid-product gates have been retired along with all account, server and payment code, not marked as approved.
