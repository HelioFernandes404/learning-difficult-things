# Learning Difficult Things

An AI tutor that never hands you the finished answer: it teaches one step at a time and checks your understanding. It runs on your computer; your data stays there.

## How to install (no programming)

1. **Download the project**: on this GitHub page, click the green **Code → Download ZIP** button and extract the folder. (If you use git: `git clone`.)
2. **Install Node.js** (LTS version, free): https://nodejs.org
3. **Double-click to start**:
   - **Windows**: `Start.bat`
   - **macOS**: `Start.command` (first time: right-click → Open)
   - **Linux**: `start.sh` (or run `./start.sh` in a terminal)

   The first run takes a few minutes (it installs and prepares everything). After that it starts in seconds. The browser opens by itself; to stop, close the black window.
4. **Set up your AI** on the screen that opens (Settings): pick the provider, paste your API key, click **Test connection** and **Save**.

Problems? If an error mentions `better-sqlite3`, install the build tools (Windows: Visual Studio Build Tools; macOS: `xcode-select --install`; Ubuntu: `sudo apt install build-essential python3`) or use Docker below.

## With Docker

```bash
docker compose up -d
```
Open http://localhost:3000. Data in `./data` and logs in `./logs`. To stop: `docker compose down`. The server only listens on `127.0.0.1` (this computer).

Launcher variables: `PORT` (default 3000; if busy, the next free one is used), `HOST` (default `127.0.0.1`; any other value requires `APP_PASSWORD`), `NO_OPEN=1` (do not open the browser).

---

## For developers

