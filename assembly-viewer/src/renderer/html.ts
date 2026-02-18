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

const STRUCTURE_DISPLAY_NAMES: Record<string, string> = {
  "grande-table": "Town Hall",
  "rapid-fire": "Crossfire",
  "deep-dive": "Deep Dive",
};

function formatStructure(s: string): string {
  return STRUCTURE_DISPLAY_NAMES[s] ?? s.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
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

// ─── Shared Attachment Widget ───

function renderAttachmentScript(): string {
  return `
<script>
(function() {
  var ALLOWED_EXT = ['.png','.jpg','.jpeg','.gif','.webp','.pdf','.txt','.csv','.md','.json','.ts','.js','.py','.html','.css','.xml','.yaml','.yml','.toml'];
  var IMAGE_EXT = ['.png','.jpg','.jpeg','.gif','.webp'];

  window.initAttachments = function(inputId) {
    var inputEl = document.getElementById(inputId);
    if (!inputEl) return null;
    var wrapper = inputEl.closest('.attachment-wrapper') || inputEl.parentElement;

    var attachedFiles = []; // { path, name, pending }

    // Create chips container
    var chipsRow = document.createElement('div');
    chipsRow.className = 'attachment-chips';
    wrapper.insertBefore(chipsRow, wrapper.firstChild);

    // Create attach button
    var attachBtn = document.createElement('button');
    attachBtn.type = 'button';
    attachBtn.className = 'attachment-btn';
    attachBtn.title = 'Attach file';
    attachBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>';
    inputEl.parentElement.insertBefore(attachBtn, inputEl.nextSibling);

    // Hidden file input
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    wrapper.appendChild(fileInput);

    attachBtn.addEventListener('click', function() { fileInput.click(); });
    fileInput.addEventListener('change', function() {
      if (fileInput.files) handleFiles(fileInput.files);
      fileInput.value = '';
    });

    // Drag and drop on the text input
    inputEl.addEventListener('dragover', function(e) {
      e.preventDefault();
      inputEl.classList.add('drag-over');
    });
    inputEl.addEventListener('dragleave', function() {
      inputEl.classList.remove('drag-over');
    });
    inputEl.addEventListener('drop', function(e) {
      e.preventDefault();
      inputEl.classList.remove('drag-over');
      if (e.dataTransfer && e.dataTransfer.files.length) {
        handleFiles(e.dataTransfer.files);
      }
    });

    function getExtension(name) {
      var dot = name.lastIndexOf('.');
      return dot >= 0 ? name.slice(dot).toLowerCase() : '';
    }

    function isImage(name) {
      return IMAGE_EXT.indexOf(getExtension(name)) >= 0;
    }

    function handleFiles(files) {
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        var ext = getExtension(file.name);
        if (ALLOWED_EXT.indexOf(ext) < 0) {
          alert('File type ' + ext + ' is not supported.');
          continue;
        }
        uploadFile(file);
      }
    }

    function uploadFile(file) {
      var entry = { path: '', name: file.name, pending: true };
      attachedFiles.push(entry);
      renderChips();

      var reader = new FileReader();
      reader.onload = function() {
        var base64 = reader.result.split(',')[1];
        fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, data: base64 })
        }).then(function(r) { return r.json(); }).then(function(data) {
          if (data.path) {
            entry.path = data.path;
            entry.pending = false;
          } else {
            var idx = attachedFiles.indexOf(entry);
            if (idx >= 0) attachedFiles.splice(idx, 1);
            alert('Upload failed: ' + (data.error || 'unknown error'));
          }
          renderChips();
        }).catch(function(err) {
          var idx = attachedFiles.indexOf(entry);
          if (idx >= 0) attachedFiles.splice(idx, 1);
          renderChips();
          alert('Upload failed: ' + err.message);
        });
      };

      // For images, also store thumbnail data URL
      if (isImage(file.name)) {
        var thumbReader = new FileReader();
        thumbReader.onload = function() {
          entry.thumbUrl = thumbReader.result;
          renderChips();
        };
        thumbReader.readAsDataURL(file);
      }

      reader.readAsDataURL(file);
    }

    function renderChips() {
      var html = '';
      for (var i = 0; i < attachedFiles.length; i++) {
        var f = attachedFiles[i];
        var pendingClass = f.pending ? ' pending' : '';
        var thumb = '';
        if (f.thumbUrl) {
          thumb = '<img class="attachment-chip-thumb" src="' + f.thumbUrl + '" alt="">';
        } else {
          thumb = '<span class="attachment-chip-icon">' + getFileIcon(f.name) + '</span>';
        }
        html += '<span class="attachment-chip' + pendingClass + '" data-idx="' + i + '">'
          + thumb
          + '<span class="attachment-chip-name">' + escHtml(truncName(f.name, 20)) + '</span>'
          + '<button type="button" class="attachment-chip-remove" data-idx="' + i + '">&times;</button>'
          + '</span>';
      }
      chipsRow.innerHTML = html;

      var removeBtns = chipsRow.querySelectorAll('.attachment-chip-remove');
      for (var j = 0; j < removeBtns.length; j++) {
        removeBtns[j].addEventListener('click', function() {
          var idx = parseInt(this.getAttribute('data-idx'));
          attachedFiles.splice(idx, 1);
          renderChips();
        });
      }
    }

    function getFileIcon(name) {
      var ext = getExtension(name);
      if (ext === '.pdf') return '\\ud83d\\udcc4';
      if (['.ts','.js','.py','.html','.css','.json','.xml'].indexOf(ext) >= 0) return '\\ud83d\\udcbb';
      return '\\ud83d\\udcc1';
    }

    function truncName(name, max) {
      if (name.length <= max) return name;
      var ext = getExtension(name);
      var base = name.slice(0, name.length - ext.length);
      var avail = max - ext.length - 1;
      if (avail < 3) return name.slice(0, max);
      return base.slice(0, avail) + '\\u2026' + ext;
    }

    function escHtml(t) {
      var d = document.createElement('div');
      d.textContent = t;
      return d.innerHTML;
    }

    return {
      getFiles: function() {
        return attachedFiles.filter(function(f) { return !f.pending && f.path; }).map(function(f) { return f.path; });
      },
      clear: function() {
        attachedFiles = [];
        renderChips();
      }
    };
  };
})();
</script>`;
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
  <button class="nav-hamburger" aria-label="Open menu" onclick="document.body.classList.toggle('nav-open')">&#9776;</button>
  <div class="nav-overlay" onclick="document.body.classList.remove('nav-open')"></div>
  ${nav}
  <main>
    ${bc}
    ${content}
  </main>
  ${renderAttachmentScript()}
  <script>
  (function() {
    // Konami code easter egg
    var konamiSeq = [38,38,40,40,37,39,37,39,66,65];
    var konamiIdx = 0;
    document.addEventListener('keydown', function(e) {
      if (e.keyCode === konamiSeq[konamiIdx]) {
        konamiIdx++;
        if (konamiIdx === konamiSeq.length) {
          konamiIdx = 0;
          var toast = document.createElement('div');
          toast.className = 'easter-egg-toast';
          toast.innerHTML = '&ldquo;The unexamined topic is not worth deliberating.&rdquo;<br>&mdash; Socrates, the Gadfly';
          document.body.appendChild(toast);
          setTimeout(function() { toast.classList.add('fading'); }, 3000);
          setTimeout(function() { toast.remove(); }, 3400);
        }
      } else {
        konamiIdx = e.keyCode === konamiSeq[0] ? 1 : 0;
      }
    });

    // Brand icon 5x rapid click
    var brandIcon = document.querySelector('.nav-brand-icon');
    if (brandIcon) {
      var clickTimes = [];
      brandIcon.addEventListener('click', function() {
        var now = Date.now();
        clickTimes.push(now);
        clickTimes = clickTimes.filter(function(t) { return now - t < 1500; });
        if (clickTimes.length >= 5) {
          clickTimes = [];
          var orig = brandIcon.textContent;
          brandIcon.textContent = '\u2696';
          brandIcon.style.fontSize = '0.85rem';
          setTimeout(function() { brandIcon.textContent = orig; brandIcon.style.fontSize = ''; }, 2000);
        }
      });
    }
  })();
  </script>
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
  <div class="nav-divider" data-topic="${esc(topic.slug)}"></div>
  <div class="nav-section" data-topic="${esc(topic.slug)}">
    <a href="/${topic.slug}/${topic.synthesis ? "synthesis" : "index"}.html" class="nav-section-title">${esc(shortTitle)}</a>`;

    if (topic.synthesis) {
      html += `
    <a href="/${topic.slug}/synthesis.html"${activePath === `${topic.slug}/synthesis` || activePath === topic.slug ? ' class="active"' : ""}>
      <span class="nav-icon">&#9733;</span> Consensus
    </a>`;
    }

    if (topic.characters.length > 0) {
      html += `
    <a href="/${topic.slug}/characters.html"${activePath === `${topic.slug}/characters` ? ' class="active"' : ""}>
      <span class="nav-icon">&#9823;</span> The Assembly
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

    if (topic.referenceLibrary) {
      html += `
    <a href="/${topic.slug}/reference-library.html"${activePath === `${topic.slug}/reference-library` ? ' class="active"' : ""}>
      <span class="nav-icon">&#9783;</span> Babylon's Library
    </a>`;
    }

    if (topic.followUps.length > 0) {
      html += `
    <a href="/${topic.slug}/trajectory.html"${activePath === `${topic.slug}/trajectory` ? ' class="active"' : ""}>
      <span class="nav-icon">&#8634;</span> Thinking Trail
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

function renderAssemblyLauncher(): string {
  return `
    <div class="assembly-launcher" id="assembly-launcher">
      <div class="assembly-launcher-header">
        <h2>Start a New Assembly</h2>
        <p>Six minds, one question. See what emerges.</p>
      </div>

      <form class="assembly-start-form" id="assembly-start-form">
        <div class="attachment-wrapper">
          <div class="assembly-start-input-row">
            <input type="text" id="assembly-topic" placeholder="What should the assembly deliberate on?" autocomplete="off" />
            <button type="submit" id="assembly-go-btn">Convene</button>
          </div>
        </div>
      </form>

      <div class="assembly-progress" id="assembly-progress" style="display:none">
        <p class="assembly-estimate" id="assembly-estimate">Estimated time: ~10 minutes</p>

        <div class="assembly-phase-bar" id="assembly-phase-bar">
          <div class="assembly-phase-dot" data-phase="analysis"><span class="dot"></span><span class="label">Analysis</span></div>
          <div class="assembly-phase-dot" data-phase="characters"><span class="dot"></span><span class="label">Characters</span></div>
          <div class="assembly-phase-dot" data-phase="references"><span class="dot"></span><span class="label">References</span></div>
          <div class="assembly-phase-dot" data-phase="debate"><span class="dot"></span><span class="label">Debate</span></div>
          <div class="assembly-phase-dot" data-phase="synthesis"><span class="dot"></span><span class="label">Synthesis</span></div>
          <div class="assembly-phase-dot" data-phase="deliverable"><span class="dot"></span><span class="label">Deliverable</span></div>
          <div class="assembly-phase-dot" data-phase="verification"><span class="dot"></span><span class="label">Verification</span></div>
        </div>

        <div class="assembly-completed-list" id="assembly-completed-list"></div>

        <div class="assembly-animation" id="assembly-animation">
          <div class="orbit-ring"><div class="orbit-dot"></div></div>
          <div class="orbit-ring ring-2"><div class="orbit-dot"></div></div>
          <div class="orbit-ring ring-3"><div class="orbit-dot"></div></div>
        </div>

        <div class="assembly-question" id="assembly-question" style="display:none">
          <p class="assembly-question-label">Claude is asking:</p>
          <div class="assembly-question-text" id="assembly-question-text"></div>
          <form class="assembly-input-form" id="assembly-input-form">
            <div class="attachment-wrapper">
              <div class="assembly-input-inner-row">
                <input type="text" id="assembly-input" placeholder="Type your answer..." autocomplete="off" />
                <button type="submit">Send</button>
              </div>
            </div>
          </form>
        </div>

        <div class="assembly-done" id="assembly-done" style="display:none">
          <p>Assembly complete!</p>
          <a id="assembly-done-link" href="#">View full assembly &rarr;</a>
        </div>

        <div class="assembly-new-session" id="assembly-new-session" style="display:none">
          <form class="assembly-start-form" id="assembly-restart-form">
            <div class="attachment-wrapper">
              <div class="assembly-start-input-row">
                <input type="text" id="assembly-restart-topic" placeholder="Start a different assembly..." autocomplete="off" />
                <button type="submit">Go</button>
              </div>
            </div>
          </form>
          <p class="assembly-restart-note">This will replace the current assembly in progress</p>
        </div>
      </div>
    </div>

    <script>
    (function() {
      var PHASE_ORDER = ['analysis', 'characters', 'references', 'debate', 'synthesis', 'deliverable', 'verification'];
      var PHASE_NAMES = {
        analysis: 'Analysis', characters: 'Characters', references: 'Reference Library',
        debate: 'Debate', synthesis: 'Synthesis', deliverable: 'Deliverable', verification: 'Verification'
      };

      var startForm = document.getElementById('assembly-start-form');
      var topicInput = document.getElementById('assembly-topic');
      var progress = document.getElementById('assembly-progress');
      var phaseBar = document.getElementById('assembly-phase-bar');
      var completedList = document.getElementById('assembly-completed-list');
      var animation = document.getElementById('assembly-animation');
      var questionArea = document.getElementById('assembly-question');
      var questionText = document.getElementById('assembly-question-text');
      var inputForm = document.getElementById('assembly-input-form');
      var inputField = document.getElementById('assembly-input');
      var doneArea = document.getElementById('assembly-done');
      var doneLink = document.getElementById('assembly-done-link');
      var newSessionArea = document.getElementById('assembly-new-session');
      var restartForm = document.getElementById('assembly-restart-form');
      var restartInput = document.getElementById('assembly-restart-topic');
      var estimateEl = document.getElementById('assembly-estimate');
      var evtSource = null;
      var startTime = null;
      var startAttachments = null;
      var inputAttachments = null;
      var restartAttachments = null;

      // Init attachments after DOM ready
      setTimeout(function() {
        startAttachments = window.initAttachments && window.initAttachments('assembly-topic');
        inputAttachments = window.initAttachments && window.initAttachments('assembly-input');
        restartAttachments = window.initAttachments && window.initAttachments('assembly-restart-topic');
      }, 0);

      function connectSSE() {
        if (evtSource) evtSource.close();
        evtSource = new EventSource('/api/assembly/stream');
        evtSource.onmessage = function(e) { handleEvent(JSON.parse(e.data)); };
        evtSource.onerror = function() {};
      }

      function launchSession(topic) {
        // Reset UI
        completedList.innerHTML = '';
        addedLinks = {};
        phaseBar.querySelectorAll('.assembly-phase-dot').forEach(function(d) {
          d.classList.remove('active', 'complete');
        });
        doneArea.style.display = 'none';
        questionArea.style.display = 'none';
        animation.style.display = '';
        newSessionArea.style.display = 'none';
        startTime = Date.now();
        updateEstimate();

        startForm.style.display = 'none';
        progress.style.display = 'block';

        var startFiles = startAttachments ? startAttachments.getFiles() : [];
        fetch('/api/assembly/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: topic, files: startFiles })
        }).then(function() {
          if (startAttachments) startAttachments.clear();
          connectSSE();
          // Show "start another" form after a short delay
          setTimeout(function() { newSessionArea.style.display = ''; }, 3000);
        }).catch(function(err) {
          startForm.style.display = '';
          progress.style.display = 'none';
        });
      }

      var goBtn = document.getElementById('assembly-go-btn');
      startForm.addEventListener('submit', function(e) {
        e.preventDefault();
        var topic = topicInput.value.trim();
        if (!topic) return;
        if (goBtn) { goBtn.classList.add('launching'); setTimeout(function() { goBtn.classList.remove('launching'); }, 300); }
        progress.classList.add('entering');
        launchSession(topic);
      });

      restartForm.addEventListener('submit', function(e) {
        e.preventDefault();
        var topic = restartInput.value.trim();
        if (topic) {
          restartInput.value = '';
          // Temporarily swap startAttachments so launchSession picks up restart files
          var origAttachments = startAttachments;
          startAttachments = restartAttachments;
          launchSession(topic);
          startAttachments = origAttachments;
        }
      });

      inputForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        var text = inputField.value.trim();
        if (!text) return;
        inputField.value = '';
        var inFiles = inputAttachments ? inputAttachments.getFiles() : [];
        questionArea.style.display = 'none';
        await fetch('/api/assembly/input', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text, files: inFiles })
        });
        if (inputAttachments) inputAttachments.clear();
      });

      function updateEstimate() {
        if (!startTime || !estimateEl) return;
        var elapsed = Math.floor((Date.now() - startTime) / 60000);
        if (elapsed < 1) {
          estimateEl.textContent = 'Estimated time: ~10 minutes';
        } else {
          var remaining = Math.max(0, 10 - elapsed);
          estimateEl.textContent = elapsed + 'm elapsed' + (remaining > 0 ? ' \u00b7 ~' + remaining + 'm remaining' : '');
        }
      }
      setInterval(updateEstimate, 30000);

      function handleEvent(data) {
        if (data.type === 'state') {
          if (data.completedPhases) {
            data.completedPhases.forEach(function(p) { markComplete(p); });
          }
          if (data.completedPhaseUrls) {
            PHASE_ORDER.forEach(function(p) {
              if (data.completedPhaseUrls[p]) addCompletedLink(p, data.completedPhaseUrls[p]);
            });
          }
          if (data.currentPhase) setActivePhase(data.currentPhase);
          if (data.status === 'waiting_for_input') questionArea.style.display = 'block';
          if (data.status === 'complete') {
            animation.style.display = 'none';
            doneArea.style.display = 'block';
            if (data.topicSlug) doneLink.href = '/' + data.topicSlug + '/index.html';
          }
          if (data.status !== 'complete') newSessionArea.style.display = '';
          return;
        }

        if (data.type === 'phase') setActivePhase(data.phase);

        if (data.type === 'phase_complete') {
          markComplete(data.phase);
          addCompletedLink(data.phase, data.url);
        }

        if (data.type === 'input_needed') {
          questionArea.style.display = 'block';
          if (data.content) questionText.textContent = data.content;
          inputField.focus();
        }

        if (data.type === 'text') {
          questionText.textContent = data.content.slice(-500);
        }

        if (data.type === 'input_received') {
          questionArea.style.display = 'none';
        }

        if (data.type === 'complete') {
          questionArea.style.display = 'none';
          estimateEl.textContent = '';

          // Curtain call: collapse orbits, then reveal done
          animation.classList.add('collapsing');
          setTimeout(function() {
            animation.style.display = 'none';
            doneArea.style.display = 'block';
            doneArea.classList.add('revealing');
          }, 550);

          if (data.topicSlug) doneLink.href = '/' + data.topicSlug + '/index.html';

          if (data.partial && data.missingPhases && data.missingPhases.length > 0) {
            var doneP = doneArea.querySelector('p');
            doneP.textContent = 'Assembly finished (some phases were skipped)';
            // Mark missing phases visually
            data.missingPhases.forEach(function(p) {
              var dot = phaseBar.querySelector('[data-phase="' + p + '"]');
              if (dot && !dot.classList.contains('complete')) {
                dot.classList.add('skipped');
              }
            });
          }

          if (evtSource) evtSource.close();
          newSessionArea.style.display = '';
        }

        if (data.type === 'error') {
          animation.style.display = 'none';
          questionArea.style.display = 'none';
          estimateEl.textContent = '';
          var errDiv = document.createElement('div');
          errDiv.className = 'assembly-error';
          errDiv.textContent = data.content;
          progress.appendChild(errDiv);
          if (evtSource) evtSource.close();
        }
      }

      function setActivePhase(phase) {
        var idx = PHASE_ORDER.indexOf(phase);
        phaseBar.querySelectorAll('.assembly-phase-dot').forEach(function(d) {
          var di = PHASE_ORDER.indexOf(d.dataset.phase);
          if (di < idx && !d.classList.contains('complete')) {
            // Mark all phases before the active one as complete
            d.classList.remove('active');
            d.classList.add('complete');
          }
          if (d.dataset.phase === phase && !d.classList.contains('complete')) {
            d.classList.add('active');
          }
        });
      }

      function markComplete(phase) {
        var idx = PHASE_ORDER.indexOf(phase);
        phaseBar.querySelectorAll('.assembly-phase-dot').forEach(function(d) {
          var di = PHASE_ORDER.indexOf(d.dataset.phase);
          if (di <= idx) {
            var wasComplete = d.classList.contains('complete');
            d.classList.remove('active');
            d.classList.add('complete');
            if (!wasComplete) {
              d.classList.add('just-completed');
              setTimeout(function() { d.classList.remove('just-completed'); }, 700);
            }
          }
        });
      }

      var addedLinks = {};
      function addCompletedLink(phase, url) {
        if (addedLinks[phase]) return;
        addedLinks[phase] = true;

        // Insert in phase order: find the right position
        var idx = PHASE_ORDER.indexOf(phase);
        var children = completedList.children;
        var insertBefore = null;
        for (var i = 0; i < children.length; i++) {
          var childPhase = children[i].dataset.phase;
          if (PHASE_ORDER.indexOf(childPhase) > idx) {
            insertBefore = children[i];
            break;
          }
        }

        var item = document.createElement('div');
        item.className = 'assembly-completed-phase';
        item.dataset.phase = phase;
        item.innerHTML = '<span class="check">&#10003;</span> ' + (PHASE_NAMES[phase] || phase) + ' ready &mdash; <a href="' + url + '">View &rarr;</a>';

        if (insertBefore) {
          completedList.insertBefore(item, insertBefore);
        } else {
          completedList.appendChild(item);
        }
      }

      // Check for existing session on page load
      fetch('/api/assembly/status').then(function(r) { return r.json(); }).then(function(status) {
        if (status && status.status && status.status !== 'idle') {
          startForm.style.display = 'none';
          progress.style.display = 'block';
          connectSSE();
          if (status.completedPhases) {
            status.completedPhases.forEach(function(p) { markComplete(p); });
          }
          if (status.completedPhaseUrls) {
            PHASE_ORDER.forEach(function(p) {
              if (status.completedPhaseUrls[p]) addCompletedLink(p, status.completedPhaseUrls[p]);
            });
          }
          if (status.currentPhase) setActivePhase(status.currentPhase);
          if (status.status === 'waiting_for_input') questionArea.style.display = 'block';
          if (status.status !== 'complete') newSessionArea.style.display = '';
        }
      }).catch(function() {});

      // Rotating placeholder text
      var placeholders = [
        'What should the assembly deliberate on?',
        'Pose a question worth six minds\u2026',
        'What truth deserves adversarial scrutiny?',
        'Name a conviction to stress-test\u2026'
      ];
      var phIdx = 0;
      var phFocused = false;
      topicInput.addEventListener('focus', function() { phFocused = true; });
      topicInput.addEventListener('blur', function() { phFocused = false; });
      setInterval(function() {
        if (phFocused || topicInput.value) return;
        phIdx = (phIdx + 1) % placeholders.length;
        topicInput.placeholder = placeholders[phIdx];
      }, 5000);
    })();
    </script>`;
}

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
    <div class="topic-card" data-slug="${esc(topic.slug)}">
      <button class="topic-delete-btn" title="Delete workspace">&times;</button>
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

  const demoBanner = workspace.isDemo ? `
    <div class="demo-banner">
      This is a demo assembly. Run <code>assembly-viewer --dir your-workspace/</code> to view your own analysis.
    </div>` : "";

  const content = `
    <h1>Assembly Workspace</h1>
    <p class="page-subtitle">${statsLine}</p>
    ${demoBanner}

    ${workspace.isDemo ? "" : renderAssemblyLauncher()}

    ${recentHtml}
    <div class="section-header"><h2>Topics</h2><span class="section-count">${workspace.topics.length}</span></div>
    ${topicCards}
    ${workspace.topics.length === 0 ? `<div class="empty-state"><p class="empty-state-icon">&#9783;</p><p>The assembly hall is quiet.<br>Launch a topic above to convene your first deliberation.</p></div>` : ""}

    <div class="confirm-overlay" id="delete-confirm">
      <div class="confirm-dialog">
        <h3>Delete workspace</h3>
        <p>This will permanently delete <strong id="delete-confirm-name"></strong> and all its data.</p>
        <div class="confirm-actions">
          <button class="confirm-cancel" id="delete-cancel">Cancel</button>
          <button class="confirm-delete" id="delete-proceed">Delete</button>
        </div>
      </div>
    </div>

    <script>
    (function() {
      var overlay = document.getElementById('delete-confirm');
      var nameEl = document.getElementById('delete-confirm-name');
      var cancelBtn = document.getElementById('delete-cancel');
      var proceedBtn = document.getElementById('delete-proceed');
      var pendingCard = null;
      var pendingSlug = null;

      document.addEventListener('click', function(e) {
        var btn = e.target.closest('.topic-delete-btn');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();

        pendingCard = btn.closest('.topic-card');
        pendingSlug = pendingCard.getAttribute('data-slug');
        var title = pendingCard.querySelector('h2 a');
        nameEl.textContent = title ? title.textContent : pendingSlug;
        overlay.classList.add('visible');
      });

      cancelBtn.addEventListener('click', function() {
        overlay.classList.remove('visible');
        pendingCard = null;
        pendingSlug = null;
      });

      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
          overlay.classList.remove('visible');
          pendingCard = null;
          pendingSlug = null;
        }
      });

      proceedBtn.addEventListener('click', function() {
        if (!pendingSlug || !pendingCard) return;
        var card = pendingCard;
        var slug = pendingSlug;

        overlay.classList.remove('visible');
        pendingCard = null;
        pendingSlug = null;

        card.style.transition = 'opacity 0.3s, max-height 0.3s';
        card.style.opacity = '0';
        card.style.maxHeight = card.offsetHeight + 'px';
        card.style.overflow = 'hidden';
        setTimeout(function() {
          card.style.maxHeight = '0';
          card.style.margin = '0';
          card.style.padding = '0';
          setTimeout(function() { card.remove(); }, 300);
        }, 150);

        // Remove nav entries for this topic
        var navItems = document.querySelectorAll('[data-topic="' + slug + '"]');
        for (var i = 0; i < navItems.length; i++) {
          navItems[i].remove();
        }

        // Remove activity items linking to this topic
        var activityLinks = document.querySelectorAll('.activity-item a[href^="/' + slug + '/"]');
        for (var j = 0; j < activityLinks.length; j++) {
          var item = activityLinks[j].closest('.activity-item');
          if (item) item.remove();
        }

        fetch('/api/workspace', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topicSlug: slug })
        });
      });
    })();
    </script>`;

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

  // Emergent insight card
  let insightHtml = "";
  if (topic.synthesis?.emergentIdeas && topic.synthesis.emergentIdeas.length > 0) {
    const rawInsight = topic.synthesis.emergentIdeas[0].replace(/^-\s*/, "");
    insightHtml = `
    <div class="emergent-insight">
      <span class="emergent-insight-label">Surprising Insight</span>
      <div class="emergent-insight-text">${md(rawInsight)}</div>
    </div>`;
  }

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
  actions += `<a href="/api/export/${topic.slug}" class="action-pill" download="assembly-${topic.slug}.html"><span class="pill-icon">&#8599;</span> Share this analysis</a>`;
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
    <div class="section-header"><h2>Babylon's Library</h2></div>
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
    <div class="section-header"><h2>Thinking Trail</h2><span class="section-count">${topic.followUps.length} follow-ups</span></div>
    <div class="action-group">
      <a href="/${topic.slug}/trajectory.html" class="action-pill">
        <span class="pill-icon">&#8634;</span> View Deliberation History
      </a>
    </div>`;
  }

  const content = `
    <h1>${esc(topic.title.replace(/\s*—\s*Final.*$/, "").replace(/\s*--\s*Assembly.*$/, ""))}</h1>
    <p class="page-subtitle">${meta}</p>
    ${insightHtml}
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
    { label: "Consensus" }
  );

  // Emergent insight (from overview)
  let insightHtml = "";
  if (synth.emergentIdeas && synth.emergentIdeas.length > 0) {
    const rawInsight = synth.emergentIdeas[0].replace(/^-\s*/, "");
    insightHtml = `
    <div class="emergent-insight">
      <span class="emergent-insight-label">Surprising Insight</span>
      <div class="emergent-insight-text">${md(rawInsight)}</div>
    </div>`;
  }

  // Quick-nav action pills
  let actions = `<div class="action-group">`;
  if (topic.characters.length > 0)
    actions += `<a href="/${topic.slug}/characters.html" class="action-pill"><span class="pill-icon">&#9823;</span> ${topic.characters.length} Characters</a>`;
  for (const iter of topic.iterations) {
    actions += `<a href="/${topic.slug}/iteration-${iter.number}.html" class="action-pill"><span class="pill-number">${iter.number}</span> ${esc(formatStructure(iter.structure))}</a>`;
  }
  if (topic.deliverables.length > 0)
    actions += `<a href="/${topic.slug}/deliverables.html" class="action-pill"><span class="pill-icon">&#9998;</span> Deliverables</a>`;
  if (topic.referenceLibrary)
    actions += `<a href="/${topic.slug}/reference-library.html" class="action-pill"><span class="pill-icon">&#9783;</span> Babylon's Library</a>`;
  actions += `<a href="/api/export/${topic.slug}" class="action-pill" download="assembly-${topic.slug}.html"><span class="pill-icon">&#8599;</span> Share</a>`;
  actions += `</div>`;

  const followUpHtml = renderFollowUpSection(topic, "synthesis");

  const content = `
    <h1>${esc(synth.title)}</h1>
    <p class="page-subtitle">Where the assembly found common ground — and where they didn't</p>
    ${insightHtml}
    ${actions}
    <div class="markdown-content">${md(synth.raw)}</div>
    ${followUpHtml}
    ${renderHighlightChatPanel(topic, "synthesis")}`;

  return layout(`Consensus — ${topic.title}`, content, nav, bc);
}

