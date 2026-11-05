// Every call to the FastAPI backend lives in this file.
// Pages never call fetch() directly, they call API.something().

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status; // 0 means the server could not be reached at all
  }
}

// FastAPI sends errors as { detail: "text" } or { detail: [ { msg: "..." }, ... ] }
function readErrorDetail(data, status) {
  if (data && typeof data.detail === "string") return data.detail;
  if (data && Array.isArray(data.detail)) {
    return data.detail.map((item) => item.msg).join(". ");
  }
  return `Request failed (status ${status}).`;
}

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, options);
  } catch (networkError) {
    throw new ApiError(
      "Cannot reach the server. Check that the backend is running and that API_BASE_URL in js/config.js is correct.",
      0
    );
  }

  let data = null;
  try {
    data = await response.json();
  } catch (parseError) {
    data = null;
  }

  if (!response.ok) {
    throw new ApiError(readErrorDetail(data, response.status), response.status);
  }
  return data;
}

function postJson(path, body) {
  return apiRequest(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const API = {
  // ----- Jobs -----
  getJobs: () => apiRequest("/jobs/"),
  getJob: (jobId) => apiRequest(`/jobs/${jobId}`),
  createJob: (payload) => postJson("/jobs/", payload),

  // ----- Resumes -----
  uploadResumes(jobId, files) {
    // Files are sent as multipart/form-data. The key must be "files",
    // because the backend parameter is named `files`.
    // Do not set Content-Type here: the browser adds it, with the boundary.
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    return apiRequest(`/resumes/upload/${jobId}`, { method: "POST", body: formData });
  },
  getRanked: (jobId) => apiRequest(`/resumes/ranked/${jobId}`), // scored candidates only
  getAll: (jobId) => apiRequest(`/resumes/all/${jobId}`),       // every candidate, any stage

  // ----- AI processing -----
  // candidateIds is optional. When given, only those candidates are processed.
  extractCandidates: (jobId, candidateIds) =>
    postJson(`/processing/extract/${jobId}`, candidateIds ? { candidate_ids: candidateIds } : undefined),
  matchCandidates: (jobId, candidateIds) =>
    postJson(`/processing/match/${jobId}`, candidateIds ? { candidate_ids: candidateIds } : undefined),
};
