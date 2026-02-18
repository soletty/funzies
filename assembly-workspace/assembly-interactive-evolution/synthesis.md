# Assembly Interactive Evolution — Assembly Synthesis

*Debate structure used: La Grande Table*
*Date: 2026-02-17*

## 1. Convergence

- **The follow-up question is the highest-value next feature.** (Confidence: High)
  - All six characters agreed, though they disagreed on implementation details. Nadia (Augmented Cognition), Yuki (Direct Manipulation), Astrid (Worse is Better), Kofi (Deliberation Architecture), Dev (Protocol-First), and even Tomás (Terminal is Interface) conceded this.
  - Reasoning: the current viewer is read-only. The single interaction that changes it from a document reader to a thinking tool is the ability to ask a follow-up question in context. Every character's framework, when applied to "what's the minimum change that matters," converged here.
  - This convergence is meaningful because it spans the simplicity-vs-ambition axis: Astrid (ship the minimum) and Yuki (build the vision) agree on the SAME first step.

- **No frontend framework. Vanilla JS only.** (Confidence: High)
  - Tomás (Terminal), Astrid (Worse is Better), and Dev (Protocol-First) explicitly advocated this. Yuki (Direct Manipulation) demonstrated that SSE + streaming rendering is ~50 lines of vanilla JS. Nobody argued for a framework.
  - Reasoning: the current zero-JS architecture is a legitimate asset. Adding a framework would be a one-way door — hard to reverse, expensive to maintain, and unjustified by the feature set in V1.x.
  - Evidence cited: Yuki's inline code demonstration that EventSource + DOM manipulation handles the core interaction without any build step.

- **Follow-up responses must persist to the workspace directory.** (Confidence: High)
  - Nadia (Augmented Cognition), Dev (Protocol-First), and Kofi (Deliberation Architecture) argued for this. Tomás (Terminal) endorsed it because "the file system is the session." Astrid didn't object.
  - Reasoning: if follow-up responses disappear when the browser closes, the feature loses most of its value. Writing responses to the workspace directory means they're part of the session, re-renderable on subsequent visits, and available as context for future Claude Code runs.

- **The architecture should be a local HTTP server bridging SSE to Claude Code's stdout stream.** (Confidence: High)
  - Dev proposed this as "Option B." Tomás endorsed it as "actually clean" when he saw it was piping, not a framework. Yuki validated the client-side implementation. Astrid accepted the complexity given the feature value.
  - The viewer's existing HTTP server gets upgraded with POST endpoints. It spawns Claude Code as a child process with `--output-format stream-json`, and bridges the streaming JSON output to the browser via Server-Sent Events.

- **Multi-character response should be the default mode, not single-character chat.** (Confidence: Medium-High)
  - Kofi argued this from deliberation quality research. Yuki endorsed it for the richer visual experience (speaker attribution). Nadia endorsed it as more faithful to the assembly concept.
  - Kofi's amendment was accepted: three modes — "multi-character response" (default), "reconvene" (full debate), and "ask character" (single, with explicit caveat label).

## 2. Divergence

- **How much to build before measuring vs. how much to measure before building**
  - Astrid (Worse is Better): Ship the absolute minimum follow-up feature, measure engagement, let data determine V2. Building analytics and visual improvements first is unnecessary delay.
  - Nadia (Augmented Cognition): Session persistence must be part of the first interactive release, not deferred. Without it, follow-up responses are orphaned and the tool doesn't build compounding value.
  - What both accept: some measurement is needed; some building before measurement is needed.
  - Where they fork: Astrid thinks follow-up questions without session persistence are sufficient for learning. Nadia thinks session persistence IS the learning — it's what transforms the tool from "consultation" to "partnership."
  - This is a conflict of **time horizons**: Astrid optimizes for near-term learning velocity, Nadia optimizes for long-term cognitive compounding.

