const api = (path, options = {}) => {
  const isFormData = options.body instanceof FormData;
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (isFormData) delete headers["Content-Type"];

  return fetch(path, { headers, ...options }).then(async (response) => {
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("json") ? await response.json() : await response.text();
    if (!response.ok) throw new Error(payload?.data?.message || payload?.message || "Request failed");
    return payload.data ?? payload;
  });
};

const state = {
  route: "dashboard",
  dashboard: null,
  podcast: null,
  selectedProjectId: "",
  lastOutput: null
};

const primaryNav = [
  ["dashboard", "layout", "Dashboard"],
  ["script", "edit", "AI Script Writer"],
  ["subtitles", "captions", "Subtitles & Captions"],
  ["podcast", "mic", "Podcast Manager"],
  ["thumbnail", "image", "Thumbnail Generator"],
  ["storyboard", "grid", "Storyboard Builder"]
];

const routeTitles = {
  ...Object.fromEntries(primaryNav.map(([route, , label]) => [route, label])),
  projects: "My Projects",
  media: "Media Library",
  templates: "Templates",
  settings: "Settings"
};

const view = document.querySelector("#view");
const nav = document.querySelector("#nav");
const title = document.querySelector("#pageTitle");
const toast = document.querySelector("#toast");

function notify(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2800);
}

window.addEventListener("unhandledrejection", (event) => {
  notify(event.reason?.message || "Something went wrong.");
});

function html(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}

function downloadText(filename, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function slug(value) {
  return String(value || "creator-suite")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "creator-suite";
}

function srtFromSegments(segments) {
  return (segments || []).map((segment, index) => {
    const start = String(segment.start || `00:00:${String(index * 4).padStart(2, "0")},000`).replace(".", ",");
    const end = String(segment.end || `00:00:${String(index * 4 + 3).padStart(2, "0")},000`).replace(".", ",");
    return `${index + 1}\n${start} --> ${end}\n${segment.text || ""}`;
  }).join("\n\n");
}

function secondsFromSubtitleTime(value) {
  const parts = String(value || "0").replace(",", ".").split(":").map(Number);
  if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  if (parts.length === 2) return (parts[0] * 60) + parts[1];
  return Number(value) || 0;
}

function mediaTypeFromFile(file) {
  const type = file?.type || "";
  if (type) return type;
  const name = String(file?.name || "").toLowerCase();
  if (/\.(mp4|m4v)$/i.test(name)) return "video/mp4";
  if (/\.mov$/i.test(name)) return "video/quicktime";
  if (/\.webm$/i.test(name)) return "video/webm";
  if (/\.ogg$/i.test(name)) return "video/ogg";
  if (/\.wav$/i.test(name)) return "audio/wav";
  if (/\.(mp3|mpeg|mpga)$/i.test(name)) return "audio/mpeg";
  if (/\.m4a$/i.test(name)) return "audio/mp4";
  if (/\.flac$/i.test(name)) return "audio/flac";
  if (/\.opus$/i.test(name)) return "audio/ogg";
  return "";
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function durationFromFile(file) {
  return new Promise((resolve) => {
    if (!file) return resolve("00:00");
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(formatDuration(audio.duration));
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve("00:00");
    };
    audio.src = url;
  });
}

function syncEditedSubtitleSegments() {
  if (!state.lastOutput?.segments) return;
  document.querySelectorAll("[data-segment-index]").forEach((textarea) => {
    const index = Number(textarea.dataset.segmentIndex);
    if (state.lastOutput.segments[index]) {
      state.lastOutput.segments[index].text = textarea.value;
    }
  });
}

function initSubtitlePlayback() {
  const media = document.querySelector("[data-subtitle-media]");
  const overlay = document.querySelector("[data-live-caption]");
  const liveTranscript = document.querySelector("[data-live-transcript]");
  const playButton = document.querySelector("[data-preview-play]");
  if (!media || !overlay || !state.lastOutput?.segments?.length) return;

  let activeIndex = -1;
  const update = () => {
    syncEditedSubtitleSegments();
    const currentTime = media.currentTime || 0;
    const segments = state.lastOutput.segments;
    const nextIndex = segments.findIndex((segment, index) => {
      const start = secondsFromSubtitleTime(segment.start);
      const fallbackEnd = index < segments.length - 1 ? secondsFromSubtitleTime(segments[index + 1].start) : start + 4;
      const end = secondsFromSubtitleTime(segment.end) || fallbackEnd;
      return currentTime >= start && currentTime <= end;
    });
    const resolvedIndex = nextIndex >= 0 ? nextIndex : activeIndex >= 0 ? activeIndex : 0;
    if (resolvedIndex === activeIndex) return;

    activeIndex = resolvedIndex;
    overlay.textContent = segments[activeIndex]?.text || "";
    if (liveTranscript) {
      liveTranscript.textContent = segments.slice(0, activeIndex + 1).map((segment) => segment.text).join(" ");
    }
    document.querySelectorAll(".caption-row").forEach((row, index) => {
      row.classList.toggle("active", index === activeIndex);
    });
    document.querySelector(`.caption-row[data-caption-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  media.addEventListener("timeupdate", update);
  media.addEventListener("play", update);
  media.addEventListener("playing", () => {
    if (playButton) playButton.hidden = true;
    update();
  });
  media.addEventListener("pause", () => {
    if (playButton && !media.ended) playButton.hidden = false;
  });
  media.addEventListener("seeked", update);
  media.addEventListener("loadedmetadata", () => {
    media.play?.().catch(() => notify("Click play to start preview."));
    update();
  });
  media.addEventListener("error", () => {
    const message = document.querySelector("[data-media-error]");
    if (message) message.hidden = false;
  });
  update();
  media.play?.().catch(() => notify("Click play to start preview."));
}

function currentThumbnailPayload() {
  const titleInput = document.querySelector('input[name="title"]');
  const subtitleInput = document.querySelector('input[name="subtitle"]');
  const title = titleInput?.value || state.lastOutput?.title || "thumbnail";
  const subtitle = subtitleInput?.value || state.lastOutput?.subtitle || "";
  const headline = state.lastOutput?.selectedHeadline || state.lastOutput?.headlines?.[0] || title;
  return {
    title,
    subtitle,
    headline,
    lines: thumbnailLines(headline),
    imageUrl: state.lastOutput?.imageUrl || ""
  };
}

function thumbnailSvg(payload) {
  const [first = "AI WILL", second = "CHANGE", third = "EVERYTHING"] = payload.lines;
  const image = payload.imageUrl ? `<image href="${payload.imageUrl}" x="0" y="0" width="1280" height="720" preserveAspectRatio="xMidYMid slice"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bg" x1="0" x2="1"><stop stop-color="#07111f"/><stop offset=".58" stop-color="#091525"/><stop offset="1" stop-color="#31445e"/></linearGradient>
    <radialGradient id="head" cx=".35" cy=".25" r=".8"><stop stop-color="#f7fbff"/><stop offset=".55" stop-color="#b8cce3"/><stop offset="1" stop-color="#6c7d92"/></radialGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  ${image || '<circle cx="990" cy="260" r="170" fill="url(#head)"/>'}
  <rect width="1280" height="720" fill="#000000" opacity=".34"/>
  <rect x="112" y="122" width="42" height="476" rx="12" fill="#050a12" opacity=".88"/>
  <text x="226" y="238" fill="#fff" font-family="Impact, Arial Black, sans-serif" font-size="112" font-weight="900">${html(first)}</text>
  <rect x="216" y="282" width="455" height="118" rx="4" fill="#ffd319"/>
  <text x="238" y="380" fill="#050505" font-family="Impact, Arial Black, sans-serif" font-size="112" font-weight="900">${html(second)}</text>
  <text x="226" y="530" fill="#fff" font-family="Impact, Arial Black, sans-serif" font-size="112" font-weight="900">${html(third)}</text>
  <text x="226" y="604" fill="#ffffff" font-family="Inter, Arial, sans-serif" font-size="42" font-weight="800">${html(payload.subtitle)}</text>
</svg>`;
}

function storyboardText(result = state.lastOutput || { title: "Storyboard", scenes: [] }) {
  const scenes = result.scenes || [];
  return `${result.title || "Storyboard"}\n\n${scenes.map((scene, index) => {
    return `${index + 1}. ${scene.title || scene.label || `Scene ${index + 1}`}\nVisual: ${scene.visualDescription || scene.onScreenText || ""}\nVO: ${scene.voiceOver || ""}`;
  }).join("\n\n")}`;
}

function exportPlainText(script = {}) {
  const scenes = script.scenes || [];
  const lines = [
    script.title || "Generated Script",
    "",
    "Hook",
    script.hook || "",
    "",
    ...scenes.flatMap((scene, index) => [
      scene.label || `Scene ${scene.number || index + 1}`,
      scene.voiceOver || scene.onScreenText || "",
      ""
    ]),
    "Outro",
    script.cta || script.outro || ""
  ];
  return lines.join("\n").trim();
}

function cleanThumbnailTitle(title) {
  return String(title || "")
    .replace(/\bbecame\b/gi, "become")
    .replace(/\bi want to\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleWords(title) {
  return cleanThumbnailTitle(title)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function thumbnailLines(headline) {
  const words = titleWords(headline);
  if (!words.length) return [];
  if (words.length <= 3) return words;

  const joined = words.join(" ");
  if (joined.includes("GOOD DEVELOPER")) return ["BECOME A", "GOOD", "DEVELOPER"];
  if (joined.includes("DEVELOPER")) {
    const developerIndex = words.lastIndexOf("DEVELOPER");
    const before = words.slice(Math.max(0, developerIndex - 2), developerIndex).join(" ") || "BECOME A";
    return [before, "BETTER", "DEVELOPER"];
  }

  const last = words.slice(-1).join(" ");
  const middle = words.slice(Math.max(1, words.length - 3), -1).join(" ");
  const first = words.slice(0, Math.max(1, words.length - 3)).join(" ");
  return [first, middle, last].filter(Boolean).slice(0, 3);
}

function thumbnailSuggestionsFromTitle(title, apiHeadlines = []) {
  return (apiHeadlines || [])
    .map(cleanThumbnailTitle)
    .filter(Boolean)
    .filter((item, index, array) => array.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index)
    .slice(0, 3);
}

function renderThumbnailSuggestions(suggestions) {
  return suggestions.map((suggestion, index) => `
    <button class="suggestion" data-thumbnail-headline="${html(suggestion)}" type="button">
      <span>${index + 1}.</span><span>${html(suggestion)}</span>
    </button>
  `).join("");
}

function updateThumbnailFromTitle() {
  const titleInput = document.querySelector('input[name="title"]');
  if (!titleInput || state.route !== "thumbnail") return;
  state.lastOutput = {
    title: titleInput.value,
    subtitle: document.querySelector('input[name="subtitle"]')?.value || "",
    headlines: [],
    selectedHeadline: "",
    theme: "generated",
    imageUrl: ""
  };
  const suggestionsBox = document.querySelector("#thumbnailSuggestions");
  if (suggestionsBox) suggestionsBox.innerHTML = '<p class="muted inline-empty">Suggestions will appear after API generation.</p>';
  const output = document.querySelector("#toolOutput");
  if (output) output.innerHTML = renderThumbnailEmptyState();
}

function icon(name) {
  const icons = {
    layout: `<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect>`,
    edit: `<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>`,
    captions: `<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M8 10h3M8 14h2M13 14h3M14 10h2"></path>`,
    mic: `<path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><path d="M12 18v4"></path>`,
    image: `<rect x="3" y="5" width="18" height="14" rx="2"></rect><circle cx="9" cy="10" r="2"></circle><path d="M21 16l-5-5L5 22"></path>`,
    grid: `<rect x="3" y="3" width="8" height="8"></rect><rect x="13" y="3" width="8" height="8"></rect><rect x="3" y="13" width="8" height="8"></rect><rect x="13" y="13" width="8" height="8"></rect>`,
    folder: `<path d="M3 7h7l2 2h9v10H3z"></path>`,
    "play-square": `<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M10 9l5 3-5 3z"></path>`,
    layers: `<path d="M12 2l9 5-9 5-9-5 9-5z"></path><path d="M3 12l9 5 9-5"></path><path d="M3 17l9 5 9-5"></path>`,
    settings: `<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9V9c.2.6.8 1 1.6 1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z"></path>`,
    file: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M9 13h6M9 17h6"></path>`,
    plus: `<path d="M12 5v14M5 12h14"></path>`,
    download: `<path d="M12 3v12"></path><path d="M7 10l5 5 5-5"></path><path d="M5 21h14"></path>`,
    copy: `<rect x="9" y="9" width="12" height="12" rx="2"></rect><rect x="3" y="3" width="12" height="12" rx="2"></rect>`,
    sparkle: `<path d="M12 2l1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2z"></path><path d="M19 15l.8 3.2L23 19l-3.2.8L19 23l-.8-3.2L15 19l3.2-.8L19 15z"></path>`,
    upload: `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="M17 8l-5-5-5 5"></path><path d="M12 3v12"></path>`,
    search: `<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path>`,
    refresh: `<path d="M21 12a9 9 0 0 1-15.5 6.2"></path><path d="M3 12A9 9 0 0 1 18.5 5.8"></path><path d="M18 2v5h-5"></path><path d="M6 22v-5h5"></path>`,
    save: `<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><path d="M17 21v-8H7v8"></path><path d="M7 3v5h8"></path>`
  };
  return `<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.layout}</svg>`;
}

function setRoute(route) {
  state.route = route;
  window.location.hash = route;
  document.querySelectorAll(".nav button").forEach((button) => {
    button.classList.toggle("active", button.dataset.route === route);
  });
  title.textContent = routeTitles[route] || "Dashboard";
  const newProjectBtn = document.querySelector("#newProjectBtn");
  if (newProjectBtn) newProjectBtn.style.display = route === "dashboard" ? "inline-flex" : "none";
  render();
}

function initNav() {
  const group = (items) => `<div class="nav-group">${items.map(([route, iconName, label]) => `
    <button class="${route === state.route ? "active" : ""}" data-route="${route}" type="button">
      <span class="icon">${icon(iconName)}</span><span>${html(label)}</span>
    </button>
  `).join("")}</div>`;

  nav.innerHTML = group(primaryNav);
  nav.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-route]");
    if (button) setRoute(button.dataset.route);
  });
}

