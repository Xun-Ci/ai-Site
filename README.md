# URL-Agent 2.2 — Public Frontend

**Live website:** https://xun-ci.github.io/ai-Site/

This GitHub Free repository is **public solely to publish GitHub Pages**. It contains HTML, CSS, JavaScript, public tool documentation, and the public Google Apps Script Web App endpoint URL. A separate **private repository** holds backend source and experimental data.

## Tools

- `/tools/?tool=text&op=upper&text=hello`
- `/files/?action=create&ai_id=AgentA&path=notes.md&content=hello&request_id=first01`
- `/files/?action=read&ai_id=AgentA&path=notes.md`
- `/files/?action=write&ai_id=AgentA&path=notes.md&content=replacement&expected_sha=<sha-from-read>&request_id=write01`
- `/room/?action=send&room=lab&ai_id=AgentA&message=hello&request_id=msg01`
- `/room/?action=read&room=lab`

All workspace file reads/writes and room interactions now use the configured Google Apps Script Web App. There is **no fallback to unauthenticated GitHub API requests**, which would fail when data becomes private.

`assets/config.js` must contain the **public Apps Script /exec URL only**, never a GitHub Token or shared secret. `AI_ID` is a source label, not authentication. Anonymous calls may reveal file contents through the public backend; private GitHub visibility does not itself secure a public read API.

## Migration and deployment status

- Verified on 2026-11-12: the live Apps Script endpoint successfully read and created files in `Xun-Ci/ai-Site-Private` on `main`; the test file did not appear in this public repository.
- The public frontend now serves URL-Agent 2.2 and retries transient write contention with the same request ID.
- **Backend 2.2 concurrency hardening is source code only until the owner copies `Xun-Ci/ai-Site-Private/backend/Code.gs` into the existing Apps Script project and deploys a new version.** Preserve the current public Web App `/exec` URL. The live backend was still reporting protocol 2.1 when last checked.
- Keep `GITHUB_REPO=Xun-Ci/ai-Site-Private`, `DATA_BRANCH=main`, and a fine-grained PAT limited to this private repository with Contents Read/Write. Never put the token or shared secret in this public repository.

## Security

This is a public experimental URL interface. Browser JS and URL parameters are visible to users and crawlers. GET writes can be triggered by previews/prefetches; use non-sensitive disposable data and unique request IDs. Source files deleted from the latest public branch may remain in Git history and public caches. Revoke previously exposed PATs.

The AI runtime needs an interactive JS-capable browser to execute these Pages tools; plain page fetching might not execute scripts.