Agent harness for learning difficult things. `pnpm install && pnpm dev` (http://localhost:3000). Production: `pnpm build && pnpm start` (`HOST`, `PORT`; `NEXT_DIST_DIR` changes the build folder, default `.next`). `data/` and `logs/` are created automatically.

## Languages

The UI and the tutor are available in English and Português (Brasil). Switch language in the sidebar (also available on `/login` and `/settings`). The locale is stored in the `ldt_locale` cookie; the default comes from the browser's `Accept-Language`. Each session stores its own language, so the tutor keeps teaching in the language the session started in.

Dictionaries live in `src/i18n/{en.ts,pt-BR.ts}`. To add a language, create a new dictionary that satisfies the same type and register it in `src/i18n/index.ts`. `pnpm eval` accepts `--locale en|pt-BR|both`.

## Configuration through the UI

1. Open http://localhost:3000 (or the port shown by the launcher).
2. Click **Settings** (gear in the sidebar) or the "set up your AI" notice on the home screen.
3. Choose the **provider** (OpenAI, OpenRouter, local Ollama or Custom) and paste the **API key** (the "Where do I get a key?" link shows where). Ollama needs no key.
4. Choose the **model** ("Load models" button) and the **reasoning effort** (Low is recommended).
5. Click **Test connection**, then **Save**. It applies immediately, no restart needed.

The configuration lives in the `settings` table of `data/app.db`. **The key is stored in plain text in that file, on this computer only.** The `/api/settings*` routes only accept local access (or a logged-in user, if a password is set; see "Security") and never return the key (only its last 4 characters).

## Security

Model: local-use app, single user, listening only on `127.0.0.1`. The real risk is a malicious website open in your browser trying to talk to `localhost`. Protections (in `src/proxy.ts`, for all of `/api`):

- The `Host` header may only be `localhost`/`127.0.0.1`/`[::1]` (plus `ALLOWED_HOSTS`): blocks DNS rebinding.
- `Origin` / `Sec-Fetch-Site` from another site: 403 (blocks CSRF).
- Methods that change data require `Content-Type: application/json` (prevents "simple" requests without preflight).
- The saved key is never sent to an address taken from the request: testing another provider/address requires pasting the key.
- Restrictive CSP (no external images/scripts), `nosniff`, `Referrer-Policy: no-referrer`; markdown images from the AI are not loaded (avoids leaking the conversation).
- `pnpm dev` also listens only on `127.0.0.1`. Avoid a bare `docker run -p 3000:3000` (use the compose file, which publishes only on `127.0.0.1`).

## Hosting (optional)

For **one person's** use only: anyone with the password uses your API key and sees all conversations.

1. Set `APP_PASSWORD` (strong password) and `ALLOWED_HOSTS` (e.g. `my.domain.com`, comma-separated). `SESSION_SECRET` is optional (otherwise it is generated in `data/.session-secret`).
2. Put a reverse proxy with **HTTPS** in front (Caddy, nginx...) forwarding `Host` and `X-Forwarded-Proto`. The session cookie (`ldt_session`, 30 days, HttpOnly) becomes `Secure` under HTTPS. Login is limited to 5 attempts per minute per IP.
3. In the compose file: remove `ALLOW_INSECURE_BIND`, adjust the port and uncomment `APP_PASSWORD`/`ALLOWED_HOSTS`.

If `HOST` is not local, or `ALLOWED_HOSTS` is set without `APP_PASSWORD`, the server refuses to start.

## Advanced configuration (.env)

Optional, used only as a fallback when something is not set in the UI (the UI wins).

```bash
cp .env.example .env.local   # OPENAI_API_KEY, OPENAI_BASE_URL, LLM_MODEL, LLM_REASONING_EFFORT, GRAPH_MODEL
```
Without `OPENAI_BASE_URL` the OpenAI Responses API is used; with another address (OpenRouter, Ollama, custom) Chat Completions is used. The effective config is read on every request (`getLlmConfig()` in `src/lib/settings.ts`). `pnpm eval` uses the same config.

## Observability

Each request to `/api/chat` is a *turn* (`turnId` = `t_xxxxxxxx`). Events go to `logs/llm.jsonl` (one JSON per line; all with `ts`, `sessionId`, `turnId`; rotation: >20MB becomes `llm-<date>.jsonl`). The server also prints one `[llm] <event> ...` line per event.

| event | main fields |
|---|---|
| `turn_start` | model, effort, systemHash, systemLength, messageCount, `input` {kind: text/ask_check/offer_choices, text, answer, confidence, checkId, choice} |
| `step` | stepIndex (0-based), text, reasoningText, toolCalls [{name,input}], toolResults [{name,output}], finishReason, usage, stepLatencyMs, `guard` (prepareStep decision before the step: `{toolChoice}` or null) |
| `turn_end` | finishReason, totalUsage, steps, latencyMs, endedWith (ask_check/offer_choices/text/tools/empty), `flags` |
| `error` | error, stack, latencyMs |
| `db_write` | op (grade_check/save_concept/set_lesson_map), summary, previous values (before/previousContent/previousSteps), refused |
| `client_event` | name (card_shown, check_answered, choice_picked, visual_error, render_error), data; `turnId` = turn that produced the card (comes in `message.metadata.turnId`). Sent by the browser to `POST /api/telemetry` |

Old entries (`step`/`finish` without `turnId`) are grouped as `legacy-N` turns.

SQLite table `audit` (id, ts, sessionId, turnId, kind, payload JSON): mirrors `db_write` (kind = op, or `<op>_refused`) and each `turn_end` flag (kind = `flag`). It survives log rotation.

### Flags (src/lib/tutor/audit.ts, also used by `pnpm eval`)

`ended_text_only` (ended with text only, without asking to wrap up) · `no_text_in_teaching` (visual with no text at all) · `invisible_chars` · `garbage_token` (UPPERCASE>=4 outside code and the acronym list) · `regrade` (grade_check on an already graded check) · `stale_check_id` (not the last pending one) · `multiple_ask_check` · `slow` (>20s) · `heavy` (>30k tokens) · `confidence_mentioned_number` · `repeat_check` (question nearly identical to an earlier one).
`grade_check` refuses to regrade a check that already has a verdict, unless the tool receives `override:true`.

### CLI

```bash
pnpm trace                      # latest session (= last)
pnpm trace <sessionId|prefix> [--turns N] [--flags] [--full]
pnpm trace sessions             # sessions: turns, tokens, latency, flags
pnpm logs                       # raw tail -f
```
`--flags` shows only turns with flags/errors; `--turns N` the last N; `--full` does not truncate text.

### UI

`/debug`: sessions on the left; turn timeline on the right (input, steps with guard, text, expandable tool calls, ending, tokens/latency, flags), "only with flags" filter, totals at the top and an "Audit" tab (`audit` table).

- SQLite database: `data/app.db` (created automatically).

## Graph

Persistent knowledge record across sessions (inspired by the "Graph" of learnharness.ai). The `/graph` page ("Graph" link in the sidebar), a "Graph" tab in the session panel, and a "Continue where you left off" list on the home screen.

- Tables: `graph_nodes` (title, unique normTitle, kind concept/proposition/skill, summary, domain, mastery unseen/learning/mastered/misconception, masteryScore 0-1, lastConfidence, evidenceCount), `graph_edges` (fromId->toId, type prerequisite/part_of/related/contrasts/example_of; `from` is a prerequisite of `to`; no prerequisite cycles), `graph_evidence` (taught/check/note/misconception + verdict/confidence). `checks.nodeId`, `sessions.mode` ("practice") and `sessions.plan` (learning path) are additive.
- Extraction (`src/lib/graph/extract.ts`): after each `/api/chat` turn (fire-and-forget, serial queue), `generateObject` with `GRAPH_MODEL` (default `LLM_MODEL`, effort low) receives the turn excerpt + existing titles (max 80) and returns nodes/edges/evidence. Dedupe by normalized title (no accents/punctuation/parentheses) and Jaccard >= 0.75. Skips turns without a graded check, visual or substantive text. Check verdict/confidence come from the database, not the LLM.
- Mastery (`mastery.ts`, deterministic, replays the evidence): correct conf>=4 +0.35; correct low conf +0.2; partial +0.05; wrong -0.2; wrong conf>=4 => misconception (cleared by the next correct); only taught => learning; mastered with score>=0.75 and >=2 correct.
- Context: `context.ts` injects "What the student already knows" (max 25 relevant nodes, misconceptions first); the prompt uses it for probing and for the lesson map.
- `/graph`: React Flow + dagre; goal field (matches an existing node or `/api/graph/plan` creates a chain of unseen nodes), highlights the known -> goal path; Teach/Practice buttons; filters; node drawer (evidence, notes, edit summary, merge, delete); per-session "Re-extract".
- API: `GET /api/graph` (`?sessionId=`, `?continue=1`), `/api/graph/nodes/[id]` (GET/PATCH/DELETE), `POST /api/graph/{merge,plan,extract}`.
- Logs: `graph_extract` event (turnId, nodes/edges/evidence, latency, tokens, error) + a line in `audit`; `pnpm trace` prints `graph_extract` per turn.

## Architecture

- `src/lib/tutor/prompt.ts` — tutor prompt (editable) + session context
- `src/lib/tutor/tools.ts` — `ask_check` (client-side), `grade_check`, `save_concept`, `set_lesson_map`
- `src/lib/tutor/context.ts` — map/concepts/checks injected into the prompt
- `src/lib/{db,schema,llm,settings,log}.ts` — SQLite+drizzle, provider, configuration (DB over env), JSONL logs
- `src/i18n/*` — dictionaries and locale helpers
- `src/app/api/*` — chat (stream), sessions, concepts, checks, debug/logs
- `src/components/*` — chat, check card, side panel (Map/Notebook/Checks), markdown+mermaid
- `ask_check` flow: the model calls the tool -> the browser shows a card -> POST `/api/checks` (saves) -> `addToolResult` with `{answer, confidence, checkId}` -> automatic new request -> the model calls `grade_check`.

## License

MIT. Inspired by the concept of [LearnHarness](https://learnharness.ai/).
