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
  FollowUp,
  ReferenceLibrary,
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

    if (topic.referenceLibrary) {
      html += `
    <a href="/${topic.slug}/reference-library.html"${activePath === `${topic.slug}/reference-library` ? ' class="active"' : ""}>
      <span class="nav-icon">&#9783;</span> Reference Library
    </a>`;
    }

    if (topic.followUps.length > 0) {
      html += `
    <a href="/${topic.slug}/trajectory.html"${activePath === `${topic.slug}/trajectory` ? ' class="active"' : ""}>
      <span class="nav-icon">&#8634;</span> Trajectory
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

  // Aggregate stats
  const totalFollowUps = workspace.topics.reduce((n, t) => n + t.followUps.length, 0);
  const totalCharacters = workspace.topics.reduce((n, t) => n + t.characters.length, 0);

  // Recent activity across all topics
  const allFollowUps = workspace.topics
    .flatMap((t) => t.followUps.map((fu) => ({ ...fu, topicSlug: t.slug, topicTitle: t.title })))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 5);

  let recentHtml = "";
  if (allFollowUps.length > 0) {
    const items = allFollowUps.map((fu) => `
      <div class="activity-item">
        <div class="activity-question"><a href="/${fu.topicSlug}/trajectory.html">${esc(truncate(fu.question, 80))}</a></div>
        <div class="activity-meta">
          <span>${esc(fu.topicTitle.replace(/\s*—\s*Final.*$/, "").replace(/\s*--\s*Assembly.*$/, ""))}</span>
          ${fu.mode ? `<span class="badge badge-tag">${esc(fu.mode)}</span>` : ""}
          ${fu.timestamp ? `<span class="activity-time">${esc(fu.timestamp)}</span>` : ""}
        </div>
      </div>`).join("");

    recentHtml = `
    <div class="dashboard-section">
      <div class="section-header"><h2>Recent Activity</h2><span class="section-count">${totalFollowUps} follow-ups</span></div>
      ${items}
    </div>`;
  }

  const topicCards = workspace.topics
    .map((topic) => {
      const lastFollowUp = topic.followUps.length > 0
        ? topic.followUps[topic.followUps.length - 1]
        : null;

      const meta = [
        topic.characters.length > 0 ? `${topic.characters.length} characters` : null,
        topic.iterations.length > 0 ? `${topic.iterations.length} iterations` : null,
        topic.synthesis ? "synthesis" : null,
        topic.deliverables.length > 0 ? `${topic.deliverables.length} deliverable${topic.deliverables.length > 1 ? "s" : ""}` : null,
        topic.followUps.length > 0 ? `${topic.followUps.length} follow-up${topic.followUps.length > 1 ? "s" : ""}` : null,
      ].filter(Boolean).join(" &middot; ");

      let summary = "";
      if (topic.synthesis) {
        const highConf = topic.synthesis.convergence.find((c) => c.confidence === "high");
        const first = highConf ?? topic.synthesis.convergence[0];
        if (first) summary = truncate(first.claim, 200);
      }

      const lastActivity = lastFollowUp
        ? `<div class="topic-last-activity">Latest: ${esc(truncate(lastFollowUp.question, 60))}</div>`
        : "";

      return `
    <div class="topic-card">
      <h2><a href="/${topic.slug}/index.html">${esc(topic.title.replace(/\s*—\s*Final.*$/, "").replace(/\s*--\s*Assembly.*$/, ""))}</a></h2>
      <div class="topic-meta">${meta}</div>
      ${summary ? `<div class="topic-summary">${esc(summary)}</div>` : ""}
      ${lastActivity}
    </div>`;
    })
    .join("\n");

  const statsLine = [
    `${workspace.topics.length} topic${workspace.topics.length !== 1 ? "s" : ""}`,
    totalCharacters > 0 ? `${totalCharacters} characters` : null,
    totalFollowUps > 0 ? `${totalFollowUps} follow-ups` : null,
  ].filter(Boolean).join(" &middot; ");

  const content = `
    <h1>Assembly Workspace</h1>
    <p class="page-subtitle">${statsLine}</p>
    ${recentHtml}
    <div class="section-header"><h2>Topics</h2><span class="section-count">${workspace.topics.length}</span></div>
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

  // Reference Library
  let refHtml = "";
  if (topic.referenceLibrary) {
    refHtml = `
    <div class="section-header"><h2>Reference Library</h2></div>
    <div class="action-group">
      <a href="/${topic.slug}/reference-library.html" class="action-pill">
        <span class="pill-icon">&#9783;</span> Intellectual Traditions &amp; Evidence
      </a>
    </div>`;
  }

  // Trajectory
  let trajHtml = "";
  if (topic.followUps.length > 0) {
    trajHtml = `
    <div class="section-header"><h2>Thinking Trajectory</h2><span class="section-count">${topic.followUps.length} follow-ups</span></div>
    <div class="action-group">
      <a href="/${topic.slug}/trajectory.html" class="action-pill">
        <span class="pill-icon">&#8634;</span> View Deliberation History
      </a>
    </div>`;
  }

  const content = `
    <h1>${esc(topic.title.replace(/\s*—\s*Final.*$/, "").replace(/\s*--\s*Assembly.*$/, ""))}</h1>
    <p class="page-subtitle">${meta}</p>
    ${heroHtml}
    ${actions}
    ${iterHtml}
    ${delHtml}
    ${verHtml}
    ${refHtml}
    ${trajHtml}`;

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

  const followUpHtml = renderFollowUpSection(topic, "synthesis");

  const content = `
    <h1>${esc(synth.title)}</h1>
    <p class="page-subtitle">Final synthesis across all debate iterations</p>
    <div class="markdown-content">${md(synth.raw)}</div>
    ${followUpHtml}`;

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

  // Debate history
  const debateHistory: Array<{ type: string; label: string; excerpt: string; link: string }> = [];

  for (const iter of topic.iterations) {
    for (const round of iter.rounds) {
      for (const ex of [...round.exchanges, ...round.assemblyReactions, ...round.socrate]) {
        if (ex.speaker === character.name) {
          debateHistory.push({
            type: "iteration",
            label: `Iteration ${iter.number}: ${formatStructure(iter.structure)} — ${round.title}`,
            excerpt: truncate(ex.content, 150),
            link: `/${topic.slug}/iteration-${iter.number}.html`,
          });
        }
      }
    }
  }

  for (const fu of topic.followUps) {
    for (const r of fu.responses) {
      if (r.speaker === character.name) {
        debateHistory.push({
          type: "follow-up",
          label: truncate(fu.question, 80),
          excerpt: truncate(r.content, 150),
          link: `/${topic.slug}/trajectory.html`,
        });
      }
    }
  }

  if (debateHistory.length > 0) {
    sections += `<h2>Debate History</h2>
      <p style="color:var(--color-text-secondary);font-size:0.85rem;margin-bottom:1rem;">${debateHistory.length} contributions across debates and follow-ups</p>`;

    for (const entry of debateHistory) {
      const badge = entry.type === "follow-up" ? '<span class="badge badge-tag">follow-up</span>' : "";
      sections += `
      <details>
        <summary>${esc(entry.label)} ${badge}</summary>
        <div class="details-content">
          <p>${esc(entry.excerpt)}</p>
          <a href="${entry.link}" style="font-size:0.82rem;">View in context &rarr;</a>
        </div>
      </details>`;
    }
  }

  // Follow-up section for character profile
  const followUpHtml = renderFollowUpSection(topic, `character-${character.number}`, character.name);

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
    `${sections}${followUpHtml}${charNav}`,
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

  content += renderFollowUpSection(topic, `iteration-${iteration.number}`);

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


// ─── Trajectory Page ───

export function renderTrajectory(workspace: Workspace, topic: Topic): string {
  const nav = buildNav(workspace, `${topic.slug}/trajectory`);
  const bc = breadcrumb(
    { label: "Home", href: "/index.html" },
    { label: truncate(topic.title, 30), href: `/${topic.slug}/index.html` },
    { label: "Trajectory" }
  );

  const colorMap: Record<string, string> = {};
  topic.characters.forEach((char, i) => {
    colorMap[char.name] = avatarColor(i);
  });

  // Build timeline entries: iterations + follow-ups, sorted chronologically
  let timelineHtml = "";

  // Iterations as foundational events
  for (const iter of topic.iterations) {
    const speakerNames = new Set<string>();
    for (const round of iter.rounds) {
      for (const ex of [...round.exchanges, ...round.assemblyReactions, ...round.socrate]) {
        speakerNames.add(ex.speaker);
      }
    }
    const participants = [...speakerNames]
      .filter((s) => colorMap[s])
      .map((s) => `<span class="trajectory-avatar-sm" style="background:${colorMap[s]}">${initials(s)}</span>`)
      .join("");

    timelineHtml += `
    <div class="trajectory-entry trajectory-iteration">
      <div class="trajectory-marker"></div>
      <div class="trajectory-content">
        <div class="trajectory-label">Debate Iteration ${iter.number}</div>
        <div class="trajectory-title">
          <a href="/${topic.slug}/iteration-${iter.number}.html">${esc(formatStructure(iter.structure))}</a>
        </div>
        <div class="trajectory-participants">${participants}</div>
        ${iter.rounds.length > 0 ? `<div class="trajectory-detail">${iter.rounds.length} rounds</div>` : ""}
      </div>
    </div>`;
  }

  // Follow-ups
  for (const fu of topic.followUps) {
    const respondents = fu.responses
      .map((r) => {
        const color = colorMap[r.speaker] ?? "var(--color-accent)";
        return `<span class="trajectory-avatar-sm" style="background:${color}">${initials(r.speaker)}</span>`;
      })
      .join("");

    const preview = fu.responses.length > 0
      ? truncate(fu.responses[0].content, 120)
      : "";

    timelineHtml += `
    <div class="trajectory-entry trajectory-followup">
      <div class="trajectory-marker"></div>
      <div class="trajectory-content">
        <div class="trajectory-meta">
          ${fu.timestamp ? `<span class="trajectory-time">${esc(fu.timestamp)}</span>` : ""}
          ${fu.mode ? `<span class="badge badge-tag">${esc(fu.mode)}</span>` : ""}
          ${fu.context ? `<span class="trajectory-context">from ${esc(fu.context)}</span>` : ""}
        </div>
        <div class="trajectory-question">${esc(fu.question)}</div>
        <div class="trajectory-participants">${respondents}</div>
        ${preview ? `<div class="trajectory-preview">${esc(preview)}</div>` : ""}
      </div>
    </div>`;
  }

  // Detect recurring tensions: characters who clash across multiple follow-ups
  const clashCounts = new Map<string, number>();
  for (const fu of topic.followUps) {
    if (fu.responses.length >= 2) {
      const speakers = fu.responses.map((r) => r.speaker).sort();
      for (let i = 0; i < speakers.length; i++) {
        for (let j = i + 1; j < speakers.length; j++) {
          const key = `${speakers[i]}|${speakers[j]}`;
          clashCounts.set(key, (clashCounts.get(key) ?? 0) + 1);
        }
      }
    }
  }

  let tensionsHtml = "";
  const tensions = [...clashCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1]);

  if (tensions.length > 0) {
    const tensionItems = tensions.map(([pair, count]) => {
      const [a, b] = pair.split("|");
      const colorA = colorMap[a] ?? "var(--color-accent)";
      const colorB = colorMap[b] ?? "var(--color-accent)";
      return `
        <div class="tension-pair">
          <span class="trajectory-avatar-sm" style="background:${colorA}">${initials(a)}</span>
          <span class="tension-vs">vs</span>
          <span class="trajectory-avatar-sm" style="background:${colorB}">${initials(b)}</span>
          <span class="tension-names">${esc(a)} &amp; ${esc(b)}</span>
          <span class="badge badge-tag">${count} exchanges</span>
        </div>`;
    }).join("");

    tensionsHtml = `
    <div class="trajectory-tensions">
      <h3>Recurring Tensions</h3>
      ${tensionItems}
    </div>`;
  }

  const content = `
    <h1>Thinking Trajectory</h1>
    <p class="page-subtitle">Chronological history of deliberation — ${topic.iterations.length} iterations, ${topic.followUps.length} follow-ups</p>
    ${tensionsHtml}
    <div class="trajectory-timeline">
      ${timelineHtml}
    </div>`;

  return layout(`Trajectory — ${topic.title}`, content, nav, bc);
}

