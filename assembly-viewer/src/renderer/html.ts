import { marked } from "marked";
import type {
  Workspace,
  Topic,
  Character,
  Iteration,
  Synthesis,
  ConvergencePoint,
  DivergencePoint,
  DebateRound,
  Deliverable,
  VerificationReport,
} from "../types.js";

marked.setOptions({ breaks: false, gfm: true });

function md(text: string): string {
  return marked.parse(text, { async: false }) as string;
}

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "...";
}

function formatStructure(s: string): string {
  return s.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function confidenceBadge(confidence: string): string {
  const label = confidence === "medium-high" ? "Med-High" : confidence;
  return `<span class="badge badge-${confidence}">${esc(label)}</span>`;
}

// Deterministic color for character avatar
const AVATAR_COLORS = [
  "#0969da", "#8250df", "#bf3989", "#0e8a16", "#e16f24",
  "#cf222e", "#1a7f37", "#6639ba", "#953800", "#0550ae",
  "#7c3aed", "#d1242f",
];

function avatarColor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.replace(/^(Dr\.|Colonel|Col\.)?\s*/i, "").split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Layout ───

function layout(title: string, content: string, nav: string, bc: string = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} — Assembly Viewer</title>
  <link rel="stylesheet" href="/styles.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Source+Sans+3:wght@400;500;550;600;650;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
</head>
<body>
  ${nav}
  <main>
    ${bc}
    ${content}
  </main>
</body>
</html>`;
}

function buildNav(workspace: Workspace, activePath: string = ""): string {
  let html = `<nav>
  <div class="nav-brand">
    <div class="nav-brand-icon">A</div>
    Assembly Viewer
  </div>
  <a href="/index.html"${activePath === "index" ? ' class="active"' : ""}>
    <span class="nav-icon">&#9776;</span> Home
  </a>`;

  for (const topic of workspace.topics) {
    const shortTitle = truncate(topic.title.replace(/\s*—.*$/, "").replace(/\s*--.*$/, ""), 30);

    html += `
  <div class="nav-divider"></div>
  <div class="nav-section">
    <div class="nav-section-title">${esc(shortTitle)}</div>
    <a href="/${topic.slug}/index.html"${activePath === topic.slug ? ' class="active"' : ""}>
      <span class="nav-icon">&#9670;</span> Overview
    </a>`;

    if (topic.synthesis) {
      html += `
    <a href="/${topic.slug}/synthesis.html"${activePath === `${topic.slug}/synthesis` ? ' class="active"' : ""}>
      <span class="nav-icon">&#9733;</span> Synthesis
    </a>`;
    }

    if (topic.characters.length > 0) {
      html += `
    <a href="/${topic.slug}/characters.html"${activePath === `${topic.slug}/characters` ? ' class="active"' : ""}>
      <span class="nav-icon">&#9823;</span> Characters
    </a>`;
    }

    for (const iter of topic.iterations) {
      html += `
    <a href="/${topic.slug}/iteration-${iter.number}.html"${activePath === `${topic.slug}/iteration-${iter.number}` ? ' class="active"' : ""}>
      <span class="nav-icon">&#9656;</span> ${esc(formatStructure(iter.structure))}
    </a>`;
    }

    if (topic.deliverables.length > 0) {
      html += `
    <a href="/${topic.slug}/deliverables.html"${activePath === `${topic.slug}/deliverables` ? ' class="active"' : ""}>
      <span class="nav-icon">&#9998;</span> Deliverables
    </a>`;
    }

    if (topic.verification.length > 0) {
      html += `
    <a href="/${topic.slug}/verification.html"${activePath === `${topic.slug}/verification` ? ' class="active"' : ""}>
      <span class="nav-icon">&#10003;</span> Verification
    </a>`;
    }

    html += `
  </div>`;
  }

  html += `\n</nav>`;
  return html;
}

function breadcrumb(...crumbs: Array<{ label: string; href?: string }>): string {
  return `<div class="breadcrumb">${crumbs
    .map((c, i) => {
      if (i === crumbs.length - 1)
        return `<span class="current">${esc(c.label)}</span>`;
      return `<a href="${c.href}">${esc(c.label)}</a><span class="separator">/</span>`;
    })
    .join("")}</div>`;
}

// ─── Pages ───

export function renderWorkspaceIndex(workspace: Workspace): string {
  const nav = buildNav(workspace, "index");

  const topicCards = workspace.topics
    .map((topic) => {
      const meta = [
        topic.characters.length > 0 ? `${topic.characters.length} characters` : null,
        topic.iterations.length > 0 ? `${topic.iterations.length} iterations` : null,
        topic.synthesis ? "synthesis" : null,
        topic.deliverables.length > 0 ? `${topic.deliverables.length} deliverable${topic.deliverables.length > 1 ? "s" : ""}` : null,
      ].filter(Boolean).join(" &middot; ");

      // Get first high-confidence convergence or first convergence
      let summary = "";
      if (topic.synthesis) {
        const highConf = topic.synthesis.convergence.find((c) => c.confidence === "high");
        const first = highConf ?? topic.synthesis.convergence[0];
        if (first) summary = truncate(first.claim, 200);
      }

      return `
    <div class="topic-card">
      <h2><a href="/${topic.slug}/index.html">${esc(topic.title.replace(/\s*—\s*Final.*$/, "").replace(/\s*--\s*Assembly.*$/, ""))}</a></h2>
      <div class="topic-meta">${meta}</div>
      ${summary ? `<div class="topic-summary">${esc(summary)}</div>` : ""}
    </div>`;
    })
    .join("\n");

  const content = `
    <h1>Assembly Workspace</h1>
    <p class="page-subtitle">${workspace.topics.length} topic${workspace.topics.length !== 1 ? "s" : ""} analyzed through multi-agent debate</p>
    ${topicCards}`;

  return layout("Home", content, nav);
}

export function renderTopicLanding(workspace: Workspace, topic: Topic): string {
  const nav = buildNav(workspace, topic.slug);
  const bc = breadcrumb(
    { label: "Home", href: "/index.html" },
    { label: topic.title.replace(/\s*—\s*Final.*$/, "").replace(/\s*--\s*Assembly.*$/, "") }
  );

  const meta = [
    topic.characters.length > 0 ? `${topic.characters.length} characters` : null,
    topic.iterations.length > 0 ? `${topic.iterations.length} debate iterations` : null,
    topic.deliverables.length > 0 ? `${topic.deliverables.length} deliverable${topic.deliverables.length > 1 ? "s" : ""}` : null,
  ].filter(Boolean).join(" &middot; ");

  // Hero: top convergence points (prefer high confidence)
  let heroHtml = "";
  if (topic.synthesis && topic.synthesis.convergence.length > 0) {
    const sorted = [...topic.synthesis.convergence].sort((a, b) => {
      const order: Record<string, number> = { high: 0, "medium-high": 1, medium: 2, low: 3, unknown: 4 };
      return (order[a.confidence] ?? 5) - (order[b.confidence] ?? 5);
    });
    const topPoints = sorted.slice(0, 4);

    heroHtml = `
    <div class="hero-card">
      <h3>Key Conclusions</h3>
      ${topPoints.map((p) => `
      <div class="point-card convergence">
        <div class="point-claim">${esc(p.claim)} ${confidenceBadge(p.confidence)}</div>
      </div>`).join("")}
      <div class="hero-link">
        <a href="/${topic.slug}/synthesis.html">Read full synthesis &rarr;</a>
      </div>
    </div>`;
  }

  // Primary actions
  let actions = `<div class="action-group">`;
  if (topic.synthesis)
    actions += `<a href="/${topic.slug}/synthesis.html" class="action-pill action-pill-primary"><span class="pill-icon">&#9733;</span> Full Synthesis</a>`;
  if (topic.characters.length > 0)
    actions += `<a href="/${topic.slug}/characters.html" class="action-pill"><span class="pill-icon">&#9823;</span> ${topic.characters.length} Characters</a>`;
  actions += `</div>`;

  // Iterations
  let iterHtml = "";
  if (topic.iterations.length > 0) {
    iterHtml = `
    <div class="section-header"><h2>Debate Iterations</h2><span class="section-count">${topic.iterations.length}</span></div>
    <div class="action-group">
      ${topic.iterations.map((iter) => `
      <a href="/${topic.slug}/iteration-${iter.number}.html" class="action-pill">
        <span class="pill-number">${iter.number}</span> ${esc(formatStructure(iter.structure))}
      </a>`).join("")}
    </div>`;
  }

  // Deliverables
  let delHtml = "";
  if (topic.deliverables.length > 0) {
    delHtml = `
    <div class="section-header"><h2>Deliverables</h2><span class="section-count">${topic.deliverables.length}</span></div>
    <div class="action-group">
      ${topic.deliverables.map((d) => `
      <a href="/${topic.slug}/deliverables.html#${d.slug}" class="action-pill">
        <span class="pill-icon">&#9998;</span> ${esc(truncate(d.title, 50))}
      </a>`).join("")}
    </div>`;
  }

  // Verification
  let verHtml = "";
  if (topic.verification.length > 0) {
    verHtml = `
    <div class="section-header"><h2>Verification</h2><span class="section-count">${topic.verification.length}</span></div>
    <div class="action-group">
      ${topic.verification.map((v) => `
      <a href="/${topic.slug}/verification.html#${v.type}" class="action-pill">
        <span class="pill-icon">&#10003;</span> ${esc(truncate(v.title, 50))}
      </a>`).join("")}
    </div>`;
  }

  const content = `
    <h1>${esc(topic.title.replace(/\s*—\s*Final.*$/, "").replace(/\s*--\s*Assembly.*$/, ""))}</h1>
    <p class="page-subtitle">${meta}</p>
    ${heroHtml}
    ${actions}
    ${iterHtml}
    ${delHtml}
    ${verHtml}`;

  return layout(topic.title, content, nav, bc);
}