async function refresh() {
  state.dashboard = await api("/api/dashboard");
}

function pageHead(titleText, subtitle, action = "") {
  return `
    <div class="page-head">
      <div class="page-title">
        <h1>${html(titleText)}</h1>
        <p>${html(subtitle)}</p>
      </div>
      ${action}
    </div>
  `;
}

function statCard(label, value, iconName, tone) {
  return `
    <article class="card">
      <div><p>${html(label)}</p><strong>${html(value)}</strong></div>
      <span class="stat-icon ${tone}">${icon(iconName)}</span>
    </article>
  `;
}

function badge(text, tone = "") {
  return `<span class="badge ${tone}">${html(text)}</span>`;
}

function iconForModule(module) {
  return {
    script: "file",
    subtitle: "captions",
    subtitles: "captions",
    podcast: "mic",
    thumbnail: "image",
    storyboard: "grid",
    video: "play-square"
  }[module] || "file";
}

function quickButton(route, iconName, label) {
  return `<button data-jump="${route}" type="button"><span>${icon(iconName)}</span>${html(label)}</button>`;
}

function renderDashboard() {
  const data = state.dashboard;
  const recent = data.recentProjects || [];
  view.innerHTML = `
    ${pageHead("Dashboard", "Welcome back! Here's what's happening with your projects.")}
    <section class="grid stats">
      ${statCard("Total Projects", data.stats?.totalProjects ?? 0, "folder", "purple")}
      ${statCard("Videos Processed", data.stats?.videosProcessed ?? 0, "play-square", "orange")}
      ${statCard("Podcast Episodes", data.stats?.podcastEpisodes ?? 0, "mic", "blue")}
      ${statCard("Storage Used", data.stats?.storageUsed ?? "0 MB", "layers", "purple")}
    </section>
    <section class="grid columns">
      <div class="panel">
        <h2>Recent Projects</h2>
        <div class="list recent-list">
          ${recent.map((project) => `
            <article class="row project-row" data-project-id="${html(project.id)}">
              <span class="row-icon">${icon(iconForModule(project.module))}</span>
              <strong>${html(project.title)}</strong>
              ${badge(moduleName(project.module), toneForModule(project.module))}
              <span class="muted">${html(new Date(project.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }))}</span>
            </article>
          `).join("") || '<p class="muted">No projects yet. Create or generate your first item.</p>'}
        </div>
        <div style="text-align:center; margin-top:28px;">
          <button class="ghost" data-jump="projects" type="button">View All Projects</button>
        </div>
      </div>
      <div class="panel">
        <h2>Quick Actions</h2>
        <div class="quick-actions">
          ${quickButton("script", "edit", "Create New Script")}
          ${quickButton("subtitles", "captions", "Generate Subtitles")}
          ${quickButton("podcast", "mic", "Upload Podcast Episode")}
          ${quickButton("thumbnail", "image", "Design Thumbnail")}
          ${quickButton("storyboard", "grid", "Build Storyboard")}
        </div>
      </div>
    </section>
  `;
}