// ─── Structured Reference Library ───

export function renderStructuredReferenceLibrary(workspace: Workspace, topic: Topic): string | null {
  if (!topic.referenceLibrary) return null;

  const nav = buildNav(workspace, `${topic.slug}/reference-library`);
  const bc = breadcrumb(
    { label: "Home", href: "/index.html" },
    { label: truncate(topic.title, 30), href: `/${topic.slug}/index.html` },
    { label: "Reference Library" }
  );

  const parsed = topic.parsedReferenceLibrary;

  // Fallback to raw markdown if parsing failed
  if (!parsed) {
    const followUpHtml = renderFollowUpSection(topic, "reference-library");
    const content = `
      <h1>Reference Library</h1>
      <p class="page-subtitle">Intellectual traditions and empirical evidence grounding the assembly debate</p>
      <div class="markdown-content">${md(topic.referenceLibrary)}</div>
      ${followUpHtml}`;
    return layout(`Reference Library — ${topic.title}`, content, nav, bc);
  }

  // Build character color lookup
  const colorMap: Record<string, string> = {};
  topic.characters.forEach((char, i) => {
    colorMap[char.name] = avatarColor(i);
  });

  // Fuzzy match: find color by first name or substring match
  function findCharacterColor(name: string): string {
    if (colorMap[name]) return colorMap[name];
    const lower = name.toLowerCase();
    for (const fullName of Object.keys(colorMap)) {
      const firstName = fullName.split(/\s+/)[0].toLowerCase();
      if (firstName === lower || fullName.toLowerCase().includes(lower)) {
        return colorMap[fullName];
      }
    }
    return "var(--color-accent)";
  }

  let sectionsHtml = "";
  for (const section of parsed.sections) {
    let subsHtml = "";
    for (const sub of section.subsections) {
      // Character badge
      let charBadge = "";
      if (sub.character) {
        const color = findCharacterColor(sub.character);
        charBadge = `<span class="ref-char-badge" style="background:${color}">${initials(sub.character)}</span>`;
      }
      const tagBadge = sub.tag ? `<span class="badge badge-tag">${esc(sub.tag)}</span>` : "";

      const entriesHtml = sub.entries.map((entry) => {
        const authorWork = [
          entry.author ? `<strong>${esc(entry.author)}</strong>` : "",
          entry.work ? `<em>${esc(entry.work)}</em>` : "",
          entry.year ? `(${esc(entry.year)})` : "",
        ].filter(Boolean).join(" — ");

        return `
          <div class="ref-entry">
            ${authorWork ? `<div class="ref-entry-title">${authorWork}</div>` : ""}
            ${entry.description ? `<div class="ref-entry-desc">${esc(entry.description)}</div>` : ""}
          </div>`;
      }).join("");

      subsHtml += `
        <div class="ref-card">
          <div class="ref-card-header">
            ${charBadge}
            <div>
              <div class="ref-card-title">${esc(sub.title)}</div>
              ${sub.character ? `<div class="ref-card-character">${esc(sub.character)} ${tagBadge}</div>` : ""}
            </div>
          </div>
          ${entriesHtml}
        </div>`;
    }

    sectionsHtml += `
      <div class="ref-section">
        <h2>${esc(section.title)}</h2>
        <div class="ref-grid">${subsHtml}</div>
      </div>`;
  }

  // Cross-readings
  let crossHtml = "";
  if (parsed.crossReadings.length > 0) {
    const items = parsed.crossReadings.map((cr) => {
      const color = findCharacterColor(cr.character);
      return `
        <div class="cross-reading">
          <span class="trajectory-avatar-sm" style="background:${color}">${initials(cr.character)}</span>
          <div>
            <strong>${esc(cr.character)}</strong> must engage: ${esc(cr.assignment)}
          </div>
        </div>`;
    }).join("");

    crossHtml = `
      <div class="ref-section">
        <h2>Cross-Reading Assignments</h2>
        <div class="cross-reading-list">${items}</div>
      </div>`;
  }

  const followUpHtml = renderFollowUpSection(topic, "reference-library");

  const content = `
    <h1>Reference Library</h1>
    <p class="page-subtitle">Intellectual traditions and empirical evidence grounding the assembly debate</p>
    ${sectionsHtml}
    ${crossHtml}
    ${followUpHtml}`;

  return layout(`Reference Library — ${topic.title}`, content, nav, bc);
}

