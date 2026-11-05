# TalentLens AI frontend (HTML, CSS, JavaScript)

Plain HTML, CSS and JavaScript. No framework, no build step, no `npm install`.
It talks to the existing TalentLens AI FastAPI backend and uses the same endpoints as the React version.

## Run it locally

1. Start the backend as usual (`uvicorn app.main:app --reload` in the `backend` folder).
2. In a second terminal, serve this folder on **port 5173**:

```bash
cd frontend
python -m http.server 5173
```

3. Open **http://localhost:5173**

Port 5173 is used on purpose: the backend's CORS list already allows `http://localhost:5173`, so the backend needs no change.
If you prefer another port (for example VS Code Live Server on 5500), add that address to the backend's allowed origins (or set it as `FRONTEND_URL` in `backend/.env`).

Do not open the `.html` files by double-clicking them. Serve them from a local server as shown above.

## Settings

All settings are in `js/config.js`:

| Setting | What it does |
|---|---|
| `API_BASE_URL` | Where the backend runs. Local default is `http://127.0.0.1:8000`. After deploying, put your Render URL here. |
| `CHUNK_SIZE` | How many resumes are sent to the AI per request (default 3). See "Batching" below. |

## Deploy

Deploy the `frontend` folder as a static site (Vercel or Netlify). There is nothing to build.
Set `API_BASE_URL` to your backend URL first, and set `FRONTEND_URL` on the backend to your site address.

## Pages

| File | Page | Backend calls |
|---|---|---|
| `index.html` | Landing page | none |
| `jobs.html` | Job list with stats, search, work-mode filter | `GET /jobs/` |
| `create-job.html` | Create a job (all 12 fields) | `POST /jobs/` |
| `upload.html?job=ID` | Upload resumes and run the pipeline | `GET /jobs/{id}`, `POST /resumes/upload/{id}`, `POST /processing/extract/{id}`, `POST /processing/match/{id}` |
| `candidates.html?job=ID` | Ranked shortlist and processing queue | `GET /jobs/{id}`, `GET /resumes/ranked/{id}`, `GET /resumes/all/{id}`, extract and match again for retries |

## Folder structure

```
frontend/
├── index.html, jobs.html, create-job.html, upload.html, candidates.html
├── css/
│   ├── styles.css      shared design tokens, layout and components
│   └── landing.css     landing page only
└── js/
    ├── config.js       API address and batch size
    ├── api.js          every backend call, in one place
    ├── utils.js        helpers (DOM builder, formatting, score tiers)
    ├── pipeline.js     sends candidates to the AI in small batches
    ├── app-shell.js    the sidebar shared by the app pages
    └── jobs.js, create-job.js, upload.js, candidates.js   one script per page
```

Every page loads only the scripts it needs, in this order: `config.js`, `api.js`, `utils.js`, then the page script.

## How it works (for explaining)

- **One file per page, one place for API calls.** Pages never call `fetch` directly. They call `API.getJobs()`, `API.uploadResumes()` and so on from `api.js`. If an endpoint changes, you edit one file.
- **The job id travels in the URL.** `upload.html?job=3` and `candidates.html?job=3` read the id with `URLSearchParams`.
- **Skills are stored as text by the backend.** The backend saves skills, projects and reasons as JSON strings, and the frontend turns them back into arrays with `JSON.parse` (inside a `safeParse` helper, so bad data cannot crash the page).
- **Pipeline stage comes from empty fields.** No extracted skills means "not extracted". Skills but no score means "extracted, not scored". Both present means ranked. The processing queue is built from this.
- **Safe rendering.** Text from the server and the AI is always added with `textContent` (through the `el()` helper), never `innerHTML`, so it cannot inject HTML or scripts.
- **Batching.** The backend waits about 13 seconds between candidates (to respect the free AI rate limit), so one request with many resumes can run for minutes and be cut off by the hosting proxy. The frontend therefore sends 3 resumes at a time (the backend already accepts `candidate_ids`). Each request stays short, progress is real ("Reading resumes 4-6 of 10"), and if the AI is rate-limited the frontend stops and tells the user. Candidates already processed stay saved, and the rest can be retried from the processing queue.
- **Honest failure handling.** A partial result is shown as a warning with exact counts ("Extracted 4 of 5"), never as a success.

## Known limitations

- Every resume takes roughly 15 seconds, because of the backend's rate-limit pacing.
- The page must stay open while processing runs (the browser warns before closing).
- Scanned PDFs (images of text) cannot be read by the backend, so they are reported as unreadable.
- Fonts (Inter, Sora) load from Google Fonts. Without internet the page falls back to system fonts.
