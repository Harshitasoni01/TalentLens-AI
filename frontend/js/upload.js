// Upload page: pick files, then run   upload -> extract profiles -> match & score
// with a clear status message for every step.

(function () {
  renderSidebar("jobs");

  const jobId = getJobIdFromUrl();

  const refs = {
    pageError: byId("page-error"),
    formError: byId("form-error"),
    uploadPanel: byId("upload-panel"),
    pipelinePanel: byId("pipeline-panel"),
    summaryPanel: byId("summary-panel"),
    dropzone: byId("dropzone"),
    fileInput: byId("file-input"),
    fileBox: byId("file-box"),
    fileCount: byId("file-count"),
    fileList: byId("file-list"),
    clearFiles: byId("clear-files"),
    startBtn: byId("start-btn"),
    steps: byId("steps"),
    summaryAlert: byId("summary-alert"),
    sumUploaded: byId("sum-uploaded"),
    sumExtracted: byId("sum-extracted"),
    sumScored: byId("sum-scored"),
    viewLink: byId("view-link"),
    againBtn: byId("again-btn"),
    snapshot: byId("snapshot"),
    snapshotLoading: byId("snapshot-loading"),
  };

  byId("dz-icon").append(icon("upload"));

  let job = null;
  let files = [];
  let running = false;

  // Warn before the user closes the tab while the AI is still working.
  window.addEventListener("beforeunload", (event) => {
    if (running) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  if (!jobId) {
    showAlert(refs.pageError, "error", "No job selected. Open this page from the Jobs list.");
    refs.uploadPanel.hidden = true;
    refs.snapshotLoading.hidden = true;
    return;
  }

  refs.viewLink.href = `candidates.html?job=${jobId}`;

  // ---------- Role snapshot ----------
  async function loadJob() {
    try {
      job = await API.getJob(jobId);
    } catch (error) {
      refs.snapshotLoading.hidden = true;
      refs.uploadPanel.hidden = true;
      showAlert(
        refs.pageError,
        "error",
        error.status === 404 ? "This job does not exist." : error.message
      );
      return;
    }
    byId("crumb-title").textContent = job.title;
    renderSnapshot();
  }

  function snapRow(label, value) {
    return el("div", { class: "snap-row" }, el("span", { text: label }), el("span", { text: value }));
  }

  function renderSnapshot() {
    const required = splitSkills(job.required_skills);
    const preferred = splitSkills(job.preferred_skills);
    const salary = formatSalary(job);

    refs.snapshot.replaceChildren(
      el("div", { class: "snap-label", text: "Hiring for" }),
      el("h2", { text: job.title }),
      el(
        "div",
        { class: "meta-row", style: "margin:0 0 0.9rem" },
        el("span", { class: "chip", text: job.location }),
        el("span", { class: "chip", text: job.work_mode }),
        el("span", { class: "chip", text: job.employment_type })
      ),
      snapRow("Experience", experienceText(job)),
      job.openings ? snapRow("Openings", String(job.openings)) : null,
      salary ? snapRow("Salary", salary) : null,
      job.application_deadline ? snapRow("Deadline", formatDate(job.application_deadline)) : null,
      job.education_requirement ? snapRow("Education", job.education_requirement) : null,
      el(
        "div",
        { class: "snap-block" },
        el("div", { class: "snap-label", text: "Required skills" }),
        el("div", { class: "job-skills" }, required.map((skill) => el("span", { class: "chip chip-brand", text: skill })))
      ),
      preferred.length > 0
        ? el(
            "div",
            { class: "snap-block" },
            el("div", { class: "snap-label", text: "Preferred skills" }),
            el("div", { class: "job-skills" }, preferred.map((skill) => el("span", { class: "chip chip-outline", text: skill })))
          )
        : null
    );
    refs.snapshotLoading.hidden = true;
    refs.snapshot.hidden = false;
  }

  // ---------- Choosing files ----------
  function fileKey(file) {
    return `${file.name}::${file.size}`;
  }

  function addFiles(list) {
    const incoming = Array.from(list);
    const valid = incoming.filter((file) => /\.(pdf|docx)$/i.test(file.name));
    const rejected = incoming.length - valid.length;

    const known = new Set(files.map(fileKey));
    valid.forEach((file) => {
      if (!known.has(fileKey(file))) {
        files.push(file);
        known.add(fileKey(file));
      }
    });

    if (rejected > 0) {
      showAlert(refs.formError, "warn", `${plural(rejected, "file")} skipped. Only PDF and DOCX resumes are supported.`);
    } else {
      hideAlert(refs.formError);
    }
    renderFiles();
  }

  function removeFile(file) {
    files = files.filter((item) => item !== file);
    renderFiles();
  }

  function renderFiles() {
    refs.fileBox.hidden = files.length === 0;
    refs.fileCount.textContent = `${plural(files.length, "file")} selected`;
    refs.startBtn.disabled = files.length === 0 || running;
    refs.startBtn.textContent =
      files.length > 0 ? `Process ${plural(files.length, "resume")}` : "Process resumes";

    refs.fileList.replaceChildren(
      ...files.map((file) =>
        el(
          "li",
          { class: "file-row" },
          el("span", { class: "file-ext", text: file.name.split(".").pop().toUpperCase() }),
          el("span", { class: "file-name", text: file.name }),
          el("span", { class: "file-size", text: formatSize(file.size) }),
          el("button", {
            type: "button",
            class: "icon-btn",
            "aria-label": `Remove ${file.name}`,
            text: "×",
            onclick: () => removeFile(file),
          })
        )
      )
    );
  }

  refs.fileInput.addEventListener("change", () => {
    addFiles(refs.fileInput.files);
    refs.fileInput.value = ""; // lets the user pick the same file again later
  });

  refs.dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    refs.dropzone.classList.add("drag-active");
  });
  refs.dropzone.addEventListener("dragleave", () => refs.dropzone.classList.remove("drag-active"));
  refs.dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    refs.dropzone.classList.remove("drag-active");
    addFiles(event.dataTransfer.files);
  });

  refs.clearFiles.addEventListener("click", () => {
    files = [];
    hideAlert(refs.formError);
    renderFiles();
  });

  // ---------- Progress steps ----------
  const STEP_DEFS = [
    { key: "upload", title: "Upload resumes" },
    { key: "extract", title: "Extract candidate profiles" },
    { key: "match", title: "Match against the job" },
  ];
  const DOT_TEXT = { done: "✓", failed: "!", warn: "!", skipped: "–" };
  const stepNodes = {};

  function buildSteps() {
    refs.steps.replaceChildren(
      ...STEP_DEFS.map((def) => {
        const dot = el("span", { class: "step-dot" });
        const detail = el("div", { class: "step-detail" });
        const root = el(
          "li",
          { class: "step status-pending" },
          dot,
          el("div", {}, el("div", { class: "step-title", text: def.title }), detail)
        );
        stepNodes[def.key] = { root, dot, detail };
        return root;
      })
    );
  }

  // status: pending | active | done | warn | failed | skipped
  function setStep(key, status, detail) {
    const node = stepNodes[key];
    node.root.className = `step status-${status}`;
    node.dot.textContent = DOT_TEXT[status] || "";
    if (detail !== undefined) node.detail.textContent = detail;
  }

  // ---------- The pipeline ----------
  function showSummary(type, message, counts, fatal) {
    refs.summaryAlert.className = `alert alert-${type}`;
    refs.summaryAlert.textContent = message;
    byId("summary-panel").querySelector(".summary-stats").hidden = fatal;
    refs.viewLink.hidden = fatal;
    refs.sumUploaded.textContent = counts.uploaded;
    refs.sumExtracted.textContent = counts.extracted;
    refs.sumScored.textContent = counts.scored;
    refs.againBtn.textContent = fatal ? "Try again" : "Upload more resumes";
    refs.againBtn.dataset.keepFiles = fatal ? "yes" : "no";
    refs.summaryPanel.hidden = false;
    refs.summaryPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function startProcessing() {
    if (running || files.length === 0) return;

    running = true;
    hideAlert(refs.formError);
    buildSteps();
    refs.uploadPanel.hidden = true;
    refs.summaryPanel.hidden = true;
    refs.pipelinePanel.hidden = false;

    const total = files.length;
    const counts = { uploaded: 0, extracted: 0, scored: 0 };

    try {
      // ----- Step 1: upload -----
      setStep("upload", "active", `Uploading ${plural(total, "file")}...`);
      let uploaded;
      try {
        uploaded = await API.uploadResumes(jobId, files);
      } catch (error) {
        setStep("upload", "failed", error.message);
        setStep("extract", "skipped", "Skipped");
        setStep("match", "skipped", "Skipped");
        showSummary("error", `Upload failed. ${error.message}`, counts, true);
        return;
      }

      if (uploaded.length === 0) {
        const message =
          "No readable text was found in the selected files. Scanned PDFs (images of text) cannot be read. Try a text-based PDF or a DOCX.";
        setStep("upload", "failed", message);
        setStep("extract", "skipped", "Skipped");
        setStep("match", "skipped", "Skipped");
        showSummary("error", message, counts, true);
        return;
      }

      counts.uploaded = uploaded.length;
      const unreadable = total - uploaded.length;
      if (unreadable > 0) {
        setStep(
          "upload",
          "warn",
          `Uploaded ${uploaded.length} of ${total} files. ${plural(unreadable, "file")} could not be read and ${unreadable === 1 ? "was" : "were"} skipped.`
        );
      } else {
        setStep("upload", "done", `Uploaded ${plural(uploaded.length, "resume")}.`);
      }
      files = [];

      // ----- Step 2: extract profiles -----
      const ids = uploaded.map((candidate) => candidate.id);
      setStep("extract", "active", "Starting...");
      const extraction = await runInChunks("extract", jobId, ids, (p) =>
        setStep("extract", "active", `Reading resumes ${p.from}–${p.to} of ${p.total}...`)
      );
      counts.extracted = extraction.doneIds.length;

      if (extraction.doneIds.length === 0) {
        const reason = extraction.stopped ? extraction.stopped.message : "No profiles could be extracted.";
        setStep("extract", "failed", reason);
        setStep("match", "skipped", "Skipped because no profiles were extracted.");
        showSummary(
          "error",
          `Your resumes are saved, but none could be processed yet. ${reason} Open the candidates page later and use the Processing queue.`,
          counts,
          false
        );
        return;
      }

      const extractionComplete = !extraction.stopped && extraction.doneIds.length === ids.length;
      setStep(
        "extract",
        extractionComplete ? "done" : "warn",
        `Extracted ${extraction.doneIds.length} of ${ids.length} profiles.` +
          (extraction.stopped ? ` ${extraction.stopped.message}` : "")
      );

      // ----- Step 3: match and score -----
      setStep("match", "active", "Starting...");
      const matching = await runInChunks("match", jobId, extraction.doneIds, (p) =>
        setStep("match", "active", `Scoring candidates ${p.from}–${p.to} of ${p.total}...`)
      );
      counts.scored = matching.doneIds.length;

      if (matching.doneIds.length === 0) {
        setStep("match", "failed", matching.stopped ? matching.stopped.message : "No candidates could be scored.");
      } else {
        const matchComplete = !matching.stopped && matching.doneIds.length === extraction.doneIds.length;
        setStep(
          "match",
          matchComplete ? "done" : "warn",
          `Scored ${matching.doneIds.length} of ${extraction.doneIds.length} candidates.` +
            (matching.stopped ? ` ${matching.stopped.message}` : "")
        );
      }

      // ----- Summary -----
      if (counts.scored === counts.uploaded) {
        showSummary("success", `Done. All ${plural(counts.scored, "resume")} are ranked.`, counts, false);
      } else {
        showSummary(
          "warn",
          `${counts.scored} of ${counts.uploaded} resumes are ranked. The rest are saved. Open the candidates page and use the Processing queue to finish them.`,
          counts,
          false
        );
      }
    } catch (unexpected) {
      showSummary("error", `Something unexpected went wrong. ${unexpected.message}`, counts, false);
    } finally {
      running = false;
      renderFiles();
    }
  }

  refs.startBtn.addEventListener("click", startProcessing);

  refs.againBtn.addEventListener("click", () => {
    if (refs.againBtn.dataset.keepFiles !== "yes") files = [];
    refs.pipelinePanel.hidden = true;
    refs.summaryPanel.hidden = true;
    refs.uploadPanel.hidden = false;
    renderFiles();
  });

  renderFiles();
  loadJob();
})();