// ─── Follow-up Section ───

type PageType = "character" | "reference-library" | "debate";

function detectPageType(pageContext: string): PageType {
  if (pageContext === "reference-library") return "reference-library";
  if (pageContext.startsWith("character-")) return "character";
  return "debate";
}

function renderFollowUpSection(topic: Topic, pageContext: string, defaultCharacter?: string): string {
  // Build character color map for the inline JS
  const colorMap: Record<string, string> = {};
  topic.characters.forEach((char, i) => {
    colorMap[char.name] = avatarColor(i);
  });

  // Render persisted follow-ups
  const persistedHtml = topic.followUps
    .map((fu) => renderPersistedFollowUp(fu, colorMap))
    .join("");

  // Character names for the request
  const characterNames = topic.characters.map((c) => c.name);

  const pageType = detectPageType(pageContext);

  // Page-type-specific heading, subtitle, placeholder, modes
  let heading: string;
  let subtitle: string;
  let placeholder: string;
  let modesHtml: string;

  if (pageType === "reference-library") {
    heading = "Explore the Sources";
    subtitle = "Ask about the intellectual traditions, evidence, and connections in this library";
    placeholder = "What would you like to understand about these sources?";
    modesHtml = `
          <label class="follow-up-mode-label">
            <input type="radio" name="follow-up-mode" value="explore-explain" checked>
            <span>Explain</span>
          </label>
          <label class="follow-up-mode-label">
            <input type="radio" name="follow-up-mode" value="explore-connect">
            <span>Connect</span>
          </label>
          <label class="follow-up-mode-label">
            <input type="radio" name="follow-up-mode" value="explore-deep-dive">
            <span>Deep dive</span>
          </label>`;
  } else if (pageType === "character") {
    heading = `Think Alongside ${esc(defaultCharacter!)}`;
    subtitle = "Challenge this character's framework with a question";
    placeholder = `Ask ${defaultCharacter} a question...`;
    modesHtml = `
          <label class="follow-up-mode-label">
            <input type="radio" name="follow-up-mode" value="ask-character" checked>
            <span>Think alongside</span>
          </label>
          <label class="follow-up-mode-label">
            <input type="radio" name="follow-up-mode" value="multi-character">
            <span>Bring in the assembly</span>
          </label>
          <label class="follow-up-mode-label">
            <input type="radio" name="follow-up-mode" value="reconvene">
            <span>Challenge me</span>
          </label>`;
  } else {
    heading = "Ask the Assembly";
    subtitle = "Continue the deliberation with a follow-up question";
    placeholder = "Ask a follow-up question...";
    modesHtml = `
          <label class="follow-up-mode-label">
            <input type="radio" name="follow-up-mode" value="multi-character" checked>
            <span>Multi-character</span>
          </label>
          <label class="follow-up-mode-label">
            <input type="radio" name="follow-up-mode" value="reconvene">
            <span>Reconvene debate</span>
          </label>
          <label class="follow-up-mode-label">
            <input type="radio" name="follow-up-mode" value="ask-character">
            <span>Single character</span>
          </label>`;
  }

  // Character picker (not shown for reference-library)
  const characterPickerHtml = pageType !== "reference-library" ? `
        <div class="follow-up-characters" id="follow-up-characters"></div>` : "";

  return `
    <div class="follow-up-divider"></div>
    <div class="follow-up-container" id="follow-up-container">
      <h2 class="follow-up-heading">${heading}</h2>
      <p class="follow-up-subtitle">${subtitle}</p>
      ${persistedHtml}
      <div id="follow-up-live"></div>
      <form class="follow-up-form" id="follow-up-form">
        <div class="follow-up-input-row">
          <input type="text" class="follow-up-input" id="follow-up-input"
                 placeholder="${esc(placeholder)}" autocomplete="off">
          <button type="submit" class="follow-up-button" id="follow-up-button">Ask</button>
        </div>
        <div class="follow-up-mode-row">
          ${modesHtml}
        </div>
        ${characterPickerHtml}
      </form>
    </div>
    ${renderFollowUpScript(topic.slug, pageContext, characterNames, colorMap, defaultCharacter)}`;
}