- **Whether the viewer should eventually become the primary interface (replacing Claude Code for assembly runs)**
  - Yuki (Direct Manipulation): Yes. The user explicitly asked for this. Watching the assembly run in real-time in the viewer — characters appearing, debates streaming — is a fundamentally better experience than running a CLI command and waiting.
  - Tomás (Terminal is Interface): No. This turns the viewer from a renderer into a full application. It violates separation of concerns. Claude Code is the interface for running assemblies. The viewer is the interface for reading them.
  - What both accept: some Claude Code integration (for follow-ups) is needed.
  - Where they fork: whether that integration should extend to full session creation.
  - This is a conflict of **what the tool fundamentally is**: a renderer (Tomás) vs. an interaction surface (Yuki).

## 3. Unexpected Alliances

- **Tomás (Terminal) + Yuki (Direct Manipulation):** Both agreed that server-side SVG for the tension map is the right first visual improvement — Tomás because it requires no JS, Yuki because it creates spatial structure. They disagree on everything else but converged on this specific technical approach.

- **Astrid (Worse is Better) + Dev (Protocol-First):** Proposed functionally identical V1.1 features (text input + server endpoint) but framed them differently. Astrid's "minimum viable feature" and Dev's "protocol foundation" are the same code — they just have different narratives about what it enables next.

- **Kofi (Deliberation Architecture) + Astrid (Worse is Better):** Kofi, the academic, conceded Astrid was "right about process" — that measuring user behavior before building deliberation features is methodologically correct, even though his framework pushes toward quality-first design.

## 4. Knowledge Gaps

- **How do current users actually engage with the viewer?** No analytics exist. We don't know: which pages get visited, whether users read full synthesis or skim, whether character profiles are explored, whether debate transcripts are expanded. Every feature recommendation is based on framework reasoning, not observed behavior. Adding lightweight client-side analytics is a prerequisite for informed decisions about V2.

- **Can Claude Code be reliably spawned as a child process from a Node.js server with streaming JSON output?** Dev asserted this is possible via `claude --output-format stream-json` piped from `child_process.spawn()`. This needs verification — what's the exact CLI invocation, what's the JSON event format, how does it handle long-running operations, what happens on errors?

- **What prompt template produces faithful character continuation?** When a follow-up question is sent to Claude Code in the context of an existing assembly session, the characters need to respond consistently with their established frameworks and positions. The prompt template — including which workspace files to reference and how to instruct Claude Code to maintain character voices — needs to be designed and tested.

## 5. Confidence Levels

| Position | Confidence | Justification |
|----------|-----------|---------------|
| Follow-up question is the highest-value next feature | High | All 6 frameworks converged independently |
| Vanilla JS, no framework | High | Engineering cost analysis, zero dissent |
| Local HTTP server + SSE architecture | High | Clean separation, minimal complexity, proven pattern |
| Multi-character default for follow-ups | Medium-High | Strong theoretical backing (Kofi), some risk of added complexity |
| Session persistence in V1.1 | Medium | Nadia argues essential, Astrid argues premature. Lightweight version (localStorage + file persistence) is low-cost |
| Viewer as primary interface (V2+) | Low-Medium | Yuki argues compelling UX, Tomás argues scope creep. Depends entirely on V1.1 engagement data |
| Interactive tension map | Medium | Unanimous visual value, but not a workflow change. Good V2 candidate |

## 6. Emergent Ideas

- **The "thin bridge" architecture.** Nobody walked in with this. It emerged from the collision between Tomás's simplicity demands and Yuki's interactivity needs. The insight: the viewer's existing HTTP server is the bridge. It accepts browser requests, spawns Claude Code, and pipes the streaming output as SSE. No framework, no MCP, no new protocol — just Unix pipes over HTTP. This is architecturally elegant precisely because it satisfies both the simplicity and the interactivity camps.

- **Three follow-up modes as a resolution to the chat-vs-deliberation tension.** Kofi and Astrid's collision produced this: instead of choosing between "simple character chat" (Astrid) and "structured reconvening" (Kofi), ship three modes with the simple one as default. The mode parameter is one field in the request. The complexity difference is in the prompt template, not the architecture. This means Astrid gets her minimum viable feature AND Kofi gets his deliberation quality — at negligible additional engineering cost.

- **Workspace directory as implicit session model.** Tomás's insistence that "the file system is the session" combined with Nadia's session persistence requirement produced the insight that the workspace directory already IS a session — it just needs a thin layer of browser-side state (localStorage) to remember where the user was. This avoids building a database, a session store, or any server-side state management. The session model is: workspace directory (content) + localStorage (user state).

