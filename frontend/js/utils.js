// Small helpers used by every page.

/**
 * Tiny DOM builder:  el("div", { class: "box", onclick: fn }, "text", childElement)
 * Text is always added as a text node (never as HTML), so data coming from the
 * server or from the AI can never inject HTML or scripts into the page.
 */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function byId(id) {
  return document.getElementById(id);
}

// ----- Icons (fixed, trusted SVG strings written by us, never user data) -----
const ICON_PATHS = {
  jobs: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 20h16"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
};

function icon(name) {
  const span = document.createElement("span");
  span.className = "icon";
  span.setAttribute("aria-hidden", "true");
  span.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round">' + (ICON_PATHS[name] || "") + "</svg>";
  return span;
}

// ----- URL -----
// Pages like upload.html?job=3 get the job id from the address bar.
function getJobIdFromUrl() {
  const raw = new URLSearchParams(window.location.search).get("job");
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// ----- Data helpers -----
// Skills, projects and reasons are saved by the backend as JSON text.
function safeParse(text, fallback) {
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch (error) {
    return fallback;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function splitSkills(text) {
  return (text || "")
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function hasScore(candidate) {
  return candidate.match_score !== null && candidate.match_score !== undefined;
}

// ----- Score tiers (same thresholds as the backend-side logic of TalentLens AI) -----
function scoreTier(score) {
  if (score >= 80) return "high";
  if (score >= 60) return "mid";
  return "low";
}

const TIER_LABELS = { high: "Strong", mid: "Moderate", low: "Weak" };

// ----- Formatting -----
function timeAgo(dateString) {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDate(dateString) {
  // "2026-08-30" -> "30 Aug 2026". The time part avoids timezone shifts.
  return new Date(`${dateString}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSalary(job) {
  const lakh = (n) => `₹${(n / 100000).toFixed(1)}L`;
  if (job.salary_min && job.salary_max) return `${lakh(job.salary_min)} – ${lakh(job.salary_max)}`;
  if (job.salary_min) return `From ${lakh(job.salary_min)}`;
  if (job.salary_max) return `Up to ${lakh(job.salary_max)}`;
  return null;
}

function experienceText(job) {
  if (job.min_experience === job.max_experience) return `${job.min_experience} yrs`;
  return `${job.min_experience}–${job.max_experience} yrs`;
}

// ----- Alerts -----
// type: "error" | "warn" | "success" | "info"
function showAlert(container, type, message) {
  container.className = `alert alert-${type}`;
  container.textContent = message;
  container.hidden = false;
}

function hideAlert(container) {
  container.hidden = true;
  container.textContent = "";
}