function renderToolForm(kind) {
  const config = toolConfig(kind);
  view.innerHTML = config.initial();
  const form = document.querySelector("#toolForm");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    const fileInput = form.querySelector('input[type="file"]');
    const hasFile = fileInput && fileInput.files.length > 0;
    const body = hasFile ? new FormData(form) : JSON.stringify(Object.fromEntries(new FormData(form).entries()));
    submitBtn.textContent = "Processing...";
    submitBtn.disabled = true;

    try {
      if (kind === "subtitles" && !hasFile) {
        notify("Please upload a video or audio file first.");
        return;
      }
      if (kind === "thumbnail" && !form.querySelector('input[name="title"]')?.value.trim()) {
        notify("Please enter a video title first.");
        return;
      }
      if (kind === "storyboard" && !form.querySelector('input[name="title"]')?.value.trim()) {
        notify("Please enter a campaign or video idea first.");
        return;
      }

      const result = await api(config.endpoint, { method: "POST", body });
      if (hasFile) {
        result.localVideoUrl = result.mediaUrl || URL.createObjectURL(fileInput.files[0]);
        result.localFileName = fileInput.files[0].name;
        result.localMimeType = result.mediaType || mediaTypeFromFile(fileInput.files[0]);
      }
      if (kind === "thumbnail") {
        const sourceTitle = form.querySelector('input[name="title"]')?.value || result.title;
        const sourceSubtitle = form.querySelector('input[name="subtitle"]')?.value || result.subtitle;
        result.title = sourceTitle;
        result.subtitle = sourceSubtitle;
        result.headlines = thumbnailSuggestionsFromTitle(sourceTitle, result.headlines || []);
        result.selectedHeadline = result.headlines[0] || result.headline || sourceTitle;
        result.theme = "generated";
      }
      state.lastOutput = result;
      const output = document.querySelector("#toolOutput");
      if (output) output.innerHTML = config.render(result);
      if (kind === "thumbnail") {
        const suggestionsBox = document.querySelector("#thumbnailSuggestions");
        if (suggestionsBox) suggestionsBox.innerHTML = renderThumbnailSuggestions(result.headlines);
      }
      if (kind === "subtitles") {
        window.setTimeout(initSubtitlePlayback, 0);
      }
      await refresh();
      notify("Generated and saved.");
    } catch (error) {
      if (kind === "thumbnail") {
        const output = document.querySelector("#toolOutput");
        if (output) output.innerHTML = renderThumbnailError(error.message);
      }
      notify(error.message);
    } finally {
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }
  });

  if (kind === "thumbnail") {
    const titleInput = form.querySelector('input[name="title"]');
    titleInput?.addEventListener("input", () => updateThumbnailFromTitle());
    const subtitleInput = form.querySelector('input[name="subtitle"]');
    subtitleInput?.addEventListener("input", () => {
      state.lastOutput = {
        title: titleInput?.value || "",
        subtitle: subtitleInput.value
      };
      const output = document.querySelector("#toolOutput");
      if (output) output.innerHTML = renderThumbnailEmptyState();
    });
  }

  if (kind === "subtitles") {
    const fileInput = form.querySelector('input[type="file"]');
    fileInput?.addEventListener("change", () => {
      const name = fileInput.files?.[0]?.name || "No file selected";
      const fileName = document.querySelector("#selectedFileName");
      if (fileName) fileName.textContent = name;
    });
  }
}

function toolConfig(kind) {
  const configs = {
    script: {
      endpoint: "/api/scripts/generate",
      initial: renderScriptScreen,
      render: renderScriptOutput
    },
    subtitles: {
      endpoint: "/api/transcriptions/upload",
      initial: renderSubtitleScreen,
      render: renderSubtitleOutput
    },
    thumbnail: {
      endpoint: "/api/thumbnails/generate",
      initial: renderThumbnailScreen,
      render: renderThumbnailOutput
    },
    storyboard: {
      endpoint: "/api/storyboards/generate",
      initial: renderStoryboardScreen,
      render: renderStoryboardOutput
    }
  };
  return configs[kind];
}

function input(name, label, value, type = "text") {
  return `<label>${html(label)}<input name="${html(name)}" type="${type}" value="${html(value)}"></label>`;
}

function select(name, label, options, withYouTube = false, selectedValue = "") {
  return `<label>${html(label)}<span class="${withYouTube ? "input-with-icon" : ""}">${withYouTube ? '<span class="platform-youtube"></span>' : ""}<select name="${html(name)}">${options.map((option) => `<option${String(option) === String(selectedValue) ? " selected" : ""}>${html(option)}</option>`).join("")}</select></span></label>`;
}

function textarea(name, label, value) {
  return `<label>${html(label)}<textarea name="${html(name)}">${html(value)}</textarea></label>`;
}

function exportButton(type, payload, label = "") {
  return `<button type="button" data-export="${encodeURIComponent(JSON.stringify({ type, payload }))}">${html(label || `Export ${type.toUpperCase()}`)}</button>`;
}

function saveButton(payload, module, titleText) {
  return `<button class="ghost" type="button" data-save="${encodeURIComponent(JSON.stringify({ module, title: titleText, content: payload }))}">${icon("save")} Save</button>`;
}

function panelTools() {
  return `<div class="panel-tools">
    <button class="ghost" type="button" aria-label="Refresh">${icon("refresh")}</button>
    <button class="ghost" type="button" aria-label="Copy">${icon("copy")}</button>
    <button class="ghost" type="button" aria-label="Edit">${icon("edit")}</button>
    <button class="ghost" type="button" aria-label="Download">${icon("download")}</button>
  </div>`;
}

function renderScriptScreen() {
  return `
    ${pageHead("AI Script Writer", "Generate engaging scripts for YouTube videos, Reels and more using AI.")}
    <section class="workspace">
      <form id="toolForm">
        ${input("topic", "What is your video about?", "")}
        ${select("platform", "Platform", ["YouTube", "Instagram Reels", "YouTube Shorts", "Product Ads"], true)}
        ${select("tone", "Tone", ["Informative", "Bold", "Friendly", "Cinematic"])}
        ${select("language", "Language", ["English", "Hindi", "Spanish"])}
        <input name="duration" type="hidden" value="45">
        <input name="audience" type="hidden" value="Content creators">
        <input name="keywords" type="hidden" value="AI productivity, creator workflow">
        <input name="cta" type="hidden" value="Start creating smarter today">
        <button class="primary-wide" type="submit">Generate Script</button>
      </form>
      <section class="panel output script-output" id="toolOutput">
        <div class="panel-header"><h2>Generated Script</h2>${panelTools()}</div>
        <p class="muted">Your generated script will appear here.</p>
      </section>
    </section>
  `;
}

function renderScriptOutput(script) {
  const scenes = script.scenes || [];
  return `
    <h2>${html(script.title || "5 Ways AI Can Save Your Time")}</h2>
    <div class="script-part">
      <h3>Hook</h3>
      ${String(script.hook || "").split("\n").map((line) => `<p>${html(line)}</p>`).join("")}
    </div>
    ${scenes.map((scene, index) => `
      <div class="script-part">
        <h3>${html(scene.label || `Scene ${scene.number || index + 1}`)}</h3>
        <p>${html(scene.voiceOver || scene.onScreenText || "")}</p>
      </div>
    `).join("")}
    <div class="script-part">
      <h3>Outro</h3>
      ${String(script.cta || script.outro || "").split("\n").map((line) => `<p>${html(line)}</p>`).join("")}
    </div>
    <div class="button-row">
      ${saveButton(script, "script", script.title || "Generated Script")}
      ${exportButton("pdf", script, "Download PDF")}
      ${exportButton("docx", script, "Download DOCX")}
    </div>
  `;
}

function renderSubtitleScreen() {
  return `
    ${pageHead("Subtitles & Captions", "Automatically generate accurate subtitles and captions for your videos and podcasts.")}
    <section class="workspace wide-left">
      <form id="toolForm">
        <label class="upload-box">
          <input name="file" type="file" accept="video/*,audio/*">
          <span>
            <span class="upload-cloud">${icon("upload")}</span>
            <strong>Upload Video or Audio</strong>
            <p>Drag and drop or click to upload</p>
            <p>MP4, MOV, MP3, WAV up to 100MB</p>
            <p id="selectedFileName" class="selected-file">No file selected</p>
          </span>
        </label>
        ${select("language", "Language in Audio", ["Auto Detect", "English", "Hindi", "Spanish"])}
        ${select("format", "Output Format", ["SRT", "VTT", "TXT"])}
        ${select("style", "Caption Style (Optional)", ["Default (White on Black)", "Bold Yellow", "Karaoke"])}
        <div class="subtitle-actions">
          <button type="submit">Generate Subtitles</button>
          <button class="ghost" data-download-srt type="button">${icon("download")} Download SRT</button>
        </div>
      </form>
      <section class="panel preview-panel" id="toolOutput">
        <h2>Preview</h2>
        <p class="muted">Upload a video or audio file, then generate subtitles.</p>
      </section>
    </section>
  `;
}

