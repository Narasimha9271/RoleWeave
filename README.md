# RoleWeave

**GitHub-aware resume tailoring for software roles.**

RoleWeave connects your experience, your public GitHub projects, and a job description to produce a relevant resume you can review and edit. Projects are matched to the role, then explicitly approved before they are included in a rewrite.

Built with **React, Vite, Node.js, Express, Groq, Supabase, and Python**.

## How it works
1. Upload a PDF, DOCX, or TXT resume.
2. Add the company, role, and job description.
3. Connect a public GitHub username, review matching projects, and approve what to include.
4. Generate a draft in a built-in template or preserve supported blocks in the original PDF.
5. Review changes and skill gaps, export, and save the application with its JD and approved project evidence.

## Run locally
Requires Node.js 22.17+.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```
Open http://localhost:5173. No credentials are required for local preview. The backend listens on loopback port 3001. Local preview stores resume text and application history in this browser, without account isolation; do not expose this mode publicly.

## What works
- Responsive dashboard, resume studio, master resume, public GitHub imports, application journal, and settings.
- PDF / DOCX / TXT extraction, editable master text, project selection (up to 10), job description upload or paste.
- Google and GitHub account creation/sign-in through Supabase once configured.
- Applications save company, role, original text, job description, editable tailored draft, template, evidence/gap feedback, and status.
- Search, status filters, status updates, delete, reopen, and edit applications.
- Modern, Classic, and Compact typography; browser Print / Save as PDF and plain text exports.
- Without an AI key: labeled extractive mode preserves original text, appends relevant selected project descriptions, and flags missing tracked technology keywords.
- Groq structured AI rewriting with evidence explanations and separate project suggestions. OpenAI is an explicitly selected alternative. Drafts always need human review.
- Original PDF template mode: rewrite supported text blocks while preserving page geometry, fonts, colors, and graphics, with fit checks and editable review. Download the modified PDF directly.

## Enable real accounts and cloud history
1. Create a Supabase project and run `supabase/schema.sql`, followed by `supabase/original-pdf.sql`, in its SQL editor.
2. Fill both client (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) and server (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) variables in `.env`. Use the public anon key. Never put a service-role key in a VITE variable.
3. Enable Google and GitHub under Supabase Authentication > Providers. Create provider OAuth apps and register the Supabase callback URL shown in that dashboard, normally `https://PROJECT.supabase.co/auth/v1/callback`.
4. Set Supabase Site URL to your app origin and allow its redirect URL (local development: `http://localhost:5173`; production: your HTTPS origin).
5. Restart the app. OAuth creates accounts automatically; there is no separate password signup. GitHub login is separate from public repository import and does not request private repo scope.
6. Verify two separate accounts cannot access each other's rows. Both tables have row-level security for `auth.uid() = user_id`; the client never uses service-role access.

Official setup: https://supabase.com/docs/guides/auth/social-sign-in/auth-google and https://supabase.com/docs/guides/auth/social-sign-in/auth-github

## Enable AI
Set `AI_PROVIDER=groq`, `GROQ_API_KEY`, and `GROQ_MODEL=openai/gpt-oss-120b` in the server `.env`, then restart. Groq account quotas still apply; there is no automatic paid-provider fallback. To use OpenAI explicitly, set `AI_PROVIDER=openai` and its key/model. Keys never enter the client build. Resume text, job description, and selected repository metadata are sent to the selected provider when Generate is clicked. Review that provider's retention terms. The SDK is OpenAI-compatible but Groq requests go to `https://api.groq.com/openai/v1`.

## Build and run
```powershell
npm test
npm run build
$env:NODE_ENV='production'
npm start
```
Production refuses to start without server Supabase configuration. Configure matching client settings before building. Set HOST=0.0.0.0 only behind an HTTPS reverse proxy. This is a working MVP, not a completed public SaaS launch: verify OAuth callbacks, RLS isolation and live model output with real credentials, add shared per-user quotas / abuse controls, operational logging, legal/privacy copy, and backup/retention policy before launch. In-memory IP rate limiting is included for a single-process prototype.

## Current boundaries
- Text-based PDFs can use **Keep my uploaded resume template**. Only safely editable text blocks change. Scans, signatures, pending redactions, rotated or overlapping text, linked text, mixed styles and unavailable fonts are protected or unsupported. Export rejects edits that cannot fit at the original font size. It does not add new sections or pages. Use a built-in template for substantial restructuring or new GitHub project sections. DOCX uploads currently use built-in templates.
- GitHub import inspects public repository metadata, excluding forks and archived repositories, up to 100 recently updated repos. It does not audit source code or prove ownership/proficiency. Users explicitly select projects they can explain.
- Gap detection uses a bounded software technology dictionary; it is not full semantic requirement coverage and is not an ATS score.
- AI instructions reduce fabrication but cannot guarantee it; use Original and Changes tabs and edit the final draft.
- Scanned image-only PDFs need OCR outside this version. Upload limit is 5 MB; extracted text is capped at 40,000 characters.
- Save the master profile explicitly for cloud persistence. Application drafts are saved only when Save application is clicked. Original-template PDFs download directly. Built-in templates use the browser print dialog; disable its headers and footers for the cleanest output.