export function renderCharacterGrid(workspace: Workspace, topic: Topic): string | null {
  if (topic.characters.length === 0) return null;
  const nav = buildNav(workspace, `${topic.slug}/characters`);
  const bc = breadcrumb(
    { label: "Home", href: "/index.html" },
    { label: truncate(topic.title, 40), href: `/${topic.slug}/index.html` },
    { label: "The Assembly" }
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
    <h1>The Assembly</h1>
    <p class="page-subtitle">${topic.characters.length} participants in the assembly debate</p>
    <div class="card-grid">${cards}</div>`;

  return layout(`The Assembly — ${topic.title}`, content, nav, bc);
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
    { label: "The Assembly", href: `/${topic.slug}/characters.html` },
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
    `${sections}${followUpHtml}${charNav}${renderHighlightChatPanel(topic, `character-${character.number}`, character.name)}`,
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
    <h1>${esc(formatStructure(iteration.structure))}</h1>
    <p class="page-subtitle">Debate round ${iteration.number}</p>`;

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
  content += renderHighlightChatPanel(topic, `iteration-${iteration.number}`);

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
    ${sections}
    ${renderHighlightChatPanel(topic, "deliverables")}`;

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
    ${sections}
    ${renderHighlightChatPanel(topic, "verification")}`;

  return layout(`Verification — ${topic.title}`, content, nav, bc);
}


// ─── Trajectory Page ───

interface CharacterStance {
  name: string;
  framework: string;
  position: string;
}

function extractStances(divergenceContent: string): CharacterStance[] {
  const stances: CharacterStance[] = [];
  const lines = divergenceContent.split("\n");
  const stanceRe = /^\s*-\s+\*{0,2}([^*(]+?)\*{0,2}\s*\(([^)]+)\):\s*(.+)/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(stanceRe);
    if (match) {
      let position = match[3].trim();
      // Accumulate continuation lines
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j];
        if (/^\s*-\s+\S/.test(nextLine) || nextLine.trim() === "" || /^#{1,3}\s/.test(nextLine)) break;
        if (/^\s{4,}/.test(nextLine)) {
          position += " " + nextLine.trim();
        } else {
          break;
        }
      }
      stances.push({ name: match[1].trim(), framework: match[2].trim(), position });
    }
  }
  return stances;
}