function renderSubtitleOutput(result) {
  const segments = result.segments || [];
  const fileName = String(result.localFileName || result.title || "").toLowerCase();
  const mimeType = String(result.localMimeType || "");
  const hasLocalMedia = Boolean(result.localVideoUrl);
  const isAudio = hasLocalMedia && (mimeType.startsWith("audio/") || /\.(mp3|wav|m4a|mpeg|mpga|flac|opus)$/i.test(fileName));
  const isVideo = hasLocalMedia && !isAudio;
  return `
    ${isVideo ? `
      <div class="video-preview actual-media">
        <video src="${html(result.localVideoUrl)}" data-subtitle-media controls autoplay muted loop playsinline preload="auto"></video>
        <button class="preview-play" data-preview-play type="button">Play Preview</button>
        <p class="media-error" data-media-error hidden>This video codec cannot preview in Chrome. Try MP4/H.264 or WebM.</p>
        <div class="subtitle-overlay" data-live-caption>${html(segments[0]?.text || "")}</div>
      </div>
    ` : isAudio ? `
      <div class="video-preview audio-media">
        <div class="audio-icon">${icon("mic")}</div>
        <div class="subtitle-overlay audio-caption" data-live-caption>${html(segments[0]?.text || "")}</div>
        <audio src="${html(result.localVideoUrl)}" data-subtitle-media controls autoplay loop></audio>
      </div>
    ` : `
      <div class="video-preview">
        <div class="subtitle-overlay" data-live-caption>${html(segments[0]?.text || "")}</div>
      </div>
    `}
    <section class="live-transcript-box">
      <h3>Live Transcript</h3>
      <p data-live-transcript>${html(segments[0]?.text || "")}</p>
    </section>
    <div class="caption-list">
      ${segments.map((segment, index) => `
        <article class="caption-row" data-caption-index="${index}">
          <div class="caption-times">
            <span class="timestamp">${html(segment.start || `00:00:${String(index * 4).padStart(2, "0")},000`)}</span>
            <span class="timestamp end-time">${html(segment.end || `00:00:${String(index * 4 + 3).padStart(2, "0")},000`)}</span>
          </div>
          <textarea class="caption-text" data-segment-index="${index}">${html(segment.text)}</textarea>
        </article>
      `).join("") || '<p class="muted caption-empty">No subtitle segments generated.</p>'}
    </div>
  `;
}

function renderThumbnailScreen() {
  state.lastOutput = { title: "", subtitle: "", headlines: [], selectedHeadline: "", theme: "generated", imageUrl: "" };
  return `
    ${pageHead("Thumbnail Generator", "Create stunning thumbnails with AI text suggestions and custom designs.")}
    <section class="thumbnail-layout">
      <form id="toolForm">
        ${input("title", "Enter your video title", "")}
        ${input("subtitle", "Subtitle on thumbnail", "")}
        ${select("emotion", "Style", ["Bold", "Urgent", "Curious", "Clean"])}
        <input name="audience" type="hidden" value="Creators">
        <input name="aspectRatio" type="hidden" value="16:9">
        <input name="accent" type="hidden" value="#7c35f2">
        <label>Text Suggestion (AI)
          <div class="suggestions" id="thumbnailSuggestions">
            <p class="muted inline-empty">Suggestions will appear after API generation.</p>
          </div>
        </label>
        <button class="primary-wide" type="submit">Generate Thumbnail</button>
      </form>
      <section class="panel preview-tools" id="toolOutput">
        ${renderThumbnailEmptyState()}
      </section>
    </section>
  `;
}

function renderThumbnailEmptyState() {
  return `
    <h2 style="margin:0 0 18px 20px;">Design Preview</h2>
    <div class="thumbnail-empty">
      <span>${icon("image")}</span>
      <p>Enter a title and generate with API.</p>
    </div>
  `;
}

function renderThumbnailError(message) {
  return `
    <h2 style="margin:0 0 18px 20px;">Design Preview</h2>
    <div class="thumbnail-empty error-state">
      <span>${icon("image")}</span>
      <p>${html(message || "Image API generation failed.")}</p>
    </div>
  `;
}

function renderThumbnailOutput(result = {}) {
  const headline = result.selectedHeadline || (result.headlines && result.headlines[0]) || result.headline || result.title || "";
  const lines = thumbnailLines(headline);
  const theme = "generated";
  const subtitle = result.subtitle || "";
  if (!result.imageUrl) return renderThumbnailEmptyState();
  const imageStyle = ` style="background-image: linear-gradient(90deg, rgba(0,0,0,.76), rgba(0,0,0,.08) 62%), url('${html(result.imageUrl)}');"`;
  return `
    <h2 style="margin:0 0 18px 20px;">Design Preview</h2>
    <div class="toolbar">
      ${["T", "", "", "", "", "", "", ""].map((label, index) => `<button class="${index === 0 ? "active" : ""}" type="button">${label || icon(["image", "grid", "layers", "sparkle", "settings", "refresh", "save"][index - 1] || "image")}</button>`).join("")}
    </div>
    <div class="thumb-canvas theme-${html(theme)}"${imageStyle}>
      <div class="thumb-side-tools">
        <button type="button">+</button>
        <button type="button">${icon("copy")}</button>
        <button type="button">T</button>
        <button type="button">${icon("image")}</button>
        <button type="button">x</button>
      </div>
      <div class="thumb-text">${lines.slice(0, 3).map((line) => `<span>${html(line)}</span>`).join("")}</div>
      ${subtitle ? `<div class="thumb-caption">${html(subtitle)}</div>` : ""}
    </div>
    <div class="zoom-controls">
      <button class="ghost" type="button">-</button>
      <span>100%</span>
      <button class="ghost" type="button">+</button>
    </div>
    <div class="thumb-export-row">
      <button data-download-thumbnail type="button">${icon("download")} Download</button>
      <button class="ghost" data-save-thumbnail type="button">${icon("save")} Save</button>
    </div>
  `;
}

function renderStoryboardScreen() {
  return `
    ${pageHead("Storyboard Builder", "Plan your video ad with AI generated storyboards and visual references.")}
    <section class="workspace wide-left">
      <form id="toolForm">
        ${input("title", "Campaign / Video Idea", "")}
        <input name="brief" type="hidden" value="">
        <input name="product" type="hidden" value="">
        ${select("goal", "Video Type", ["Video Ad", "Product launch", "Explainer"])}
        ${select("duration", "Duration (seconds)", ["30", "45", "60"])}
        <input name="scenes" type="hidden" value="5">
        <input name="cta" type="hidden" value="">
        <button class="primary-wide" type="submit">Generate Storyboard</button>
      </form>
      <section class="panel storyboard-panel" id="toolOutput">
        <h2>Storyboard</h2>
        <p class="muted">Generated storyboard scenes will appear here.</p>
      </section>
    </section>
  `;
}

function renderStoryboardOutput(result) {
  const scenes = result.scenes || [];
  return `
    <h2>${html(result.title || `Storyboard (${scenes.length} Scenes)`)}</h2>
    ${result.concept ? `<p class="story-concept">${html(result.concept)}</p>` : ""}
    <div class="story-list">
      ${scenes.map((scene, index) => `
        <article class="story-row">
          <span>${index + 1}</span>
          <div>
            <strong>${html(scene.title || scene.label || `Scene ${index + 1}`)}</strong>
            <p>${html(scene.visualDescription || scene.onScreenText || "")}</p>
            <p>${scene.voiceOver ? `VO: ${html(scene.voiceOver)}` : ""}</p>
            ${scene.onScreenText ? `<p>Text: ${html(scene.onScreenText)}</p>` : ""}
          </div>
          <div class="story-image">${scene.imageUrl || scene.thumbUrl ? `<img src="${html(scene.thumbUrl || scene.imageUrl)}" alt="${html(scene.visualDescription || scene.title || `Scene ${index + 1}`)}">` : ""}</div>
        </article>
      `).join("")}
    </div>
    <div class="button-row" style="margin:24px 14px 0;">
      <button data-download-storyboard type="button">${icon("download")} Download</button>
      <button class="ghost" data-save-storyboard type="button">${icon("save")} Save</button>
    </div>
  `;
}

function renderPodcast() {
  view.innerHTML = `${pageHead("Podcast Manager", "Manage your podcast episodes, show notes and publish to RSS feed.", '<button data-create-episode type="button">Upload New Episode</button>')}<p class="muted">Loading podcast...</p>`;
  api("/api/podcasts").then((podcast) => {
    state.podcast = podcast;
    if (!podcast.title) {
      view.innerHTML = `
        ${pageHead("Podcast Manager", "Manage podcast episodes, generate show notes and publish your RSS feed.")}
        ${renderPodcastSetup(podcast)}
      `;
      return;
    }
    view.innerHTML = `
      ${pageHead("Podcast Manager", "Manage podcast episodes, generate show notes and publish your RSS feed.", '<button data-create-episode type="button">Upload New Episode</button>')}
      <div class="tabs">
        ${["overview", "episodes", "details", "rss", "public", "settings"].map((tab, index) => `<button class="${index === 0 ? "active" : ""}" data-podcast-tab="${tab}" type="button">${html({ overview: "Overview", episodes: "Episodes", details: "Podcast Details", rss: "RSS Feed", public: "Public Page", settings: "Settings" }[tab])}</button>`).join("")}
      </div>
      <div id="podcastBody">${renderPodcastTab(podcast, "overview")}</div>
    `;
  }).catch((error) => notify(error.message));
}

function podcastEpisodes(podcast) {
  return podcast.episodes || [];
}