function renderPersistedFollowUp(fu: FollowUp, colorMap: Record<string, string>): string {
  const responsesHtml = fu.responses.map((r) => {
    const color = colorMap[r.speaker] ?? "var(--color-accent)";
    return `
      <div class="follow-up-exchange">
        <div class="debate-speaker">
          <span class="debate-speaker-dot" style="background:${color}"></span>
          ${esc(r.speaker)}
        </div>
        <div class="debate-content">${md(r.content)}</div>
      </div>`;
  }).join("");

  return `
    <div class="follow-up-response follow-up-persisted">
      <div class="follow-up-meta">
        ${fu.timestamp ? `<span class="follow-up-time">${esc(fu.timestamp)}</span>` : ""}
        ${fu.mode ? `<span class="badge badge-tag">${esc(fu.mode)}</span>` : ""}
      </div>
      <div class="follow-up-question-display">
        <strong>Q:</strong> ${esc(fu.question)}
      </div>
      ${responsesHtml}
    </div>`;
}

function renderFollowUpScript(
  topicSlug: string,
  pageContext: string,
  characterNames: string[],
  colorMap: Record<string, string>,
  defaultCharacter?: string
): string {
  return `<script>
(function() {
  var TOPIC = ${JSON.stringify(topicSlug)};
  var PAGE_CONTEXT = ${JSON.stringify(pageContext)};
  var CHARACTERS = ${JSON.stringify(characterNames)};
  var COLORS = ${JSON.stringify(colorMap)};
  var DEFAULT_CHARACTER = ${JSON.stringify(defaultCharacter ?? "")};
  var PAGE_TYPE = ${JSON.stringify(detectPageType(pageContext))};

  var form = document.getElementById('follow-up-form');
  var input = document.getElementById('follow-up-input');
  var button = document.getElementById('follow-up-button');
  var liveArea = document.getElementById('follow-up-live');
  var charContainer = document.getElementById('follow-up-characters');

  var selectedCharacters = new Set();

  function getInitials(name) {
    var parts = name.replace(/^(Dr\\.|Colonel|Col\\.)\\s*/i, '').split(/\\s+/);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function renderCharacterPicker() {
    if (!charContainer || PAGE_TYPE === 'reference-library') return;

    var mode = document.querySelector('input[name="follow-up-mode"]:checked').value;

    // Reference library modes — hide picker
    if (mode.startsWith('explore-')) {
      charContainer.style.display = 'none';
      return;
    }

    // Reconvene — show "all characters" label
    if (mode === 'reconvene') {
      charContainer.style.display = 'block';
      charContainer.innerHTML = '<div class="follow-up-char-label">All characters will debate</div>';
      selectedCharacters = new Set(CHARACTERS);
      return;
    }

    charContainer.style.display = 'block';
    var isSingle = (mode === 'ask-character');

    // Build toggle buttons
    var html = '';
    if (isSingle) {
      html += '<div class="follow-up-char-label">Choose a character:</div>';
    } else {
      html += '<div class="follow-up-char-label">Select characters:</div>';
    }
    html += '<div class="follow-up-char-row">';

    for (var i = 0; i < CHARACTERS.length; i++) {
      var name = CHARACTERS[i];
      var color = COLORS[name] || 'var(--color-accent)';
      var isSelected = selectedCharacters.has(name);
      var locked = (PAGE_TYPE === 'character' && name === DEFAULT_CHARACTER);
      html += '<button type="button" class="follow-up-char-toggle' + (isSelected ? ' selected' : '') + (locked ? ' locked' : '') + '"'
        + ' data-name="' + escapeHtml(name) + '"'
        + ' style="--char-color:' + color + '">'
        + '<span class="follow-up-char-avatar" style="background:' + color + '">' + getInitials(name) + '</span>'
        + '<span class="follow-up-char-name">' + escapeHtml(name.split(' ')[0]) + '</span>'
        + '</button>';
    }
    html += '</div>';
    charContainer.innerHTML = html;

    // Bind toggle clicks
    var toggles = charContainer.querySelectorAll('.follow-up-char-toggle');
    for (var j = 0; j < toggles.length; j++) {
      toggles[j].addEventListener('click', function() {
        var charName = this.getAttribute('data-name');
        if (this.classList.contains('locked')) return;

        if (isSingle) {
          // Deselect all others, select this one
          selectedCharacters.clear();
          selectedCharacters.add(charName);
          if (DEFAULT_CHARACTER && PAGE_TYPE === 'character') selectedCharacters.add(DEFAULT_CHARACTER);
          var allToggles = charContainer.querySelectorAll('.follow-up-char-toggle');
          for (var k = 0; k < allToggles.length; k++) {
            allToggles[k].classList.toggle('selected', selectedCharacters.has(allToggles[k].getAttribute('data-name')));
          }
        } else {
          // Toggle this character
          if (selectedCharacters.has(charName)) {
            selectedCharacters.delete(charName);
            this.classList.remove('selected');
          } else {
            selectedCharacters.add(charName);
            this.classList.add('selected');
          }
        }
      });
    }
  }

  // Initialize selected characters based on default
  function initializeSelection() {
    selectedCharacters.clear();
    var mode = document.querySelector('input[name="follow-up-mode"]:checked').value;

    if (PAGE_TYPE === 'character' && DEFAULT_CHARACTER) {
      selectedCharacters.add(DEFAULT_CHARACTER);
      if (mode === 'multi-character') {
        // Pre-select 1-2 others
        for (var i = 0; i < CHARACTERS.length && selectedCharacters.size < 3; i++) {
          selectedCharacters.add(CHARACTERS[i]);
        }
      }
    } else if (mode === 'ask-character' && CHARACTERS.length > 0) {
      selectedCharacters.add(CHARACTERS[0]);
    } else if (mode === 'multi-character') {
      // Pre-select first 2-3
      for (var i = 0; i < CHARACTERS.length && i < 3; i++) {
        selectedCharacters.add(CHARACTERS[i]);
      }
    } else if (mode === 'reconvene') {
      for (var i = 0; i < CHARACTERS.length; i++) {
        selectedCharacters.add(CHARACTERS[i]);
      }
    }
  }

  // Listen for mode changes
  var modeRadios = document.querySelectorAll('input[name="follow-up-mode"]');
  for (var m = 0; m < modeRadios.length; m++) {
    modeRadios[m].addEventListener('change', function() {
      initializeSelection();
      renderCharacterPicker();
    });
  }

  // Initial render
  initializeSelection();
  renderCharacterPicker();

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var question = input.value.trim();
    if (!question) return;

    var mode = document.querySelector('input[name="follow-up-mode"]:checked').value;

    // Build characters array from selection
    var chars = mode.startsWith('explore-') ? [] : Array.from(selectedCharacters);

    input.disabled = true;
    button.disabled = true;
    button.textContent = 'Thinking...';

    // Create response container
    var responseDiv = document.createElement('div');
    responseDiv.className = 'follow-up-response follow-up-streaming';

    var questionDiv = document.createElement('div');
    questionDiv.className = 'follow-up-question-display';
    questionDiv.innerHTML = '<strong>Q:</strong> ' + escapeHtml(question);
    responseDiv.appendChild(questionDiv);

    var contentDiv = document.createElement('div');
    contentDiv.className = 'follow-up-content';
    responseDiv.appendChild(contentDiv);

    var loadingDiv = document.createElement('div');
    loadingDiv.className = 'follow-up-loading';
    loadingDiv.textContent = mode.startsWith('explore-') ? 'Researching sources...' : 'Assembly is deliberating...';
    contentDiv.appendChild(loadingDiv);

    liveArea.appendChild(responseDiv);
    responseDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    var body = JSON.stringify({
      question: question,
      topicSlug: TOPIC,
      characters: chars,
      context: { page: PAGE_CONTEXT },
      mode: mode
    });

    fetch('/api/follow-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body
    }).then(function(response) {
      if (!response.ok) throw new Error('Server error: ' + response.status);
      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      var fullText = '';
      var loadingRemoved = false;

      function processChunk() {
        return reader.read().then(function(result) {
          if (result.done) {
            finishResponse(contentDiv, fullText, responseDiv);
            return;
          }

          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split('\\n');
          buffer = lines.pop() || '';

          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line.startsWith('data: ')) continue;
            var jsonStr = line.slice(6);

            try {
              var event = JSON.parse(jsonStr);

              if (event.type === 'text') {
                if (!loadingRemoved) {
                  loadingDiv.remove();
                  loadingRemoved = true;
                }
                fullText += event.content;
                renderStreamedText(contentDiv, fullText);
              } else if (event.type === 'error') {
                if (!loadingRemoved) {
                  loadingDiv.remove();
                  loadingRemoved = true;
                }
                contentDiv.innerHTML = '<div class="follow-up-error">' + escapeHtml(event.content) + '</div>';
              }
            } catch(e) {
              // skip
            }
          }

          return processChunk();
        });
      }

      return processChunk();
    }).catch(function(err) {
      contentDiv.innerHTML = '<div class="follow-up-error">Failed to connect: ' + escapeHtml(err.message) + '</div>';
    }).finally(function() {
      input.disabled = false;
      button.disabled = false;
      button.textContent = 'Ask';
      input.value = '';
      input.focus();
    });
  });

  function renderStreamedText(container, text) {
    // Parse speaker attributions as they appear
    var parts = text.split(/(?=\\*\\*[A-Z])/);
    var html = '';
    var speakerRe = /^\\*\\*([^*]+?)(?:\\s*:)?\\*\\*\\s*([\\s\\S]*)/;

    for (var i = 0; i < parts.length; i++) {
      var match = parts[i].match(speakerRe);
      if (match) {
        var speaker = match[1].trim();
        var content = match[2].trim();
        var color = COLORS[speaker] || 'var(--color-accent)';
        html += '<div class="follow-up-exchange">';
        html += '<div class="debate-speaker"><span class="debate-speaker-dot" style="background:' + color + '"></span>' + escapeHtml(speaker) + '</div>';
        html += '<div class="debate-content">' + simpleMarkdown(content) + '</div>';
        html += '</div>';
      } else if (parts[i].trim()) {
        html += '<div class="debate-content">' + simpleMarkdown(parts[i]) + '</div>';
      }
    }

    container.innerHTML = html;
  }

  function finishResponse(container, fullText, responseDiv) {
    renderStreamedText(container, fullText);
    responseDiv.classList.remove('follow-up-streaming');
    responseDiv.classList.add('follow-up-complete');
  }

  function simpleMarkdown(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
      .replace(/\\*([^*]+)\\*/g, '<em>$1</em>')
      .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
      .replace(/\\n\\n/g, '</p><p>')
      .replace(/\\n/g, '<br>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
</script>`;
}
