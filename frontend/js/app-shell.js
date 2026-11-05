// Builds the navy sidebar shown on every app page, so the markup lives in one place.
// Usage: renderSidebar("jobs")  or  renderSidebar("new")

function brandMark() {
  const span = document.createElement("span");
  span.className = "brand-mark";
  span.setAttribute("aria-hidden", "true");
  span.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="6" cy="7" r="2"/><circle cx="18" cy="7" r="2"/><circle cx="12" cy="18" r="2"/>' +
    '<path d="M7.6 8.4l3.3 7.6M16.4 8.4l-3.3 7.6M8 7h8"/></svg>';
  return span;
}

function renderSidebar(active) {
  const mount = byId("sidebar");
  if (!mount) return;

  const link = (key, href, label, iconName) =>
    el(
      "a",
      { class: `side-link${active === key ? " is-active" : ""}`, href },
      icon(iconName),
      el("span", { text: label })
    );

  mount.replaceChildren(
    el("a", { class: "side-brand", href: "index.html" }, brandMark(), el("span", { text: "TalentLens AI" })),
    el(
      "nav",
      { class: "side-nav", "aria-label": "Main" },
      link("jobs", "jobs.html", "Jobs", "jobs"),
      link("new", "create-job.html", "New job", "plus")
    ),
    el("a", { class: "side-foot", href: "index.html" }, icon("back"), el("span", { text: "Back to home" }))
  );
}