## Project structure
`src/` UI and styles; `server/` protected parsing, GitHub and tailoring routes; `supabase/` schema and RLS; `tests/` meaningful evidence/matching regression tests. `npm run dev` runs both servers. `npm start` serves the production build and API together.

## Architecture
- **React + Vite:** responsive workspace, project approval, editable drafts and PDF previews.
- **Express:** authenticated parsing, repository matching, AI requests and PDF export.
- **Supabase:** social login, owner-scoped application history and private PDF storage.
- **Groq:** structured resume rewrites and suggestions, using a server-only API key.
- **Python + PyMuPDF:** constrained edits that reuse the original PDF fonts and positions.

## Repository and hosting
This repository contains the application source. GitHub Pages alone cannot run its Express API or Python PDF engine. A hosted deployment needs a Node.js/Python runtime, environment variables, Supabase setup and matching OAuth redirect URLs.

Local credentials, generated PDFs, uploads and dependency folders are excluded from Git. Start from `.env.example` when setting up your own workspace.

## Original PDF engine
Requires Python 3.10+ and the packages in `requirements.txt`. Install into the project folder:

```powershell
python -m pip install --target .python-packages -r requirements.txt
```

Set `PYTHON_BIN` to the Python executable if it is not on PATH. The engine runs in an isolated subprocess with a 30-second timeout. Uploads are limited to 5 MB and original-template mode to 10 pages. Without the engine, text extraction and built-in templates remain available.

PDF originals are stored in the private `resume-originals` Supabase bucket under the authenticated user ID. Reads and uploads use that user's token and owner-only storage policies, never a service-role key. Each upload is immutable, so saved applications retain their own source PDF and edit set after the master resume changes. Save application preserves these references in history. Local preview stores originals in ignored `data/uploads/local/`. Uploaded originals are retained even if an application is deleted; add account-level deletion and retention management before a public launch.

The PDF engine uses PyMuPDF under its AGPL/commercial licensing options. Before offering a closed-source public service, obtain a suitable commercial license or meet the AGPL obligations.

Checks: `npm test`, `npm run build`, and `python tests/test_pdf_template.py` (the last also needs ReportLab and NumPy). The PDF fixture test verifies unchanged pixels outside the edit, unchanged extra pages and vector drawings, selectable replacement text, overflow rejection and protected-block rejection.

## GitHub project approval
Generate now checks the connected public GitHub username against the current JD before rewriting. GitHub login supplies a username when available; otherwise the app prompts to connect a public username or skip projects. The username is remembered in account metadata (local browser storage in preview mode). Matching uses descriptions, primary languages and topics from up to 100 recent public, non-fork repositories, plus up to eight candidate README excerpts. It is a bounded evidence match, not a source-code audit. Public API requests are cached for five minutes and rate-limit failures allow retry/skip.

No project is selected automatically. The user selects matches, confirms personal contribution, and clicks Import & rewrite. Cancel makes no change to the current draft. Continuing without GitHub sends no projects, including previously selected ones. Every new generation rechecks the current JD; only approved project evidence goes to the AI provider, and the saved result records approvedProjects. Original PDF mode keeps its fixed-layout limits; the review offers an explicit switch to a built-in template for adding project sections.

## Deploy to Render
The included Dockerfile packages the Node API, React build and Python PDF engine together. Create a free Docker web service from this repository, or use the included Render Blueprint. The region defaults to Singapore and the health check is /healthz.

1. In Render, set SUPABASE_URL and SUPABASE_ANON_KEY to your project's public configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the same values before the Docker build. The build rejects missing client configuration.
2. Set AI_PROVIDER=groq, GROQ_API_KEY and GROQ_MODEL=openai/gpt-oss-120b. Only the two VITE variables are declared as Docker build arguments; AI credentials remain server configuration. Never commit .env or upload the local tools/config directory.
3. Set TRUST_PROXY_HOPS=1 for Render's proxy. The container listens on 0.0.0.0 and uses Render's PORT. Direct local execution defaults to no trusted proxies.
4. Deploy main. In Supabase Authentication > URL Configuration, set Site URL to the service's HTTPS origin and add that origin with a trailing slash to Redirect URLs. Keep local redirects if you still develop locally. The GitHub OAuth provider callback remains the Supabase callback URL.
5. Verify /healthz returns 200, /api/config reports cloud and AI enabled, and /api/tailor returns 401 without a session. Sign in through GitHub, save a test application, and confirm it reloads after signing out and back in.

Supabase stores history and uploaded original PDFs; no persistent Render disk is required. The free web service can sleep when idle, so the first request may be slow. Changing VITE variables requires a rebuild. This configuration is for a single-service MVP; the public-launch limitations above still apply.