function renderPodcastSetup(podcast = {}) {
  return `
    <section class="panel podcast-form-panel">
      <h2>Create Your Podcast</h2>
      <p class="muted">Set up your podcast details before uploading your first episode.</p>
      <form id="podcastSetupForm" class="podcast-grid-form">
        ${input("title", "Podcast Title", podcast.title || "")}
        ${input("subtitle", "Podcast Subtitle", podcast.subtitle || "")}
        ${textarea("description", "Podcast Description", podcast.description || "")}
        ${input("author", "Author Name", podcast.author || "")}
        ${input("ownerName", "Owner Name", podcast.ownerName || podcast.author || "")}
        ${input("ownerEmail", "Owner Email", podcast.ownerEmail || "", "email")}
        ${input("language", "Primary Language", podcast.language || "en")}
        ${input("primaryCategory", "Category", podcast.primaryCategory || podcast.category || "")}
        ${input("secondaryCategory", "Secondary Category", podcast.secondaryCategory || "")}
        ${input("country", "Country", podcast.country || "IN")}
        ${input("coverImageUrl", "Podcast Cover Image URL", podcast.coverImageUrl || podcast.coverUrl || "")}
        ${input("brandColor", "Brand Colour", podcast.brandColor || "#7c3aed")}
        ${input("websiteUrl", "Website URL", podcast.websiteUrl || "")}
        ${input("copyright", "Copyright", podcast.copyright || "")}
        ${input("tagline", "Podcast Tagline", podcast.tagline || "")}
        ${select("podcastType", "Podcast Type", ["Episodic", "Serial"], false, podcast.podcastType || "Episodic")}
        ${select("explicit", "Explicit Content", ["No", "Yes"], false, podcast.explicit ? "Yes" : "No")}
        ${input("timezone", "Time Zone", podcast.timezone || "Asia/Calcutta")}
        <button type="submit">Save Podcast Profile</button>
      </form>
    </section>
  `;
}

function renderPodcastTab(podcast, tab) {
  const episodes = podcastEpisodes(podcast);
  const feedUrl = podcast.feedUrl ? `${window.location.origin}${podcast.feedUrl}` : "";
  const publicUrl = podcast.publicUrl ? `${window.location.origin}${podcast.publicUrl}` : "";
  const validation = podcast.validation || { valid: false, issues: [], warnings: [], results: [] };

  if (tab === "overview") {
    const stats = podcast.stats || {};
    return `
      <section class="cards-grid podcast-stats">
        ${statCard("Total Episodes", stats.totalEpisodes ?? episodes.length, "mic", "purple")}
        ${statCard("Published Episodes", stats.publishedEpisodes ?? 0, "play-square", "blue")}
        ${statCard("Draft Episodes", stats.draftEpisodes ?? 0, "file", "orange")}
        ${statCard("Scheduled Episodes", stats.scheduledEpisodes ?? 0, "settings", "blue")}
        ${statCard("Processing Episodes", stats.processingEpisodes ?? 0, "refresh", "purple")}
        ${statCard("Total Duration", stats.totalPodcastDuration || "0:00", "mic", "blue")}
        ${statCard("Storage Used", stats.storageUsed || "0 MB", "folder", "orange")}
        ${statCard("RSS Feed Status", stats.rssFeedStatus || "Needs attention", "captions", validation.valid ? "green" : "orange")}
      </section>
      <section class="grid columns podcast-overview-grid">
        <div class="panel">
          <h2>Recent Episodes</h2>
          <div class="list compact-list">
            ${episodes.slice(0, 5).map((episode) => `<article class="row"><div><strong>${html(episode.title)}</strong><p class="muted">S${html(episode.seasonNumber || episode.season || 1)} E${html(episode.episodeNumber || 1)} - ${html(episode.duration || "00:00")}</p></div>${badge(titleCase(episode.status), podcastStatusTone(episode.status))}</article>`).join("") || '<p class="muted">Upload your first podcast episode.</p>'}
          </div>
        </div>
        <div class="panel quick-actions">
          <h2>Quick Actions</h2>
          <button data-create-episode type="button">${icon("upload")} Upload New Episode</button>
          <button data-podcast-tab="rss" type="button">${icon("copy")} Open RSS Feed</button>
          <a class="ghost-link" href="${html(publicUrl || "#")}" target="_blank" rel="noreferrer">View Public Podcast Page</a>
          <button data-podcast-tab="details" type="button">${icon("edit")} Edit Podcast Details</button>
        </div>
      </section>
    `;
  }

  if (tab === "details") {
    return `
      ${renderPodcastSetup(podcast).replace("podcastSetupForm", "podcastDetailsForm").replace("Create Your Podcast", "Podcast Details").replace("Set up your podcast details before uploading your first episode.", "Changing podcast details automatically updates the RSS feed.")}
    `;
  }

  if (tab === "rss") {
    return `
      <section class="panel rss-card" style="margin-top:0;">
        <div>
          <h2>RSS Feed URL</h2>
          <a href="${html(feedUrl || "#")}" target="_blank" rel="noreferrer">${html(feedUrl || "Publish an episode to create the feed.")}</a>
        </div>
        <button class="ghost" data-copy-text="${html(feedUrl)}" type="button">${icon("copy")} Copy</button>
        <a class="ghost-link" href="${html(publicUrl || "#")}" target="_blank" rel="noreferrer">View Podcast Page</a>
      </section>
      <section class="panel rss-validation">
        <h2>RSS Validation</h2>
        ${badge(validation.valid ? "Passed" : "Needs attention", validation.valid ? "green" : "amber")}
        <div class="podcast-issues">${(validation.results || []).map((item) => `<p><strong>${html(item.level)}:</strong> ${html(item.message)}</p>`).join("") || '<p>Publish an episode to activate the RSS feed.</p>'}</div>
        <button class="ghost" data-refresh-rss type="button">${icon("refresh")} Validate Feed</button>
      </section>
      <section class="panel rss-preview">
        <h2>Preview XML</h2>
        <pre>${html(podcast.rssPreview || "Click Validate Feed to refresh RSS status.")}</pre>
      </section>
    `;
  }

  if (tab === "public") {
    return `
      <section class="panel">
        <h2>Public Podcast Page</h2>
        <p class="muted">Only published episodes appear publicly. Drafts and unpublished episodes stay private.</p>
        <div class="button-row">
          <a class="ghost-link" href="${html(publicUrl || "#")}" target="_blank" rel="noreferrer">Open Public Page</a>
          <button data-copy-text="${html(publicUrl)}" type="button">${icon("copy")} Copy Public Link</button>
        </div>
      </section>
    `;
  }

  if (tab === "settings") {
    return `
      <section class="panel podcast-form-panel">
        <h2>Podcast Settings</h2>
        <form id="podcastSettingsForm" class="podcast-grid-form">
          ${input("maxAudioFileSizeMb", "Maximum audio file size (MB)", podcast.settings?.maxAudioFileSizeMb || 200, "number")}
          ${input("storageLimitMb", "Storage limit (MB)", podcast.settings?.storageLimitMb || 10240, "number")}
          <button type="submit">Save Settings</button>
        </form>
      </section>
    `;
  }

  return `
      <div class="podcast-actions">
        <button data-create-episode type="button">${icon("upload")} Upload Episode</button>
      </div>
      <div class="filter-bar compact-filter">
        <input id="episodeSearch" placeholder="Search episodes">
        <select id="episodeStatusFilter"><option value="">All statuses</option>${["DRAFT", "READY", "SCHEDULED", "PUBLISHED", "UNPUBLISHED", "ARCHIVED", "FAILED"].map((item) => `<option>${item}</option>`).join("")}</select>
      </div>
      <section class="simple-table">
        <div class="simple-table-row podcast-row head"><span>Episode</span><span>Status</span><span>Date</span><span>Duration</span><span>Actions</span></div>
        ${episodes.map((episode) => {
          const date = new Date(episode.publishedAt || episode.scheduledAt || episode.date || episode.createdAt).toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" });
          return `<div class="simple-table-row podcast-row" data-episode-row data-title="${html(episode.title)}" data-status="${html(episode.status)}">
            <span><strong>${html(episode.title)}</strong><p class="muted">S${html(episode.seasonNumber || episode.season || 1)} E${html(episode.episodeNumber || 1)} - ${html(episode.episodeType || "Full")}</p>${episode.audioUrl ? `<audio controls src="${html(episode.audioUrl)}"></audio>` : ""}</span>
            <span>${badge(titleCase(episode.status), podcastStatusTone(episode.status))}</span>
            <span class="muted">${html(date)}</span>
            <span class="muted">${html(episode.duration)}</span>
            <span class="episode-actions">
              ${episode.status !== "PUBLISHED" && episode.audioUrl ? `<button data-episode-action="publish" data-episode-id="${html(episode.id)}" type="button">Publish</button>` : ""}
              ${episode.status === "PUBLISHED" ? `<button data-episode-action="unpublish" data-episode-id="${html(episode.id)}" type="button">Unpublish</button>` : ""}
              <button data-episode-action="archive" data-episode-id="${html(episode.id)}" type="button">Archive</button>
              <button class="ghost" data-episode-action="delete" data-episode-id="${html(episode.id)}" type="button">Delete</button>
            </span>
          </div>`;
        }).join("") || '<div class="simple-table-row"><span class="muted">No podcast episodes yet.</span><span></span><span></span><span></span></div>'}
      </section>
      <section class="panel rss-card">
        <div>
          <h2>RSS Feed URL</h2>
          <a href="${html(feedUrl || "#")}" target="_blank" rel="noreferrer">${html(feedUrl || "Publish an episode to create the feed.")}</a>
        </div>
        <button class="ghost" data-copy-text="${html(feedUrl)}" type="button">${icon("copy")} Copy</button>
        <a class="ghost-link" href="${html(publicUrl || "#")}" target="_blank" rel="noreferrer">View Podcast Page</a>
      </section>
    `;
}