export function renderTrajectory(workspace: Workspace, topic: Topic): string {
  const nav = buildNav(workspace, `${topic.slug}/trajectory`);
  const bc = breadcrumb(
    { label: "Home", href: "/index.html" },
    { label: truncate(topic.title, 30), href: `/${topic.slug}/index.html` },
    { label: "Thinking Trail" }
  );

  const colorMap: Record<string, string> = {};
  topic.characters.forEach((char, i) => {
    colorMap[char.name] = avatarColor(i);
  });

  // Fuzzy match character by first name
  function findCharColor(name: string): string {
    if (colorMap[name]) return colorMap[name];
    const lower = name.toLowerCase();
    for (const fullName of Object.keys(colorMap)) {
      const firstName = fullName.split(/\s+/)[0].toLowerCase();
      if (firstName === lower || fullName.toLowerCase().includes(lower)) return colorMap[fullName];
    }
    return "var(--color-accent)";
  }

  function findCharInitials(name: string): string {
    for (const fullName of Object.keys(colorMap)) {
      const firstName = fullName.split(/\s+/)[0].toLowerCase();
      if (name.toLowerCase() === firstName || fullName.toLowerCase().includes(name.toLowerCase())) return initials(fullName);
    }
    return name[0]?.toUpperCase() ?? "?";
  }

  // --- Divergence Map ---
  const allDivergences: DivergencePoint[] = [];
  if (topic.synthesis) allDivergences.push(...topic.synthesis.divergence);
  for (const iter of topic.iterations) {
    if (iter.synthesis) allDivergences.push(...iter.synthesis.divergence);
  }

  // Deduplicate by issue name (main synthesis and iteration synthesis may overlap)
  const seenIssues = new Set<string>();
  const uniqueDivergences: DivergencePoint[] = [];
  for (const dp of allDivergences) {
    if (!seenIssues.has(dp.issue)) {
      seenIssues.add(dp.issue);
      uniqueDivergences.push(dp);
    }
  }

  let divergenceMapHtml = "";
  if (uniqueDivergences.length > 0) {
    const issueCards = uniqueDivergences.map((dp) => {
      const stances = extractStances(dp.content);
      if (stances.length === 0) {
        return `
          <div class="divergence-issue">
            <h3 class="divergence-issue-title">${esc(dp.issue)}</h3>
            <div class="divergence-prose">${md(dp.content)}</div>
          </div>`;
      }

      const stanceHtml = stances.map((s) => {
        const color = findCharColor(s.name);
        const ini = findCharInitials(s.name);
        return `
          <div class="divergence-stance">
            <div class="divergence-stance-speaker">
              <span class="trajectory-avatar-sm" style="background:${color}">${ini}</span>
              <span class="divergence-stance-name">${esc(s.name)}</span>
              <span class="badge badge-tag">${esc(s.framework)}</span>
            </div>
            <div class="divergence-stance-position">${esc(s.position)}</div>
          </div>`;
      }).join("");

      return `
        <div class="divergence-issue">
          <h3 class="divergence-issue-title">${esc(dp.issue)}</h3>
          <div class="divergence-stances">${stanceHtml}</div>
        </div>`;
    }).join("");

    divergenceMapHtml = `
    <div class="trajectory-divergence-map">
      <h2 class="trajectory-section-heading">Divergence Map</h2>
      <p class="trajectory-section-subtitle">Key issues where the assembly remains divided</p>
      ${issueCards}
    </div>`;
  }

  // --- Recurring Tensions ---
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
    <h1>Thinking Trail</h1>
    <p class="page-subtitle">How the assembly's positions have evolved — ${uniqueDivergences.length} divergence${uniqueDivergences.length !== 1 ? "s" : ""}, ${topic.followUps.length} follow-up${topic.followUps.length !== 1 ? "s" : ""}</p>
    ${divergenceMapHtml}
    ${tensionsHtml}`;

  return layout(`Thinking Trail — ${topic.title}`, content, nav, bc);
}

// ─── Structured Reference Library ───

export function renderStructuredReferenceLibrary(workspace: Workspace, topic: Topic): string | null {
  if (!topic.referenceLibrary) return null;

  const nav = buildNav(workspace, `${topic.slug}/reference-library`);
  const bc = breadcrumb(
    { label: "Home", href: "/index.html" },
    { label: truncate(topic.title, 30), href: `/${topic.slug}/index.html` },
    { label: "Babylon's Library" }
  );

  const parsed = topic.parsedReferenceLibrary;

  // Fallback to raw markdown if parsing failed
  if (!parsed) {
    const followUpHtml = renderFollowUpSection(topic, "reference-library");
    const content = `
      <h1>Babylon's Library</h1>
      <p class="page-subtitle">Intellectual traditions and empirical evidence grounding the assembly debate</p>
      <div class="markdown-content">${md(topic.referenceLibrary)}</div>
      ${followUpHtml}
      ${renderHighlightChatPanel(topic, "reference-library")}`;
    return layout(`Babylon's Library — ${topic.title}`, content, nav, bc);
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
    <h1>Babylon's Library</h1>
    <p class="page-subtitle">Intellectual traditions and empirical evidence grounding the assembly debate</p>
    ${sectionsHtml}
    ${crossHtml}
    ${followUpHtml}
    ${renderHighlightChatPanel(topic, "reference-library")}`;

  return layout(`Babylon's Library — ${topic.title}`, content, nav, bc);
}

