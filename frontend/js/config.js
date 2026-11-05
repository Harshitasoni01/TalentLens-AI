// Where the TalentLens AI backend (FastAPI) is running.
// Local development: leave as is.
// After deploying the backend, replace it with your backend URL,
// for example: "https://TalentLens AI-backend.onrender.com"
const API_BASE_URL = "http://127.0.0.1:8000";

// Resumes are sent to the AI in small batches instead of all at once.
// The backend pauses ~13 seconds between candidates (to respect the free AI limit),
// so a big single request can run for minutes and get cut off by the hosting proxy.
// With batches of 3, every request finishes in well under a minute.
const CHUNK_SIZE = 3;