export function renderSynthesis(workspace: Workspace, topic: Topic): string | null {
  if (!topic.synthesis) return null;
  const synth = topic.synthesis;
  const nav = buildNav(workspace, `${topic.slug}/synthesis`);
  const bc = breadcrumb(
    { label: "Home", href: "/index.html" },
    { label: truncate(topic.title, 40), href: `/${topic.slug}/index.html` },
    { label: "Synthesis" }
  );

  const content = `
    <h1>${esc(synth.title)}</h1>
    <p class="page-subtitle">Final synthesis across all debate iterations</p>
    <div class="markdown-content">${md(synth.raw)}</div>`;

  return layout(`Synthesis — ${topic.title}`, content, nav, bc);
}

export function renderCharacterGrid(workspace: Workspace, topic: Topic): string | null {
  if (topic.characters.length === 0) return null;
  const nav = buildNav(workspace, `${topic.slug}/characters`);
  const bc = breadcrumb(
    { label: "Home", href: "/index.html" },
    { label: truncate(topic.title, 40), href: `/${topic.slug}/index.html` },
    { label: "Characters" }
  );

  const cards = topic.characters
    .map((char, i) => `
    <a href="/${topic.slug}/character-${char.number}.html" class="card" style="text-decoration:none; color:inherit;">
      <div class="card-header">
        <div class="card-avatar" style="background:${avatarColor(i)}">${initials(char.name)}</div>
        <div>
          <div class="card-title">${esc(char.name)}</div>
          ${char.tag ? `<span class="badge badge-tag">${esc(char.tag)}</span>` : ""}
        </div>
      </div>
      ${char.frameworkName ? `<div class="card-body">${esc(char.frameworkName)}</div>` : ""}
    </a>`)
    .join("");

  const content = `
    <h1>Characters</h1>
    <p class="page-subtitle">${topic.characters.length} participants in the assembly debate</p>
    <div class="card-grid">${cards}</div>`;

  return layout(`Characters — ${topic.title}`, content, nav, bc);
}

