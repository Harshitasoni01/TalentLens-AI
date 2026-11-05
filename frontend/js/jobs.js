// Jobs page: GET /jobs/ then show stats, search, work-mode filter and the job cards.

(function () {
  renderSidebar("jobs");
  byId("search-icon").replaceWith(icon("search"));

  const refs = {
    error: byId("error"),
    stats: byId("stats"),
    toolbar: byId("toolbar"),
    pills: byId("mode-pills"),
    search: byId("search"),
    loading: byId("loading"),
    empty: byId("empty"),
    noMatch: byId("no-match"),
    grid: byId("grid"),
  };

  let jobs = [];
  let workMode = "All";
  let searchText = "";

  // ---------- Loading ----------
  async function loadJobs() {
    try {
      jobs = await API.getJobs();
    } catch (error) {
      refs.loading.hidden = true;
      showAlert(refs.error, "error", error.message);
      return;
    }

    refs.loading.hidden = true;

    if (jobs.length === 0) {
      refs.empty.hidden = false;
      return;
    }

    renderStats();
    renderPills();
    refs.toolbar.hidden = false;
    renderGrid();
  }

  // ---------- Summary numbers ----------
  function renderStats() {
    const totalCandidates = jobs.reduce((sum, job) => sum + job.candidate_count, 0);
    const scores = jobs.filter((job) => job.top_score !== null).map((job) => job.top_score);
    const best = scores.length ? `${Math.max(...scores)}%` : "—";

    const stat = (value, label) =>
      el("div", { class: "card stat" }, el("div", { class: "stat-value", text: value }), el("div", { class: "stat-label", text: label }));

    refs.stats.replaceChildren(
      stat(jobs.length, jobs.length === 1 ? "open role" : "open roles"),
      stat(totalCandidates, "candidates uploaded"),
      stat(best, "best score so far")
    );
    refs.stats.hidden = false;
  }

  // ---------- Work mode filter pills ----------
  function renderPills() {
    const modes = ["All", ...new Set(jobs.map((job) => job.work_mode))];
    refs.pills.replaceChildren(
      ...modes.map((mode) =>
        el("button", {
          type: "button",
          class: `pill${mode === workMode ? " is-active" : ""}`,
          text: mode,
          onclick: () => {
            workMode = mode;
            renderPills();
            renderGrid();
          },
        })
      )
    );
  }

  // ---------- Cards ----------
  function visibleJobs() {
    const query = searchText.trim().toLowerCase();
    return jobs.filter((job) => {
      const matchesText =
        !query || job.title.toLowerCase().includes(query) || job.location.toLowerCase().includes(query);
      const matchesMode = workMode === "All" || job.work_mode === workMode;
      return matchesText && matchesMode;
    });
  }

  function jobCard(job) {
    const skills = splitSkills(job.required_skills);
    const tier = job.top_score !== null ? scoreTier(job.top_score) : null;

    let stats;
    if (job.top_score !== null) {
      stats = [
        el("div", {}, el("div", { class: "job-stat-value", text: job.candidate_count }), el("div", { class: "job-stat-label", text: "candidates" })),
        el("div", { class: `tier-${tier}` }, el("div", { class: "job-stat-value", text: `${job.top_score}%` }), el("div", { class: "job-stat-label", text: "top score" })),
        el("div", {}, el("div", { class: "job-stat-value", text: `${job.avg_score}%` }), el("div", { class: "job-stat-label", text: "average" })),
      ];
    } else {
      stats = [
        el("div", {}, el("div", { class: "job-stat-value", text: job.candidate_count }), el("div", { class: "job-stat-label", text: "candidates" })),
        el("span", { class: "job-pending", text: job.candidate_count > 0 ? "Not scored yet" : "Waiting for resumes" }),
      ];
    }

    return el(
      "article",
      { class: "job-card" },
      el(
        "div",
        { class: "job-top" },
        el("h3", {}, el("a", { class: "card-link", href: `candidates.html?job=${job.id}`, text: job.title })),
        el("span", { class: "job-time", text: timeAgo(job.created_at) })
      ),
      el(
        "div",
        { class: "meta-row", style: "margin-top:0" },
        el("span", { class: "chip", text: job.location }),
        el("span", { class: "chip", text: job.work_mode }),
        el("span", { class: "chip", text: job.employment_type }),
        el("span", { class: "chip chip-outline", text: experienceText(job) })
      ),
      el(
        "div",
        { class: "job-skills" },
        skills.slice(0, 4).map((skill) => el("span", { class: "chip chip-brand", text: skill })),
        skills.length > 4 ? el("span", { class: "chip", text: `+${skills.length - 4}` }) : null
      ),
      el("div", { class: "job-stats" }, stats),
      el(
        "div",
        { class: "job-actions" },
        el("a", { class: "btn btn-ghost btn-sm", href: `upload.html?job=${job.id}` }, icon("upload"), "Upload resumes")
      )
    );
  }

  function renderGrid() {
    const list = visibleJobs();
    refs.noMatch.hidden = list.length > 0;
    refs.grid.hidden = list.length === 0;
    refs.grid.replaceChildren(...list.map(jobCard));
  }

  refs.search.addEventListener("input", () => {
    searchText = refs.search.value;
    renderGrid();
  });

  loadJobs();
})();