function renderPodcastUploadForm() {
  return `
    <section class="panel podcast-form-panel">
      <h2>Upload Podcast Episode</h2>
      <form id="podcastEpisodeForm">
        <label class="upload-box compact-upload">
          <input name="file" type="file" accept="audio/*">
          <span>
            <span class="upload-cloud">${icon("upload")}</span>
            <strong>Upload Audio</strong>
            <p>MP3, WAV, M4A, FLAC</p>
            <p id="podcastFileName" class="selected-file">No file selected</p>
          </span>
        </label>
        ${input("title", "Episode title", "")}
        ${input("subtitle", "Episode subtitle", "")}
        ${textarea("description", "Description or transcript seed", "")}
        ${input("episodeNumber", "Episode Number", String((state.podcast?.episodes || []).length + 1), "number")}
        ${input("seasonNumber", "Season Number", "1", "number")}
        ${select("episodeType", "Episode Type", ["Full", "Trailer", "Bonus"], false, "Full")}
        ${input("keywords", "Keywords", "")}
        ${select("explicit", "Explicit Content", ["No", "Yes"], false, "No")}
        ${select("status", "Publish status", ["Draft", "Published", "Scheduled"], false, "Draft")}
        ${input("scheduledAt", "Schedule Date/Time", "", "datetime-local")}
        <div class="button-row">
          <button type="submit">${icon("upload")} Save Episode</button>
          <button class="ghost" data-cancel-podcast-upload type="button">Cancel</button>
        </div>
      </form>
    </section>
  `;
}

function podcastStatusTone(status) {
  return {
    DRAFT: "",
    UPLOADING: "blue",
    PROCESSING: "purple",
    READY: "blue",
    SCHEDULED: "amber",
    PUBLISHED: "green",
    FAILED: "red",
    UNPUBLISHED: "amber",
    ARCHIVED: ""
  }[String(status || "").toUpperCase()] || "";
}

function titleCase(value) {
  return String(value || "").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function podcastProfilePayload(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  return {
    title: data.title || "",
    subtitle: data.subtitle || "",
    description: data.description || "",
    author: data.author || "",
    ownerName: data.ownerName || data.author || "",
    ownerEmail: data.ownerEmail || "",
    language: data.language || "en",
    primaryCategory: data.primaryCategory || "",
    secondaryCategory: data.secondaryCategory || "",
    country: data.country || "IN",
    coverImageUrl: data.coverImageUrl || "",
    brandColor: data.brandColor || "#7c3aed",
    websiteUrl: data.websiteUrl || "",
    copyright: data.copyright || "",
    tagline: data.tagline || "",
    podcastType: data.podcastType || "Episodic",
    explicit: data.explicit === "Yes",
    timezone: data.timezone || "Asia/Calcutta"
  };
}

async function loadPodcast() {
  state.podcast = await api("/api/podcasts");
  return state.podcast;
}

async function renderPodcastBody(tab = "overview") {
  const podcast = await loadPodcast();
  const body = document.querySelector("#podcastBody");
  if (!body) {
    renderPodcast();
    return;
  }
  body.innerHTML = renderPodcastTab(podcast, tab);
  document.querySelectorAll(".tabs [data-podcast-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.podcastTab === tab);
  });
}

function filterPodcastEpisodes() {
  const query = document.querySelector("#episodeSearch")?.value.trim().toLowerCase() || "";
  const status = document.querySelector("#episodeStatusFilter")?.value || "";
  document.querySelectorAll("[data-episode-row]").forEach((row) => {
    const matchesTitle = (row.dataset.title || "").toLowerCase().includes(query);
    const matchesStatus = !status || row.dataset.status === status;
    row.hidden = !(matchesTitle && matchesStatus);
  });
}

function renderProjects() {
  const projects = (state.dashboard?.projects || []).map((project) => [
    project.title,
    moduleName(project.module),
    new Date(project.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    toneForModule(project.module),
    project.id
  ]);

  view.innerHTML = `
    ${pageHead("My Projects", "All your projects in one place.")}
    <div class="filter-bar">
      <div class="filter-tabs">
        ${["All", "Scripts", "Videos", "Podcasts", "Thumbnails", "Storyboards"].map((item, index) => `<button class="${index === 0 ? "active" : ""}" type="button">${item}</button>`).join("")}
      </div>
      <button class="search-btn" type="button" aria-label="Search">${icon("search")}</button>
    </div>
    <section class="project-grid">
      ${projects.map(([name, type, date, tone, id]) => `
        <article class="project-card project-row" data-project-id="${html(id)}">
          <h3>${html(name)}</h3>
          ${badge(type, tone)}
          <p>${html(date)}</p>
        </article>
      `).join("") || '<p class="muted">No projects yet.</p>'}
    </section>
  `;
}

function moduleName(module) {
  return {
    script: "Script",
    subtitle: "Subtitles",
    subtitles: "Subtitles",
    podcast: "Podcast",
    thumbnail: "Thumbnail",
    storyboard: "Storyboard",
    video: "Video"
  }[module] || "Script";
}

function toneForModule(module) {
  return {
    podcast: "green",
    thumbnail: "orange",
    subtitle: "blue",
    subtitles: "blue",
    video: "blue"
  }[module] || "";
}

async function showProject(projectId) {
  const detail = await api(`/api/projects/${projectId}`);
  state.selectedProjectId = projectId;
  view.innerHTML = `
    ${pageHead(detail.title, `${moduleName(detail.module)} project details and versions.`)}
    <section class="grid columns">
      <form class="panel" id="projectForm">
        ${input("title", "Title", detail.title)}
        <label>Content JSON<textarea id="projectContentInput">${html(JSON.stringify(detail.content, null, 2))}</textarea></label>
        <div class="button-row">
          <button type="button" data-save-project="${html(detail.id)}">Save Project</button>
          <button class="ghost" type="button" data-trash-project="${html(detail.id)}">Move to Trash</button>
        </div>
      </form>
      <div class="panel">
        <h2>Versions</h2>
        <div class="list compact-list">${detail.versions.map((version) => `<article class="row"><strong>Version ${version.version}</strong><span class="muted">${new Date(version.createdAt).toLocaleString()}</span></article>`).join("") || `<p class="muted">No versions yet.</p>`}</div>
      </div>
    </section>
  `;
}

function renderMedia() {
  view.innerHTML = `
    ${pageHead("Media Library", "Manage uploaded video, audio and image assets.")}
    <section class="grid columns">
      <div class="panel">
        <h2>Recent Media</h2>
        <div class="list compact-list">${(state.dashboard.media || []).map(mediaRow).join("") || '<p class="muted">No media items yet.</p>'}</div>
      </div>
      <form class="panel" id="mediaForm">
        <h2>Register Upload</h2>
        ${input("filename", "Filename", "")}
        ${select("mimeType", "MIME type", ["video/mp4", "audio/mpeg", "audio/wav", "image/jpeg", "image/png"])}
        ${input("sizeBytes", "Size bytes", "12500000", "number")}
        ${input("duration", "Duration", "00:45")}
        <button type="submit">Add Media</button>
      </form>
    </section>
  `;
  document.querySelector("#mediaForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await api("/api/media", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
    await refresh();
    renderMedia();
    notify("Media registered.");
  });
}

function mediaRow(asset) {
  return `<article class="row"><div><strong>${html(asset.filename)}</strong><p class="muted">${html(asset.mimeType)} - ${Math.round(asset.sizeBytes / 1024 / 1024)} MB</p></div>${badge(asset.status, asset.status === "READY" ? "green" : "amber")}</article>`;
}

function renderTemplates() {
  const templates = [
    ["YouTube Explainer", "Script"],
    ["Podcast Launch", "Podcast"],
    ["Bold AI Thumbnail", "Thumbnail"],
    ["30s Product Ad", "Storyboard"]
  ];
  view.innerHTML = `
    ${pageHead("Templates", "Reusable creator formats for faster production.")}
    <section class="project-grid">
      ${templates.map(([name, type]) => `<article class="project-card"><h3>${name}</h3>${badge(type, toneForModule(type.toLowerCase()))}<p>Ready to use</p></article>`).join("")}
    </section>
  `;
}