export function renderCharacterProfile(
  workspace: Workspace,
  topic: Topic,
  character: Character
): string {
  const charIndex = topic.characters.findIndex((c) => c.number === character.number);
  const nav = buildNav(workspace, `${topic.slug}/characters`);
  const bc = breadcrumb(
    { label: "Home", href: "/index.html" },
    { label: truncate(topic.title, 30), href: `/${topic.slug}/index.html` },
    { label: "Characters", href: `/${topic.slug}/characters.html` },
    { label: character.name }
  );

  const color = avatarColor(charIndex >= 0 ? charIndex : 0);

  let sections = "";

  sections += `
    <div class="profile-header">
      <div class="profile-avatar" style="background:${color}">${initials(character.name)}</div>
      <div>
        <h1 style="margin-bottom:0.15rem">${esc(character.name)}</h1>
        <div class="profile-meta">
          ${character.tag ? `<span class="badge badge-tag">${esc(character.tag)}</span>` : ""}
          ${character.frameworkName ? `<span style="color:var(--color-text-secondary);font-size:0.88rem">${esc(character.frameworkName)}</span>` : ""}
        </div>
      </div>
    </div>`;

  if (character.biography) {
    sections += `<h2>Biography</h2><div class="markdown-content">${md(character.biography)}</div>`;
  }
  if (character.framework) {
    sections += `<h2>Ideological Framework</h2><div class="markdown-content">${md(character.framework)}</div>`;
  }
  if (character.specificPositions.length > 0) {
    sections += `<h2>Specific Positions</h2><ol>${character.specificPositions.map((p) => `<li>${md(p)}</li>`).join("")}</ol>`;
  }
  if (character.blindSpot) {
    sections += `<h2>Blind Spot</h2><div class="markdown-content">${md(character.blindSpot)}</div>`;
  }
  if (character.heroes.length > 0) {
    sections += `<h2>Intellectual Heroes</h2><ul>${character.heroes.map((h) => `<li>${md(h)}</li>`).join("")}</ul>`;
  }
  if (character.rhetoricalTendencies) {
    sections += `<h2>Rhetorical Tendencies</h2><div class="markdown-content">${md(character.rhetoricalTendencies)}</div>`;
  }
  if (character.relationships.length > 0) {
    sections += `<h2>Relationships</h2><ul>${character.relationships.map((r) => `<li>${md(r)}</li>`).join("")}</ul>`;
  }

  // Nav between characters
  const prev = topic.characters[charIndex - 1];
  const next = topic.characters[charIndex + 1];
  let charNav = `<hr><div style="display:flex;justify-content:space-between;font-size:0.85rem;">`;
  charNav += prev
    ? `<a href="/${topic.slug}/character-${prev.number}.html">&larr; ${esc(prev.name)}</a>`
    : `<span></span>`;
  charNav += next
    ? `<a href="/${topic.slug}/character-${next.number}.html">${esc(next.name)} &rarr;</a>`
    : `<span></span>`;
  charNav += `</div>`;

  return layout(
    `${character.name} — ${topic.title}`,
    `${sections}${charNav}`,
    nav,
    bc
  );
}

