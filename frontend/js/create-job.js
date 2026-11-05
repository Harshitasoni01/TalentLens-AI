// Create job page: collect the form, validate it, POST /jobs/, show a success screen.

(function () {
  renderSidebar("new");

  const form = byId("job-form");
  const errorBox = byId("form-error");
  const submitBtn = byId("submit-btn");

  // ---------- Tag input (skills) ----------
  // Type a skill and press Enter or comma: it becomes a removable chip.
  function createTagInput(root, placeholder) {
    const tags = [];
    root.classList.add("tag-input");

    const input = el("input", { type: "text", class: "tag-field", placeholder, "aria-label": placeholder, autocomplete: "off" });
    root.append(input);

    function render() {
      root.querySelectorAll(".tag").forEach((node) => node.remove());
      tags.forEach((tag, index) => {
        const chip = el(
          "span",
          { class: "tag" },
          tag,
          el("button", {
            type: "button",
            class: "tag-x",
            "aria-label": `Remove ${tag}`,
            text: "×",
            onclick: () => {
              tags.splice(index, 1);
              render();
            },
          })
        );
        root.insertBefore(chip, input);
      });
      input.placeholder = tags.length === 0 ? placeholder : "";
    }

    function add(value) {
      const tag = value.trim();
      if (!tag) return;
      if (!tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) tags.push(tag);
      render();
    }

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault(); // Enter must not submit the form
        add(input.value);
        input.value = "";
      } else if (event.key === "Backspace" && input.value === "" && tags.length > 0) {
        tags.pop();
        render();
      }
    });

    // Pasting "Python, Django, Docker" adds three chips.
    input.addEventListener("input", () => {
      if (input.value.includes(",")) {
        const parts = input.value.split(",");
        parts.slice(0, -1).forEach(add);
        input.value = parts[parts.length - 1];
      }
    });

    input.addEventListener("blur", () => {
      add(input.value);
      input.value = "";
    });

    root.addEventListener("click", () => input.focus());
    render();

    return { getTags: () => [...tags] };
  }

  const requiredSkills = createTagInput(byId("required-skills"), "Type a skill and press Enter, e.g. Python");
  const preferredSkills = createTagInput(byId("preferred-skills"), "Type a skill and press Enter, e.g. Docker");

  // ---------- Experience sliders ----------
  const expMin = byId("exp-min");
  const expMax = byId("exp-max");

  function syncExperience(changed) {
    // Min can never be higher than max: the other slider follows.
    if (Number(expMin.value) > Number(expMax.value)) {
      if (changed === "min") expMax.value = expMin.value;
      else expMin.value = expMax.value;
    }
    byId("exp-min-out").textContent = expMin.value;
    byId("exp-max-out").textContent = expMax.value;
  }
  expMin.addEventListener("input", () => syncExperience("min"));
  expMax.addEventListener("input", () => syncExperience("max"));

  // Deadline cannot be in the past.
  byId("deadline").min = new Date().toISOString().slice(0, 10);

  // ---------- Validation ----------
  function setInvalid(fieldNames) {
    form.querySelectorAll(".field.invalid").forEach((node) => node.classList.remove("invalid"));
    fieldNames.forEach((name) => {
      const node = form.querySelector(`[data-field="${name}"]`);
      if (node) node.classList.add("invalid");
    });
  }

  form.addEventListener("input", () => {
    setInvalid([]);
    hideAlert(errorBox);
  });

  function numberOrNull(value) {
    return value === "" ? null : Number(value);
  }

  function validate() {
    const missing = [];
    const invalid = [];

    if (!byId("title").value.trim()) { missing.push("Job title"); invalid.push("title"); }
    if (!byId("location").value.trim()) { missing.push("Location"); invalid.push("location"); }
    if (requiredSkills.getTags().length === 0) { missing.push("Required skills"); invalid.push("required_skills"); }

    if (missing.length > 0) {
      return { message: `Please fill in: ${missing.join(", ")}`, invalid };
    }

    const salaryMin = numberOrNull(byId("salary-min").value);
    const salaryMax = numberOrNull(byId("salary-max").value);
    if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) {
      return { message: "Minimum salary cannot be higher than maximum salary.", invalid: ["salary", "salary-max"] };
    }

    return null;
  }

  // ---------- Submit ----------
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideAlert(errorBox);

    const problem = validate();
    if (problem) {
      setInvalid(problem.invalid);
      showAlert(errorBox, "error", problem.message);
      errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    // Same field names and types as the JobCreate schema in the backend.
    const preferred = preferredSkills.getTags();
    const payload = {
      title: byId("title").value.trim(),
      location: byId("location").value.trim(),
      work_mode: byId("work_mode").value,
      employment_type: byId("employment_type").value,
      min_experience: Number(expMin.value),
      max_experience: Number(expMax.value),
      required_skills: requiredSkills.getTags().join(", "),
      preferred_skills: preferred.length > 0 ? preferred.join(", ") : null,
      education_requirement: byId("education").value || null,
      salary_min: numberOrNull(byId("salary-min").value),
      salary_max: numberOrNull(byId("salary-max").value),
      openings: numberOrNull(byId("openings").value),
      description: byId("description").value.trim() || null,
      application_deadline: byId("deadline").value || null,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "Creating job...";

    try {
      const job = await API.createJob(payload);
      byId("success-text").textContent = `"${job.title}" is ready. Upload resumes to start ranking candidates.`;
      byId("upload-link").href = `upload.html?job=${job.id}`;
      byId("form-view").hidden = true;
      byId("success-view").hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      showAlert(errorBox, "error", `Could not create the job. ${error.message}`);
      submitBtn.disabled = false;
      submitBtn.textContent = "Create job";
    }
  });
})();
