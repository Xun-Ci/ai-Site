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

## Migration status

- Public website source has been separated from the private backend and historical workspace data.
- The existing Google Apps Script deployment URL is kept unchanged in `assets/config.js`.
- **Owner action still required:** update the Apps Script project's `Code.gs` with code from the private repository, update Script Properties to `GITHUB_REPO=Xun-Ci/ai-Site-Private`, `DATA_BRANCH=main`, and use a new restricted GitHub PAT with Contents Read/Write permissions on that private repo. Deploy a new Apps Script version, keeping the existing /exec URL.
- Until the owner performs that step, the current deployed Google backend may still write to the former **public** data branch. Do not assume private storage is active before testing it.

## Concurrency and consistency

- The Apps Script backend serializes all writes with one ScriptLock because all writes update the same GitHub branch. Reads remain parallel.
- `append` reads the latest file while holding the write lock, so concurrent appends are not lost. File-write request IDs are recorded in Git commit messages for durable replay protection; reusing an ID with different parameters is rejected.
- `write` to an existing file requires `expected_sha` from the latest `read`. A stale SHA returns `write_conflict` instead of silently overwriting another writer.
- `busy` and transient GitHub branch conflicts are marked retryable. The browser retries with the same request ID; a timed-out caller must also reuse that ID.

## Security

This is a public experimental URL interface. Browser JS and URL parameters are visible to users and crawlers. GET writes can be triggered by previews/prefetches; use non-sensitive disposable data and unique request IDs. Source files deleted from the latest public branch may remain in Git history and public caches. Revoke previously exposed PATs.

The AI runtime needs an interactive JS-capable browser to execute these Pages tools; plain page fetching might not execute scripts.