export function renderIteration(
  workspace: Workspace,
  topic: Topic,
  iteration: Iteration
): string {
  const nav = buildNav(workspace, `${topic.slug}/iteration-${iteration.number}`);
  const bc = breadcrumb(
    { label: "Home", href: "/index.html" },
    { label: truncate(topic.title, 30), href: `/${topic.slug}/index.html` },
    { label: `Iteration ${iteration.number}: ${formatStructure(iteration.structure)}` }
  );

  let content = `
    <h1>Iteration ${iteration.number}</h1>
    <p class="page-subtitle">${esc(formatStructure(iteration.structure))} debate format</p>`;

  if (iteration.synthesis) {
    content += `<div class="markdown-content">${md(iteration.synthesis.raw)}</div>`;
  }

  // Structured debate rounds (only if separate from synthesis)
  if (iteration.rounds.length > 0 && iteration.transcriptRaw !== iteration.synthesis?.raw) {
    content += `
    <div class="section-header"><h2>Debate Transcript</h2><span class="section-count">${iteration.rounds.length} rounds</span></div>`;

    for (const round of iteration.rounds) {
      content += `
      <details>
        <summary>${esc(round.title)}</summary>
        <div class="details-content">
          ${round.exchanges.map((ex) => renderExchange(ex, false, false)).join("")}
          ${round.socrate.length > 0 ? `<h3>Socrate Intervenes</h3>${round.socrate.map((ex) => renderExchange(ex, true, false)).join("")}` : ""}
          ${round.assemblyReactions.length > 0 ? `<h3>Assembly Reactions</h3>${round.assemblyReactions.map((ex) => renderExchange(ex, false, true)).join("")}` : ""}
        </div>
      </details>`;
    }
  }

  // Nav between iterations
  const iterIndex = topic.iterations.findIndex((i) => i.number === iteration.number);
  const prev = topic.iterations[iterIndex - 1];
  const next = topic.iterations[iterIndex + 1];
  let iterNav = `<hr><div style="display:flex;justify-content:space-between;font-size:0.85rem;">`;
  iterNav += prev
    ? `<a href="/${topic.slug}/iteration-${prev.number}.html">&larr; Iteration ${prev.number}: ${esc(formatStructure(prev.structure))}</a>`
    : `<span></span>`;
  iterNav += next
    ? `<a href="/${topic.slug}/iteration-${next.number}.html">Iteration ${next.number}: ${esc(formatStructure(next.structure))} &rarr;</a>`
    : `<span></span>`;
  iterNav += `</div>`;

  content += iterNav;

  return layout(
    `Iteration ${iteration.number} — ${topic.title}`,
    content,
    nav,
    bc
  );
}