// ─── Highlight Chat Panel (available on all content pages) ───

function renderHighlightChatPanel(topic: Topic, pageContext: string, defaultCharacter?: string): string {
  const colorMap: Record<string, string> = {};
  topic.characters.forEach((char, i) => {
    colorMap[char.name] = avatarColor(i);
  });
  const characterNames = topic.characters.map((c) => c.name);

  const isCharacterPage = pageContext.startsWith("character-");
  const isRefLibrary = pageContext === "reference-library";
  const isIteration = pageContext.startsWith("iteration-");
  const heading = isCharacterPage && defaultCharacter
    ? `Ask ${esc(defaultCharacter)}`
    : isRefLibrary ? "Explore Babylon's Library" : isIteration ? "Debate" : "Ask the Assembly";
  const placeholder = isCharacterPage && defaultCharacter
    ? `Ask ${defaultCharacter} about this...`
    : isRefLibrary ? "Ask about these sources..." : isIteration ? "What should the assembly debate?" : "Ask about this text...";

  return `
    <div class="highlight-chat-panel" id="highlight-chat-panel">
      <div class="panel-header">
        <h3>${heading}</h3>
        <button class="panel-collapse-btn" id="panel-collapse-btn" title="Collapse panel">&#8250;</button>
      </div>
      <div class="panel-quote" id="panel-quote"></div>
      <div class="attachment-wrapper panel-input-row">
        <div class="panel-input-inner-row">
          <textarea class="follow-up-input" id="panel-input" placeholder="${esc(placeholder)}" rows="2"></textarea>
          <button class="follow-up-button" id="panel-ask-btn">Ask</button>
          ${isCharacterPage ? `<button class="follow-up-challenge-btn" id="panel-challenge-btn">Challenge</button>` : ""}
        </div>
      </div>
      <div class="panel-response-area" id="panel-response-area"></div>
    </div>
    <button class="panel-expand-tab" id="panel-expand-tab" title="Expand chat panel">
      <span class="tab-icon">&#8249;</span> Ask
    </button>

    <script>
(function() {
  var TOPIC = ${JSON.stringify(topic.slug)};
  var PAGE_CONTEXT = ${JSON.stringify(pageContext)};
  var CHARACTERS = ${JSON.stringify(characterNames)};
  var COLORS = ${JSON.stringify(colorMap)};
  var DEFAULT_CHARACTER = ${JSON.stringify(defaultCharacter ?? "")};
  var IS_CHARACTER_PAGE = ${JSON.stringify(isCharacterPage)};
  var IS_REF_LIBRARY = ${JSON.stringify(isRefLibrary)};
  var IS_ITERATION = ${JSON.stringify(isIteration)};

  var panel = document.getElementById('highlight-chat-panel');
  var collapseBtn = document.getElementById('panel-collapse-btn');
  var expandTab = document.getElementById('panel-expand-tab');
  var quoteEl = document.getElementById('panel-quote');
  var panelInput = document.getElementById('panel-input');
  var askBtn = document.getElementById('panel-ask-btn');
  var responseArea = document.getElementById('panel-response-area');
  var panelAttachments = window.initAttachments ? window.initAttachments('panel-input') : null;

  var currentHighlight = '';

  function expandPanel() {
    panel.classList.add('open');
    panelInput.focus();
  }

  function collapsePanel() {
    panel.classList.remove('open');
  }

  function setHighlight(text) {
    currentHighlight = text;
    quoteEl.textContent = text;
  }

  // Text selection opens the panel with that quote
  document.addEventListener('mouseup', function(e) {
    if (panel.contains(e.target) || expandTab.contains(e.target)) return;
    var sel = window.getSelection().toString().trim();
    if (sel.length > 5) {
      var markdownContent = e.target.closest('.markdown-content');
      if (markdownContent) {
        setHighlight(sel);
        expandPanel();
      }
    }
  });

  collapseBtn.addEventListener('click', collapsePanel);
  expandTab.addEventListener('click', expandPanel);

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && panel.classList.contains('open')) collapsePanel();
  });

  panelInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitQuestion(false);
    }
  });

  askBtn.addEventListener('click', function() { submitQuestion(false); });

  var panelChallengeBtn = document.getElementById('panel-challenge-btn');

  function getRequestParams(isChallenge) {
    if (IS_CHARACTER_PAGE && DEFAULT_CHARACTER) {
      return { mode: 'ask-character', chars: [DEFAULT_CHARACTER], challenge: !!isChallenge };
    }
    if (IS_REF_LIBRARY) {
      return { mode: 'ask-library', chars: [], challenge: false };
    }
    if (IS_ITERATION) {
      return { mode: 'debate', chars: [], challenge: false };
    }
    return { mode: 'ask-assembly', chars: CHARACTERS, challenge: false };
  }

  if (panelChallengeBtn) {
    panelChallengeBtn.addEventListener('click', function() { submitQuestion(true); });
  }

  function submitQuestion(isChallenge) {
    var question = panelInput.value.trim();
    if (!question) return;

    panelInput.disabled = true;
    askBtn.disabled = true;
    askBtn.textContent = 'Thinking...';

    var panelLoadLabel = IS_CHARACTER_PAGE ? 'Thinking' : IS_REF_LIBRARY ? 'Researching sources' : IS_ITERATION ? 'The assembly is debating' : 'Assembly is deliberating';
    responseArea.innerHTML = '<div class="follow-up-loading">' + panelLoadLabel + '<span class="loading-dots"><span></span><span></span><span></span></span></div>';

    var params = getRequestParams(isChallenge);
    var pFiles = panelAttachments ? panelAttachments.getFiles() : [];
    var reqBody = {
      question: question,
      topicSlug: TOPIC,
      characters: params.chars,
      context: { page: PAGE_CONTEXT },
      mode: params.mode,
      highlightedText: currentHighlight,
      files: pFiles
    };
    if (params.challenge) reqBody.challenge = true;
    var body = JSON.stringify(reqBody);

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
            renderStreamedText(responseArea, fullText);
            return;
          }

          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split('\\n');
          buffer = lines.pop() || '';

          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line.startsWith('data: ')) continue;
            try {
              var event = JSON.parse(line.slice(6));
              if (event.type === 'text') {
                if (!loadingRemoved) {
                  responseArea.innerHTML = '';
                  loadingRemoved = true;
                }
                fullText += event.content;
                renderStreamedText(responseArea, fullText);
              } else if (event.type === 'error') {
                responseArea.innerHTML = '<div class="follow-up-error">' + escapeHtml(event.content) + '</div>';
              }
            } catch(e) {}
          }

          return processChunk();
        });
      }

      return processChunk();
    }).catch(function(err) {
      responseArea.innerHTML = '<div class="follow-up-error">Failed to connect: ' + escapeHtml(err.message) + '</div>';
    }).finally(function() {
      panelInput.disabled = false;
      askBtn.disabled = false;
      askBtn.textContent = 'Ask';
      panelInput.value = '';
      if (panelAttachments) panelAttachments.clear();
      panelInput.focus();
    });
  }

  function renderStreamedText(container, text) {
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

  function simpleMarkdown(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
      .replace(/\\*([^*]+)\\*/g, '<em>$1</em>')
      .replace(/\\\`([^\\\`]+)\\\`/g, '<code>$1</code>')
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

// ─── Follow-up Section ───

type PageType = "character" | "reference-library" | "iteration" | "debate";

function detectPageType(pageContext: string): PageType {
  if (pageContext === "reference-library") return "reference-library";
  if (pageContext.startsWith("character-")) return "character";
  if (pageContext.startsWith("iteration-")) return "iteration";
  return "debate";
}

function renderFollowUpSection(topic: Topic, pageContext: string, defaultCharacter?: string): string {
  // Build character color map for the inline JS
  const colorMap: Record<string, string> = {};
  topic.characters.forEach((char, i) => {
    colorMap[char.name] = avatarColor(i);
  });

  // Render persisted follow-ups — only those matching this page's context
  const persistedHtml = topic.followUps
    .filter((fu) => fu.context === pageContext)
    .map((fu) => renderPersistedFollowUp(fu, colorMap, topic.slug))
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
    heading = "Explore Babylon's Library";
    subtitle = "Ask about the intellectual traditions, evidence, and connections in this library";
    placeholder = "What would you like to understand about these sources?";
    modesHtml = "";
  } else if (pageType === "character") {
    heading = `Ask ${esc(defaultCharacter!)}`;
    subtitle = "Ask this character anything — or challenge their position";
    placeholder = `Ask ${defaultCharacter} anything...`;
    modesHtml = "";
  } else if (pageType === "iteration") {
    heading = "Debate";
    subtitle = "Put a question to the assembly for structured adversarial deliberation";
    placeholder = "What should the assembly debate?";
    modesHtml = "";
  } else {
    heading = "Ask the Assembly";
    subtitle = "Continue the deliberation with a follow-up question";
    placeholder = "Ask a follow-up question...";
    modesHtml = `
          <label class="follow-up-mode-label">
            <input type="radio" name="follow-up-mode" value="ask-assembly" checked>
            <span>Ask the Assembly</span>
          </label>
          <label class="follow-up-mode-label">
            <input type="radio" name="follow-up-mode" value="ask-character">
            <span>Ask a Character</span>
          </label>`;
  }

  // Character picker (not shown for reference-library or character pages)
  const characterPickerHtml = pageType === "debate" ? `
        <div class="follow-up-characters" id="follow-up-characters"></div>` : "";

  return `
    <div class="follow-up-divider"></div>
    <div class="follow-up-container" id="follow-up-container">
      <h2 class="follow-up-heading">${heading}</h2>
      <p class="follow-up-subtitle">${subtitle}</p>
      ${persistedHtml}
      <div id="follow-up-live"></div>
      <form class="follow-up-form" id="follow-up-form">
        <div class="attachment-wrapper">
          <div class="follow-up-input-row">
            <textarea class="follow-up-input" id="follow-up-input"
                      placeholder="${esc(placeholder)}" autocomplete="off" rows="1"></textarea>
            <button type="submit" class="follow-up-button" id="follow-up-button">${pageType === "iteration" ? "Debate" : "Ask"}</button>
            ${pageType === "character" ? `<button type="button" class="follow-up-challenge-btn" id="follow-up-challenge-btn">Challenge</button>` : ""}
          </div>
        </div>
        <div class="follow-up-mode-row">
          ${modesHtml}
        </div>
        ${characterPickerHtml}
      </form>
    </div>
    ${renderFollowUpScript(topic.slug, pageContext, characterNames, colorMap, defaultCharacter)}`;
}

function renderPersistedFollowUp(fu: FollowUp, colorMap: Record<string, string>, topicSlug: string): string {
  const responsesHtml = fu.responses.map((r) => {
    if (!r.speaker) {
      // Guide-style response (no character attribution)
      return `
      <div class="follow-up-exchange follow-up-guide">
        <div class="debate-content">${md(r.content)}</div>
      </div>`;
    }
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
    <div class="follow-up-response follow-up-persisted" data-timestamp="${esc(fu.timestamp)}" data-topic="${esc(topicSlug)}">
      <div class="follow-up-meta">
        ${fu.timestamp ? `<span class="follow-up-time">${esc(fu.timestamp)}</span>` : ""}
        ${fu.mode ? `<span class="badge badge-tag">${esc(fu.mode)}</span>` : ""}
        <button class="follow-up-delete-btn" title="Delete this follow-up">&times;</button>
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
  var followUpAttachments = window.initAttachments ? window.initAttachments('follow-up-input') : null;

  var selectedCharacters = new Set();

  function getInitials(name) {
    var parts = name.replace(/^(Dr\\.|Colonel|Col\\.)\\s*/i, '').split(/\\s+/);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  var challengeBtn = document.getElementById('follow-up-challenge-btn');

  function renderCharacterPicker() {
    if (!charContainer || PAGE_TYPE === 'reference-library') return;

    var modeEl = document.querySelector('input[name="follow-up-mode"]:checked');
    var mode = modeEl ? modeEl.value : (PAGE_TYPE === 'character' ? 'ask-character' : 'ask-assembly');

    // Hide picker for ask-assembly — the system picks relevant characters
    if (mode === 'ask-assembly') {
      charContainer.style.display = 'none';
      selectedCharacters.clear();
      return;
    }

    charContainer.style.display = 'block';

    // Build toggle buttons for ask-character (single select)
    var html = '<div class="follow-up-char-label">Choose a character:</div>';
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

    // Bind toggle clicks — single select only
    var toggles = charContainer.querySelectorAll('.follow-up-char-toggle');
    for (var j = 0; j < toggles.length; j++) {
      toggles[j].addEventListener('click', function() {
        var charName = this.getAttribute('data-name');
        if (this.classList.contains('locked')) return;

        selectedCharacters.clear();
        selectedCharacters.add(charName);
        if (DEFAULT_CHARACTER && PAGE_TYPE === 'character') selectedCharacters.add(DEFAULT_CHARACTER);
        var allToggles = charContainer.querySelectorAll('.follow-up-char-toggle');
        for (var k = 0; k < allToggles.length; k++) {
          allToggles[k].classList.toggle('selected', selectedCharacters.has(allToggles[k].getAttribute('data-name')));
        }
      });
    }
  }

  // Initialize selected characters based on mode
  function initializeSelection() {
    selectedCharacters.clear();
    var modeEl = document.querySelector('input[name="follow-up-mode"]:checked');
    var mode = modeEl ? modeEl.value : (PAGE_TYPE === 'character' ? 'ask-character' : 'ask-assembly');

    if (mode === 'ask-character') {
      if (PAGE_TYPE === 'character' && DEFAULT_CHARACTER) {
        selectedCharacters.add(DEFAULT_CHARACTER);
      } else if (CHARACTERS.length > 0) {
        selectedCharacters.add(CHARACTERS[0]);
      }
    }
    // ask-assembly: no character selection — system picks
  }

  // Listen for mode changes (skip for character pages — no mode UI)
  if (PAGE_TYPE !== 'character') {
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
  }

  // Auto-resize textarea as user types
  function autoResize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 200) + 'px';
  }
  input.addEventListener('input', autoResize);

  // Enter submits, Shift+Enter inserts newline
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });

  var isChallenge = false;

  if (challengeBtn) {
    challengeBtn.addEventListener('click', function() {
      isChallenge = true;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
    });
  }

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var question = input.value.trim();
    if (!question) return;

    var mode, chars, challenge;
    challenge = isChallenge;
    isChallenge = false;

    if (PAGE_TYPE === 'character') {
      mode = 'ask-character';
      chars = [DEFAULT_CHARACTER];
    } else if (PAGE_TYPE === 'reference-library') {
      mode = 'ask-library';
      chars = [];
    } else if (PAGE_TYPE === 'iteration') {
      mode = 'debate';
      chars = [];
    } else {
      var modeEl = document.querySelector('input[name="follow-up-mode"]:checked');
      mode = modeEl ? modeEl.value : 'ask-assembly';
      chars = mode === 'ask-assembly' ? [] : Array.from(selectedCharacters);
    }

    input.disabled = true;
    button.disabled = true;
    if (challengeBtn) challengeBtn.disabled = true;
    button.classList.add('sending');
    setTimeout(function() { button.classList.remove('sending'); }, 500);
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
    var loadingLabel = mode === 'ask-library' ? 'Researching sources' : mode === 'debate' ? 'The assembly is debating' : challenge ? 'Preparing defense' : 'Assembly is deliberating';
    loadingDiv.innerHTML = loadingLabel + '<span class="loading-dots"><span></span><span></span><span></span></span>';
    contentDiv.appendChild(loadingDiv);

    liveArea.appendChild(responseDiv);
    responseDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Track pending follow-up so we can recover if the user navigates away
    var existingCount = document.querySelectorAll('.follow-up-persisted').length;
    try {
      sessionStorage.setItem('pending-followup', JSON.stringify({
        topic: TOPIC, page: PAGE_CONTEXT, count: existingCount, ts: Date.now()
      }));
    } catch(e) {}

    var fuFiles = followUpAttachments ? followUpAttachments.getFiles() : [];
    var reqObj = {
      question: question,
      topicSlug: TOPIC,
      characters: chars,
      context: { page: PAGE_CONTEXT },
      mode: mode,
      files: fuFiles
    };
    if (challenge) reqObj.challenge = true;
    var body = JSON.stringify(reqObj);

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
      if (challengeBtn) challengeBtn.disabled = false;
      button.textContent = PAGE_TYPE === 'iteration' ? 'Debate' : 'Ask';
      input.value = '';
      input.style.height = 'auto';
      if (followUpAttachments) followUpAttachments.clear();
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
    try { sessionStorage.removeItem('pending-followup'); } catch(e) {}
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

  // Recover from navigating away during an active follow-up.
  // If we stored a pending follow-up for this topic+page, poll until the
  // rebuilt page includes the new follow-up, then reload.
  (function checkPending() {
    try {
      var raw = sessionStorage.getItem('pending-followup');
      if (!raw) return;
      var pending = JSON.parse(raw);
      if (pending.topic !== TOPIC || pending.page !== PAGE_CONTEXT) return;

      // Expire after 10 minutes
      if (Date.now() - pending.ts > 600000) {
        sessionStorage.removeItem('pending-followup');
        return;
      }

      var currentCount = document.querySelectorAll('.follow-up-persisted').length;
      // If the page already has the new follow-up (rebuild happened before we loaded), clear and done
      if (currentCount > pending.count) {
        sessionStorage.removeItem('pending-followup');
        return;
      }

      // Show a banner and poll
      var banner = document.createElement('div');
      banner.className = 'follow-up-pending-banner';
      banner.innerHTML = '<span class="follow-up-pending-dot"></span> A follow-up is being processed. This page will refresh automatically.';
      liveArea.appendChild(banner);

      var pollInterval = setInterval(function() {
        fetch(location.href, { cache: 'no-store' }).then(function(r) { return r.text(); }).then(function(html) {
          var parser = new DOMParser();
          var doc = parser.parseFromString(html, 'text/html');
          var newCount = doc.querySelectorAll('.follow-up-persisted').length;
          if (newCount > pending.count) {
            clearInterval(pollInterval);
            sessionStorage.removeItem('pending-followup');
            location.reload();
          }
        }).catch(function() {});
      }, 4000);
    } catch(e) {}
  })();

  // Delete follow-up handler
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.follow-up-delete-btn');
    if (!btn) return;

    var card = btn.closest('.follow-up-persisted');
    if (!card) return;

    var timestamp = card.getAttribute('data-timestamp');
    var topic = card.getAttribute('data-topic');
    if (!timestamp || !topic) return;

    // Convert readable timestamp (2026-02-18 12:33:01) to filename format (2026-02-18T12-33-01)
    var fileTimestamp = timestamp.replace(' ', 'T').replace(/:/g, '-');

    // Animate out immediately — no confirmation
    card.style.transition = 'opacity 0.3s, max-height 0.3s';
    card.style.opacity = '0';
    card.style.maxHeight = card.offsetHeight + 'px';
    card.style.overflow = 'hidden';
    setTimeout(function() {
      card.style.maxHeight = '0';
      card.style.margin = '0';
      card.style.padding = '0';
      setTimeout(function() { card.remove(); }, 300);
    }, 150);

    fetch('/api/follow-up', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicSlug: topic, timestamp: fileTimestamp })
    });
  });
})();
</script>`;
}