function renderSettings() {
  const { creator } = state.dashboard;
  view.innerHTML = `
    ${pageHead("Settings", "Manage your creator workspace preferences.")}
    <section class="grid settings-grid">
      <form class="panel" id="settingsForm">
        <h2>Personal Profile</h2>
        ${input("name", "Name", creator.name)}
        ${input("brand", "Brand", "CreatorSuite")}
        ${input("timezone", "Timezone", creator.timezone)}
        ${input("voice", "Brand voice", creator.brandSettings.voice)}
        <button type="submit">Save Settings</button>
      </form>
    </section>
  `;
  document.querySelector("#settingsForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    await api("/api/settings", {
      method: "PATCH",
      body: JSON.stringify({ name: data.name, brand: data.brand, timezone: data.timezone, brandSettings: { voice: data.voice } })
    });
    await refresh();
    renderSettings();
    notify("Settings saved.");
  });
}

function render() {
  if (!state.dashboard) return;
  if (state.route === "dashboard") return renderDashboard();
  if (["script", "subtitles", "thumbnail", "storyboard"].includes(state.route)) return renderToolForm(state.route);
  if (state.route === "podcast") return renderPodcast();
  if (state.route === "projects") return renderProjects();
  if (state.route === "media") return renderMedia();
  if (state.route === "templates") return renderTemplates();
  if (state.route === "settings") return renderSettings();
  return renderDashboard();
}

document.addEventListener("submit", async (event) => {
  const podcastProfileForm = event.target.closest("#podcastSetupForm, #podcastDetailsForm");
  if (podcastProfileForm) {
    event.preventDefault();
    const payload = podcastProfilePayload(podcastProfileForm);
    if (!payload.title || !payload.description || !payload.author || !payload.ownerEmail) {
      notify("Podcast title, description, author and owner email are required.");
      return;
    }
    const submitBtn = podcastProfileForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = "Saving...";
    submitBtn.disabled = true;
    try {
      const method = state.podcast?.title ? "PATCH" : "POST";
      const path = method === "PATCH" ? `/api/podcasts/${state.podcast.id || "pod-1"}` : "/api/podcasts";
      await api(path, { method, body: JSON.stringify(payload) });
      await refresh();
      renderPodcast();
      notify("Podcast profile saved.");
    } catch (error) {
      notify(error.message);
    } finally {
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }
    return;
  }

  const podcastSettingsForm = event.target.closest("#podcastSettingsForm");
  if (podcastSettingsForm) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(podcastSettingsForm).entries());
    const submitBtn = podcastSettingsForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = "Saving...";
    submitBtn.disabled = true;
    try {
      await api(`/api/podcasts/${state.podcast.id || "pod-1"}`, {
        method: "PATCH",
        body: JSON.stringify({
          settings: {
            maxAudioFileSizeMb: Number(data.maxAudioFileSizeMb || 200),
            storageLimitMb: Number(data.storageLimitMb || 10240)
          }
        })
      });
      await renderPodcastBody("settings");
      notify("Podcast settings saved.");
    } catch (error) {
      notify(error.message);
    } finally {
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }
    return;
  }

  const form = event.target.closest("#podcastEpisodeForm");
  if (!form) return;
  event.preventDefault();

  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  const file = form.querySelector('input[name="file"]')?.files?.[0];
  const titleValue = form.querySelector('input[name="title"]')?.value.trim();
  const subtitleValue = form.querySelector('input[name="subtitle"]')?.value.trim();
  const descriptionValue = form.querySelector('textarea[name="description"]')?.value.trim();
  const episodeNumber = form.querySelector('input[name="episodeNumber"]')?.value;
  const seasonNumber = form.querySelector('input[name="seasonNumber"]')?.value;
  const episodeType = form.querySelector('select[name="episodeType"]')?.value || "Full";
  const keywordsValue = form.querySelector('input[name="keywords"]')?.value || "";
  const explicitValue = form.querySelector('select[name="explicit"]')?.value || "No";
  const statusValue = form.querySelector('select[name="status"]')?.value || "Draft";
  const scheduledAtValue = form.querySelector('input[name="scheduledAt"]')?.value;

  if (!file) {
    notify("Please upload an audio file first.");
    return;
  }
  if (!titleValue) {
    notify("Please enter an episode title.");
    return;
  }

  submitBtn.textContent = "Uploading...";
  submitBtn.disabled = true;
  try {
    const uploadBody = new FormData();
    uploadBody.append("file", file);
    const uploaded = await api("/api/podcasts/upload-audio", { method: "POST", body: uploadBody });
    const duration = uploaded.duration || await durationFromFile(file);

    submitBtn.textContent = "Generating notes...";
    let metadata = {};
    try {
      metadata = await api("/api/podcasts/generate-metadata", {
        method: "POST",
        body: JSON.stringify({
          episodeTitle: titleValue,
          transcript: descriptionValue || titleValue
        })
      });
    } catch {
      metadata = { shortDescription: descriptionValue, showNotes: [], keywords: [], chapters: [] };
    }

    submitBtn.textContent = "Publishing...";
    await api(`/api/podcasts/${state.podcast?.id || "pod-1"}/episodes`, {
      method: "POST",
      body: JSON.stringify({
        title: titleValue,
        subtitle: subtitleValue,
        description: metadata.shortDescription || descriptionValue,
        showNotes: metadata.showNotes || [],
        keywords: keywordsValue || metadata.keywords || [],
        chapters: metadata.chapters || [],
        transcript: descriptionValue,
        status: statusValue.toUpperCase(),
        scheduledAt: statusValue === "Scheduled" && scheduledAtValue ? new Date(scheduledAtValue).toISOString() : null,
        episodeNumber,
        seasonNumber,
        episodeType,
        explicit: explicitValue === "Yes",
        audioUrl: uploaded.url,
        audioStorageKey: uploaded.storageKey || "",
        audioFileName: file.name,
        bytes: uploaded.bytes,
        mimeType: uploaded.mimeType,
        duration,
        durationSeconds: uploaded.durationSeconds || 0
      })
    });

    await refresh();
    await renderPodcastBody("episodes");
    notify(statusValue === "Published" ? "Episode published to RSS." : "Episode draft saved.");
  } catch (error) {
    notify(error.message);
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
});

document.addEventListener("change", (event) => {
  const podcastFile = event.target.closest('#podcastEpisodeForm input[name="file"]');
  if (podcastFile) {
    const fileName = document.querySelector("#podcastFileName");
    if (fileName) fileName.textContent = podcastFile.files?.[0]?.name || "No file selected";
    return;
  }

  if (event.target.closest("#episodeStatusFilter")) {
    filterPodcastEpisodes();
  }
});

document.addEventListener("input", (event) => {
  if (event.target.closest("#episodeSearch")) {
    filterPodcastEpisodes();
  }
});

