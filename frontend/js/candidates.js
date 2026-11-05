// Candidates page for one job.
//   - ranked list (scored candidates) with filters, search, sort and expandable details
//   - "Processing queue" for candidates stuck before extraction or scoring,
//     so the recruiter can retry exactly those candidates by hand

(function () {
  renderSidebar("jobs");
  byId("search-icon").replaceWith(icon("search"));

  const jobId = getJobIdFromUrl();

  const refs = {
    head: byId("job-head"),
    pageError: byId("page-error"),
    banner: byId("banner"),
    loading: byId("loading"),
    content: byId("content"),
    tierCard: byId("tier-card"),
    queueCard: byId("queue-card"),
    emptyCard: byId("empty-card"),
    noneRanked: byId("none-ranked"),
    listSection: byId("list-section"),
    list: byId("cand-list"),
    noResults: byId("no-results"),
    search: byId("search"),
    sort: byId("sort"),
    pills: byId("tier-pills"),
  };

  const state = {
    job: null,
    ranked: [], // GET /resumes/ranked/{id}: scored candidates, best first
    all: [],    // GET /resumes/all/{id}: every candidate at any stage
    rankOf: new Map(),
    tier: "all",
    sort: "score",
    search: "",
    openId: null,
    queueTab: "not_extracted",
    selected: new Set(),
    busy: false,
    progress: "",
    loadedOnce: false,
    loading: false,
  };

  if (!jobId) {
    refs.loading.hidden = true;
    showAlert(refs.pageError, "error", "No job selected. Open this page from the Jobs list.");
    return;
  }
  byId("empty-upload").href = `upload.html?job=${jobId}`;

  // ---------- Which stage is a candidate in? ----------
  // Same idea as the backend: empty fields mean "this step has not run yet".
  function stageOf(candidate) {
    if (!candidate.extracted_skills) return "not_extracted";
    if (!hasScore(candidate)) return "extracted_not_matched";
    return "matched";
  }

  function groupByStage() {
    const groups = { not_extracted: [], extracted_not_matched: [], matched: [] };
    state.all.forEach((candidate) => groups[stageOf(candidate)].push(candidate));
    return groups;
  }

  // ---------- Loading ----------
  async function load() {
    if (state.loading) return;
    state.loading = true;
    try {
      // Three requests at the same time instead of one after another.
      const [job, ranked, all] = await Promise.all([
        API.getJob(jobId),
        API.getRanked(jobId),
        API.getAll(jobId),
      ]);
      state.job = job;
      state.ranked = ranked;
      state.all = all;
      state.rankOf = new Map(ranked.map((candidate, index) => [candidate.id, index + 1]));

      // Forget selections of candidates that moved to another stage.
      const pendingIds = new Set(all.filter((c) => stageOf(c) !== "matched").map((c) => c.id));
      state.selected = new Set([...state.selected].filter((id) => pendingIds.has(id)));

      refs.loading.hidden = true;
      refs.content.hidden = false;
      state.loadedOnce = true;
      hideAlert(refs.pageError);
      renderAll();
    } catch (error) {
      refs.loading.hidden = true;
      if (!state.loadedOnce) {
        showAlert(refs.pageError, "error", error.status === 404 ? "This job does not exist." : error.message);
      } else {
        showAlert(refs.banner, "error", `Could not refresh. ${error.message}`);
      }
    } finally {
      state.loading = false;
    }
  }

  // ---------- Rendering ----------
  function renderAll() {
    renderHead();
    renderTierCard();
    renderQueue();

    const hasAny = state.all.length > 0;
    const hasRanked = state.ranked.length > 0;
    refs.emptyCard.hidden = hasAny;
    refs.noneRanked.hidden = !(hasAny && !hasRanked);
    refs.listSection.hidden = !hasRanked;

    if (hasRanked) {
      renderPills();
      renderList();
    }
  }

  function renderHead() {
    const job = state.job;
    document.title = `${job.title} — TalentLens AI`;
    const skills = splitSkills(job.required_skills);

    refs.head.replaceChildren(
      el(
        "div",
        {},
        el(
          "nav",
          { class: "crumbs", "aria-label": "Breadcrumb" },
          el("a", { href: "jobs.html", text: "Jobs" }),
          el("span", { text: "/" }),
          el("span", { text: job.title })
        ),
        el("h1", { text: job.title }),
        el(
          "div",
          { class: "meta-row" },
          el("span", { class: "chip", text: job.location }),
          el("span", { class: "chip", text: job.work_mode }),
          el("span", { class: "chip", text: job.employment_type }),
          el("span", { class: "chip chip-outline", text: experienceText(job) }),
          skills.slice(0, 5).map((skill) => el("span", { class: "chip chip-brand", text: skill })),
          skills.length > 5 ? el("span", { class: "chip", text: `+${skills.length - 5}` }) : null
        )
      ),
      el(
        "div",
        { class: "head-actions" },
        el("button", { type: "button", class: "btn btn-outline", onclick: load }, icon("refresh"), "Refresh"),
        el("a", { class: "btn btn-primary", href: `upload.html?job=${jobId}` }, icon("upload"), "Upload resumes")
      )
    );
  }

  // ----- Score distribution -----
  function tierCounts() {
    const counts = { high: 0, mid: 0, low: 0 };
    state.ranked.forEach((candidate) => counts[scoreTier(candidate.match_score)]++);
    return counts;
  }

  function renderTierCard() {
    const total = state.ranked.length;
    if (total === 0) {
      refs.tierCard.hidden = true;
      return;
    }
    const counts = tierCounts();
    const legend = (tier, label) =>
      el("span", { class: `tier-${tier}` }, el("i", { class: "legend-dot" }), `${counts[tier]} ${label}`);

    refs.tierCard.replaceChildren(
      el(
        "div",
        { class: "tier-top" },
        el("strong", { text: `${plural(total, "ranked candidate")}` }),
        el("div", { class: "tier-legend" }, legend("high", "strong"), legend("mid", "moderate"), legend("low", "weak"))
      ),
      el(
        "div",
        { class: "tier-bar" },
        ["high", "mid", "low"]
          .filter((tier) => counts[tier] > 0)
          .map((tier) => el("div", { class: `tier-seg tier-${tier}`, style: `width:${(counts[tier] / total) * 100}%` }))
      )
    );
    refs.tierCard.hidden = false;
  }

  // ----- Processing queue -----
  const QUEUE_HINTS = {
    not_extracted:
      "These resumes are uploaded, but the AI has not read them yet. This usually happens when a previous run hit a rate limit.",
    extracted_not_matched:
      "These profiles are ready. Run scoring to compare them with this job and add them to the ranking.",
  };

  function toggleOne(id) {
    if (state.selected.has(id)) state.selected.delete(id);
    else state.selected.add(id);
    renderQueue();
  }

  function toggleAll(rows, turnOn) {
    rows.forEach((candidate) => {
      if (turnOn) state.selected.add(candidate.id);
      else state.selected.delete(candidate.id);
    });
    renderQueue();
  }

  function renderQueue() {
    const groups = groupByStage();
    const pending = groups.not_extracted.length + groups.extracted_not_matched.length;
    if (pending === 0) {
      refs.queueCard.hidden = true;
      return;
    }

    if (groups[state.queueTab].length === 0) {
      state.queueTab = groups.not_extracted.length > 0 ? "not_extracted" : "extracted_not_matched";
    }
    const tab = state.queueTab;
    const rows = groups[tab];
    const isExtract = tab === "not_extracted";
    const selectedCount = rows.filter((c) => state.selected.has(c.id)).length;
    const allSelected = rows.length > 0 && selectedCount === rows.length;

    const tabButton = (key, label) =>
      groups[key].length === 0
        ? null
        : el(
          "button",
          {
            type: "button",
            class: `tab${tab === key ? " is-active" : ""}`,
            disabled: state.busy,
            onclick: () => {
              state.queueTab = key;
              renderQueue();
            },
          },
          label,
          el("span", { class: "tab-count", text: groups[key].length })
        );

    refs.queueCard.replaceChildren(
      el(
        "div",
        { class: "queue-head" },
        el("strong", { text: "Processing queue" }),
        el("span", { text: `${plural(pending, "candidate")} not on the ranked list yet` })
      ),
      el("div", { class: "tabs" }, tabButton("not_extracted", "Not extracted"), tabButton("extracted_not_matched", "Extracted, not scored")),
      el(
        "div",
        { class: "queue-body" },
        el("p", { class: "queue-hint", text: QUEUE_HINTS[tab] }),
        el(
          "div",
          { class: "queue-bar" },
          el(
            "label",
            { class: "check" },
            el("input", { type: "checkbox", checked: allSelected, disabled: state.busy, onchange: () => toggleAll(rows, !allSelected) }),
            `Select all (${rows.length})`
          ),
          el("button", {
            type: "button",
            class: "btn btn-primary btn-sm",
            disabled: selectedCount === 0 || state.busy,
            text: `${isExtract ? "Extract" : "Score"} selected (${selectedCount})`,
            onclick: () => runQueue(tab),
          })
        ),
        el(
          "div",
          { class: "queue-list" },
          rows.map((candidate) =>
            el(
              "label",
              { class: "queue-row" },
              el("span", { class: "check" }, el("input", { type: "checkbox", checked: state.selected.has(candidate.id), disabled: state.busy, onchange: () => toggleOne(candidate.id) })),
              el("span", { class: "q-name", text: candidate.name || `Candidate #${candidate.id}` }),
              el("span", { class: "q-meta", text: `ID ${candidate.id} · uploaded ${timeAgo(candidate.created_at)}` })
            )
          )
        ),
        state.busy ? el("div", { class: "progress-line" }, el("span", { class: "spinner" }), el("span", { text: state.progress })) : null
      )
    );
    refs.queueCard.hidden = false;
  }

  async function runQueue(tab) {
    if (state.busy) return;
    const isExtract = tab === "not_extracted";
    const ids = groupByStage()[tab].filter((c) => state.selected.has(c.id)).map((c) => c.id);
    if (ids.length === 0) return;

    state.busy = true;
    state.progress = "Starting...";
    hideAlert(refs.banner);
    renderQueue();

    const result = await runInChunks(isExtract ? "extract" : "match", jobId, ids, (p) => {
      state.progress = `${isExtract ? "Reading resumes" : "Scoring candidates"} ${p.from}–${p.to} of ${p.total}...`;
      renderQueue();
    });

    state.busy = false;
    state.progress = "";
    state.selected.clear();

    const done = result.doneIds.length;
    if (!result.stopped && done === ids.length) {
      showAlert(
        refs.banner,
        "success",
        isExtract
          ? `Extracted ${plural(done, "profile")}. They moved to "Extracted, not scored". Select them and run scoring.`
          : `Scored ${plural(done, "candidate")}. They are now on the ranked list.`
      );
    } else {
      const verb = isExtract ? "Extracted" : "Scored";
      showAlert(
        refs.banner,
        done > 0 ? "warn" : "error",
        `${verb} ${done} of ${ids.length}. ${result.stopped ? result.stopped.message : ""}`.trim()
      );
    }
    await load();
  }

  // ----- Filters -----
  function renderPills() {
    const counts = tierCounts();
    const total = state.ranked.length;
    const defs = [
      ["all", `All (${total})`],
      ["high", `Strong (${counts.high})`],
      ["mid", `Moderate (${counts.mid})`],
      ["low", `Weak (${counts.low})`],
    ];
    refs.pills.replaceChildren(
      ...defs.map(([key, label]) =>
        el("button", {
          type: "button",
          class: `pill${state.tier === key ? " is-active" : ""}`,
          text: label,
          onclick: () => {
            state.tier = key;
            renderPills();
            renderList();
          },
        })
      )
    );
  }

  function searchText(candidate) {
    const skills = asArray(safeParse(candidate.extracted_skills, []));
    return [candidate.name, candidate.email, ...skills].join(" ").toLowerCase();
  }

  function visibleCandidates() {
    let list = state.ranked.slice();
    if (state.tier !== "all") list = list.filter((c) => scoreTier(c.match_score) === state.tier);
    const query = state.search.trim().toLowerCase();
    if (query) list = list.filter((c) => searchText(c).includes(query));

    if (state.sort === "name") list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    else list.sort((a, b) => b.match_score - a.match_score);
    return list;
  }

  // ----- Candidate rows -----
  function detail(title, content) {
    return el("div", { class: "detail" }, el("h4", { text: title }), content);
  }

  function emptyNote(text, good) {
    return el("span", { class: `detail-empty${good ? " good" : ""}`, text });
  }

  function setRowOpen(root, open) {
    root.classList.toggle("is-open", open);
    root.querySelector(".cand-body").hidden = !open;
    root.querySelector(".cand-head").setAttribute("aria-expanded", String(open));
  }

  function toggleRow(root, id) {
    const wasOpen = state.openId === id;
    refs.list.querySelectorAll(".cand.is-open").forEach((node) => setRowOpen(node, false));
    if (wasOpen) {
      state.openId = null;
    } else {
      setRowOpen(root, true);
      state.openId = id;
    }
  }

  function candidateRow(candidate) {
    const skills = asArray(safeParse(candidate.extracted_skills, []));
    const projects = asArray(safeParse(candidate.extracted_projects, []));
    const reasonData = safeParse(candidate.match_reasons, {}) || {};
    const reasons = asArray(reasonData.reasons);
    const missing = asArray(reasonData.missing_skills);

    const score = Math.round(candidate.match_score);
    const tier = scoreTier(candidate.match_score);
    const open = state.openId === candidate.id;

    const head = el(
      "button",
      { type: "button", class: "cand-head", "aria-expanded": String(open) },
      el("span", { class: "cand-rank", text: `#${state.rankOf.get(candidate.id)}` }),
      el(
        "span",
        {},
        el("span", { class: "cand-name", text: candidate.name || "Unnamed candidate" }),
        el("span", { class: "cand-email", text: candidate.email || "No email found" })
      ),
      el("span", { class: "cand-skills" }, skills.slice(0, 3).map((skill) => el("span", { class: "chip", text: skill }))),
      el(
        "span",
        { class: `cand-score tier-${tier}` },
        el("span", { class: "score-num", text: `${score}%` }),
        el("span", { class: "score-track" }, el("span", { class: "score-fill", style: `width:${Math.max(0, Math.min(100, score))}%` }))
      ),
      el("span", { class: "chev", "aria-hidden": "true", text: "▾" })
    );

    const body = el(
      "div",
      { class: "cand-body", hidden: !open },
      el(
        "div",
        { class: "detail-grid" },
        detail(
          "Skills",
          skills.length > 0
            ? el("div", { class: "chip-row" }, skills.map((skill) => el("span", { class: "chip chip-brand", text: skill })))
            : emptyNote("No skills extracted")
        ),
        detail("Experience", el("p", { text: candidate.extracted_experience || "Not specified" })),
        detail("Education", el("p", { text: candidate.extracted_education || "Not specified" }))
      ),
      detail(
        "Projects",
        projects.length > 0
          ? el("ul", { class: "bullets" }, projects.map((project) => el("li", { text: project })))
          : emptyNote("No projects extracted")
      ),
      el(
        "div",
        { class: "detail-grid two" },
        detail(
          "Why this score",
          reasons.length > 0
            ? el("ul", { class: "bullets" }, reasons.map((reason) => el("li", { text: reason })))
            : emptyNote("No reasoning available")
        ),
        detail(
          "Missing skills",
          missing.length > 0
            ? el("div", { class: "chip-row" }, missing.map((skill) => el("span", { class: "chip chip-bad", text: skill })))
            : emptyNote("Covers all required skills", true)
        )
      )
    );

    const root = el("article", { class: `cand${open ? " is-open" : ""}` }, head, body);
    head.addEventListener("click", () => toggleRow(root, candidate.id));
    return root;
  }

  function renderList() {
    const list = visibleCandidates();
    refs.noResults.hidden = list.length > 0;
    refs.list.replaceChildren(...list.map(candidateRow));
  }

  refs.search.addEventListener("input", () => {
    state.search = refs.search.value;
    renderList();
  });
  refs.sort.addEventListener("change", () => {
    state.sort = refs.sort.value;
    renderList();
  });

  load();
})();