function renderExchange(
  ex: { speaker: string; content: string },
  isSocrate: boolean,
  isReaction: boolean
): string {
  const cls = isSocrate
    ? "debate-exchange debate-socrate"
    : isReaction
      ? "debate-exchange debate-reaction"
      : "debate-exchange";

  return `
    <div class="${cls}">
      <div class="debate-speaker">
        <span class="debate-speaker-dot" style="background:${isSocrate ? "var(--color-socrate)" : "var(--color-accent)"}"></span>
        ${esc(ex.speaker)}
      </div>
      <div class="debate-content">${md(ex.content)}</div>
    </div>`;
}

export function renderDeliverables(workspace: Workspace, topic: Topic): string | null {
  if (topic.deliverables.length === 0) return null;
  const nav = buildNav(workspace, `${topic.slug}/deliverables`);
  const bc = breadcrumb(
    { label: "Home", href: "/index.html" },
    { label: truncate(topic.title, 30), href: `/${topic.slug}/index.html` },
    { label: "Deliverables" }
  );

  const sections = topic.deliverables
    .map((d) => `
    <div id="${d.slug}">
      <div class="markdown-content">${md(d.content)}</div>
      <hr>
    </div>`)
    .join("");

  const content = `
    <h1>Deliverables</h1>
    <p class="page-subtitle">${topic.deliverables.length} output document${topic.deliverables.length > 1 ? "s" : ""}</p>
    ${sections}`;

  return layout(`Deliverables — ${topic.title}`, content, nav, bc);
}

export function renderVerification(workspace: Workspace, topic: Topic): string | null {
  if (topic.verification.length === 0) return null;
  const nav = buildNav(workspace, `${topic.slug}/verification`);
  const bc = breadcrumb(
    { label: "Home", href: "/index.html" },
    { label: truncate(topic.title, 30), href: `/${topic.slug}/index.html` },
    { label: "Verification" }
  );

  const sections = topic.verification
    .map((v) => `
    <div id="${v.type}">
      <div class="markdown-content">${md(v.content)}</div>
      <hr>
    </div>`)
    .join("");

  const content = `
    <h1>Verification Reports</h1>
    <p class="page-subtitle">${topic.verification.length} verification report${topic.verification.length > 1 ? "s" : ""}</p>
    ${sections}`;

  return layout(`Verification — ${topic.title}`, content, nav, bc);
}