document.addEventListener("click", async (event) => {
  const jump = event.target.closest("[data-jump]");
  if (jump) return setRoute(jump.dataset.jump);

  const downloadSrt = event.target.closest("[data-download-srt]");
  if (downloadSrt) {
    if (!state.lastOutput?.segments?.length) {
      notify("Generate subtitles first.");
      return;
    }
    syncEditedSubtitleSegments();
    const result = state.lastOutput;
    downloadText(`${slug(result.title || "subtitles")}.srt`, srtFromSegments(result.segments), "application/x-subrip");
    notify("SRT downloaded.");
    return;
  }

  const previewPlay = event.target.closest("[data-preview-play]");
  if (previewPlay) {
    const media = document.querySelector("[data-subtitle-media]");
    if (media) {
      media.muted = true;
      await media.play().catch(() => notify("Browser could not play this file preview."));
    }
    return;
  }

  const thumbnailHeadline = event.target.closest("[data-thumbnail-headline]");
  if (thumbnailHeadline) {
    const selectedHeadline = thumbnailHeadline.dataset.thumbnailHeadline;
    state.lastOutput = {
      ...(state.lastOutput || {}),
      selectedHeadline,
      title: document.querySelector('input[name="title"]')?.value || selectedHeadline,
      theme: "generated"
    };
    document.querySelectorAll("[data-thumbnail-headline]").forEach((button) => {
      button.classList.toggle("active", button === thumbnailHeadline);
    });
    document.querySelector("#toolOutput").innerHTML = renderThumbnailOutput(state.lastOutput);
    return;
  }

  const downloadThumbnail = event.target.closest("[data-download-thumbnail]");
  if (downloadThumbnail) {
    const payload = currentThumbnailPayload();
    downloadText(`${slug(payload.title)}.svg`, thumbnailSvg(payload), "image/svg+xml");
    notify("Thumbnail downloaded.");
    return;
  }

  const saveThumbnail = event.target.closest("[data-save-thumbnail]");
  if (saveThumbnail) {
    const payload = currentThumbnailPayload();
    await api("/api/projects", {
      method: "POST",
      body: JSON.stringify({ module: "thumbnail", title: payload.title, content: payload })
    });
    await refresh();
    notify("Thumbnail saved to projects.");
    return;
  }

  const downloadStoryboard = event.target.closest("[data-download-storyboard]");
  if (downloadStoryboard) {
    if (!state.lastOutput?.scenes?.length) {
      notify("Generate a storyboard first.");
      return;
    }
    const result = state.lastOutput;
    downloadText(`${slug(result.title || "storyboard")}.txt`, storyboardText(result));
    notify("Storyboard downloaded.");
    return;
  }

  const saveStoryboard = event.target.closest("[data-save-storyboard]");
  if (saveStoryboard) {
    if (!state.lastOutput?.scenes?.length) {
      notify("Generate a storyboard first.");
      return;
    }
    const result = state.lastOutput;
    await api("/api/projects", {
      method: "POST",
      body: JSON.stringify({ module: "storyboard", title: result.title || "Storyboard", content: result })
    });
    await refresh();
    notify("Storyboard saved to projects.");
    return;
  }

  const podcastTab = event.target.closest("[data-podcast-tab]");
  if (podcastTab && state.podcast) {
    document.querySelectorAll(".tabs [data-podcast-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.podcastTab === podcastTab.dataset.podcastTab);
    });
    document.querySelector("#podcastBody").innerHTML = renderPodcastTab(state.podcast, podcastTab.dataset.podcastTab);
    return;
  }

  const createEpisode = event.target.closest("[data-create-episode]");
  if (createEpisode) {
    const body = document.querySelector("#podcastBody");
    if (body) body.innerHTML = renderPodcastUploadForm();
    return;
  }

  const cancelPodcastUpload = event.target.closest("[data-cancel-podcast-upload]");
  if (cancelPodcastUpload && state.podcast) {
    document.querySelector("#podcastBody").innerHTML = renderPodcastTab(state.podcast, "episodes");
    return;
  }

  const refreshRss = event.target.closest("[data-refresh-rss]");
  if (refreshRss && state.podcast) {
    refreshRss.disabled = true;
    try {
      const result = await api(`/api/podcasts/${state.podcast.id || "pod-1"}/refresh-rss`, { method: "POST" });
      state.podcast = { ...state.podcast, validation: result.validation, rssPreview: result.xml };
      document.querySelector("#podcastBody").innerHTML = renderPodcastTab(state.podcast, "rss");
      notify(result.validation?.valid ? "RSS feed is valid." : "RSS needs required fields or a published episode.");
    } catch (error) {
      notify(error.message);
    } finally {
      refreshRss.disabled = false;
    }
    return;
  }

  const episodeAction = event.target.closest("[data-episode-action]");
  if (episodeAction && state.podcast) {
    const actionName = episodeAction.dataset.episodeAction;
    const episodeId = episodeAction.dataset.episodeId;
    const confirmed = actionName === "delete" ? window.confirm("Delete this episode?") : true;
    if (!confirmed) return;
    episodeAction.disabled = true;
    try {
      if (actionName === "delete") {
        await api(`/api/episodes/${episodeId}`, { method: "DELETE" });
      } else {
        await api(`/api/episodes/${episodeId}/${actionName}`, { method: "POST", body: JSON.stringify({}) });
      }
      await refresh();
      await renderPodcastBody("episodes");
      notify({
        delete: "Episode deleted.",
        publish: "Episode published.",
        unpublish: "Episode unpublished.",
        archive: "Episode archived."
      }[actionName] || "Episode updated.");
    } catch (error) {
      notify(error.message);
    } finally {
      episodeAction.disabled = false;
    }
    return;
  }

  const copyText = event.target.closest("[data-copy-text]");
  if (copyText) {
    const text = copyText.dataset.copyText;
    if (!text) {
      notify("No link available yet.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      notify("Copied.");
    } catch {
      downloadText("rss-url.txt", text);
      notify("Clipboard unavailable, URL downloaded.");
    }
    return;
  }

  const projectRowTarget = event.target.closest("[data-project-id]");
  if (projectRowTarget) return showProject(projectRowTarget.dataset.projectId);

  const exportTarget = event.target.closest("[data-export]");
  if (exportTarget) {
    const payload = JSON.parse(decodeURIComponent(exportTarget.dataset.export));
    if (payload.type === "pdf" && window.html2pdf) {
      const element = document.createElement("div");
      element.innerHTML = renderScriptOutput(payload.payload);
      element.style.padding = "40px";
      html2pdf().from(element).save(`${payload.payload.title || "script"}.pdf`);
      notify("PDF downloaded.");
      return;
    }
    if (payload.type === "docx" && window.docx) {
      const doc = new docx.Document({
        sections: [{
          properties: {},
          children: [
            new docx.Paragraph({ text: payload.payload.title, heading: docx.HeadingLevel.HEADING_1 }),
            new docx.Paragraph(payload.payload.hook || "")
          ]
        }]
      });
      const blob = await docx.Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${payload.payload.title || "script"}.docx`;
      anchor.click();
      notify("DOCX downloaded.");
      return;
    }
    if (payload.type === "docx") {
      downloadText(`${slug(payload.payload.title || "script")}.txt`, exportPlainText(payload.payload));
      notify("DOCX export is unavailable in this browser. Text downloaded instead.");
      return;
    }
    const result = await api("/api/exports", { method: "POST", body: JSON.stringify(payload) });
    await refresh();
    notify(`Export ready: ${result.filename}`);
    return;
  }

  const saveTarget = event.target.closest("[data-save]");
  if (saveTarget) {
    const payload = JSON.parse(decodeURIComponent(saveTarget.dataset.save));
    await api("/api/projects", { method: "POST", body: JSON.stringify(payload) });
    await refresh();
    notify("Saved as a new project version.");
    return;
  }

  const saveProject = event.target.closest("[data-save-project]");
  if (saveProject) {
    let content = {};
    try {
      content = JSON.parse(document.querySelector("#projectContentInput").value);
    } catch {
      notify("Project JSON is invalid.");
      return;
    }
    await api(`/api/projects/${saveProject.dataset.saveProject}`, {
      method: "PATCH",
      body: JSON.stringify({ title: document.querySelector('input[name="title"]').value, content })
    });
    await refresh();
    await showProject(saveProject.dataset.saveProject);
    notify("Project saved.");
    return;
  }

  const trashProject = event.target.closest("[data-trash-project]");
  if (trashProject) {
    await api(`/api/projects/${trashProject.dataset.trashProject}`, { method: "DELETE" });
    await refresh();
    renderProjects();
    notify("Project moved to trash.");
  }
});

document.addEventListener("keydown", (event) => {
  const jump = event.target.closest("[data-jump]");
  if (jump && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    setRoute(jump.dataset.jump);
  }
});

document.querySelector("#refreshBtn")?.addEventListener("click", async () => {
  await refresh();
  render();
  notify("Dashboard refreshed.");
});

document.querySelector("#newProjectBtn")?.addEventListener("click", async () => {
  await api("/api/projects", { method: "POST", body: JSON.stringify({ module: "script", title: "Untitled Creator Project" }) });
  await refresh();
  setRoute("projects");
  notify("Project created.");
});

document.querySelector("#logoutBtn")?.addEventListener("click", () => {
  localStorage.removeItem("creator_auth");
  document.querySelector("#appContainer").style.display = "none";
  document.querySelector("#landingContainer").style.display = "block";
  document.querySelector("#navToDashboardBtn").hidden = true;
  document.querySelector("#showLoginBtn").style.display = "inline-flex";
});

document.querySelector("#loginForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  localStorage.setItem("creator_auth", "true");
  document.querySelector("#loginContainer").style.display = "none";
  document.querySelector("#landingContainer").style.display = "none";
  document.querySelector("#appContainer").style.display = "grid";
  bootApp();
});

document.querySelector("#showLoginBtn")?.addEventListener("click", () => {
  document.querySelector("#landingContainer").style.display = "none";
  document.querySelector("#loginContainer").style.display = "flex";
});

function openDashboardOrLogin() {
  if (localStorage.getItem("creator_auth")) {
    document.querySelector("#landingContainer").style.display = "none";
    document.querySelector("#appContainer").style.display = "grid";
    bootApp();
  } else {
    localStorage.setItem("creator_auth", "true");
    document.querySelector("#landingContainer").style.display = "none";
    document.querySelector("#appContainer").style.display = "grid";
    bootApp();
  }
}

document.querySelector("#heroCtaBtn")?.addEventListener("click", openDashboardOrLogin);
document.querySelector("#landingCtaDuplicate")?.addEventListener("click", openDashboardOrLogin);

document.querySelector("#exploreBtn")?.addEventListener("click", () => {
  openDashboardOrLogin();
});

document.querySelector("#navToDashboardBtn")?.addEventListener("click", () => {
  document.querySelector("#landingContainer").style.display = "none";
  document.querySelector("#appContainer").style.display = "grid";
  bootApp();
});

let isBooted = false;
async function bootApp() {
  if (!isBooted) {
    isBooted = true;
    state.route = window.location.hash.replace("#", "") || "dashboard";
    initNav();
  }
  await refresh();
  setRoute(state.route);
}

(function checkAuth() {
  if (localStorage.getItem("creator_auth")) {
    document.querySelector("#loginContainer").style.display = "none";
    document.querySelector("#landingContainer").style.display = "none";
    document.querySelector("#appContainer").style.display = "grid";
    bootApp();
  } else {
    document.querySelector("#appContainer").style.display = "none";
    document.querySelector("#loginContainer").style.display = "none";
    document.querySelector("#landingContainer").style.display = "block";
  }
})();