- **Follow-up persistence creates a growing transcript.** When follow-up responses are written to the workspace directory as timestamped files, consecutive assembly runs in the same workspace accumulate a conversational history. Over time, the workspace becomes exactly what Nadia wanted — a persistent thinking environment — without any explicit "session management" feature. The persistence IS the feature.

## 7. Concrete Recommendations

### Recommendation 1: Ship contextual follow-up questions as V1.1
- **Support level:** Unanimous
- **What to build:**
  1. Upgrade the viewer's HTTP server to accept POST requests at `/api/follow-up`
  2. The request includes: page context (which section the user is on), relevant character names, the user's question, and a mode parameter (default: "multi-character")
  3. The server spawns `claude` as a child process with the assembly workspace files as context, streams the JSON output, and bridges it as SSE to the browser
  4. The client: a text input on synthesis/debate pages, ~100-200 lines of vanilla JS that handles the SSE stream and renders speaker-attributed responses inline
  5. Responses persist to the workspace directory as `follow-up-{timestamp}.md`
  6. The viewer re-renders persisted follow-ups on subsequent visits
- **Key trade-offs:** Adds JavaScript to the viewer (previously zero-JS). Adds server-side complexity (~200 lines). Requires Claude Code to be installed and available on the machine.
- **What could go wrong:** Claude Code child process spawning may have edge cases (Tomás predicted this). Character continuation fidelity may be poor without careful prompt engineering (Kofi predicted this). Users may not actually use follow-up questions (Astrid predicted this).
- **Monitor:** Follow-up usage rate, question types, whether users ask characters individually or use multi-character mode, whether follow-up responses satisfy or lead to more follow-ups.

### Recommendation 2: Add lightweight analytics and session awareness simultaneously
- **Support level:** Majority (Astrid strongly, Nadia strongly, Kofi endorsed, Dev endorsed, Tomás neutral, Yuki indifferent)
- **What to build:**
  1. Client-side analytics: page views, time on page, section expansions — stored in localStorage, viewable as a local JSON file. No external tracking.
  2. Session list: the viewer's landing page shows recent workspace directories with last-viewed timestamps. Clicking one opens where the user left off.
  3. Server-side SVG tension map: generated during the build step, no client JS needed. Replace the current text-based tension map rendering.
- **Key trade-offs:** Analytics adds localStorage usage and ~50 lines of JS. Session list requires scanning workspace directories at server start.
- **Monitor:** Whether session list changes return-visit behavior. Whether SVG tension maps get more engagement than text tension maps.

### Recommendation 3: Defer viewer-as-primary-interface to V2, gated on V1.1 engagement data
- **Support level:** Majority (Dev, Astrid, Kofi endorsed deferral. Yuki accepted with conditions. Tomás opposed the feature entirely. Nadia neutral.)
- **Gate criteria:** If follow-up usage in V1.1 exceeds 30% of sessions (i.e., more than 30% of assembly runs lead to at least one follow-up question), the demand for interactive engagement is validated and V2 should include session creation from the viewer.
- **What could go wrong:** Building the full real-time assembly UI is 6-12 months of work for a small team (Astrid predicted this). It may change the tool's identity in ways that alienate current users (Tomás predicted this).

## 8. Honest Failures

- **We cannot determine whether users want interactive features without shipping one and measuring.** Every character's recommendation is framework-derived, not data-derived. The assembly has no empirical evidence about user behavior with the current viewer. This is the most important admission: we're designing in the dark. Ship, measure, learn.

- **The prompt template for character continuation is an unsolved design problem.** How do you tell Claude Code to "be Marcus Okonkwo as defined in this characters.md file, maintaining his positions from this synthesis, and respond to this follow-up question"? This is a prompt engineering challenge that the assembly can identify but not resolve through debate. It needs iteration and testing.

- **The long-term product vision — whether this becomes a standalone tool, a Claude Code extension, or something else — is deliberately unanswered.** The user said the audience might expand beyond their team "later." The assembly chose not to design for that future because the current constraints (small team, Claude Code backend) are clear, and designing for hypothetical users produces hypothetical products. Revisit when the user base grows.
