# Reference Library — Assembly Interactive Evolution

---

## LAYER 1: INTELLECTUAL TRADITIONS

### Augmented Cognition / Tools for Thought — Nadia

- **Douglas Engelbart** — "Augmenting Human Intellect: A Conceptual Framework" (1962). The original argument that computers should amplify human thinking, not just automate tasks. Engelbart's "bootstrapping" concept — tools that improve the process of improving tools — is directly relevant to the assembly evolving across sessions. Nadia draws on this to argue that assembly characters and reference libraries are intellectual capital that compounds.
- **Andy Matuschak & Michael Nielsen** — "How can we develop transformative tools for thought?" (2019). The argument that most software tools optimize for task completion rather than cognitive transformation. Spaced repetition, active recall, and iterative engagement produce qualitatively different understanding than one-shot consumption. Nadia uses this to argue against treating assembly output as disposable.
- **Vannevar Bush** — "As We May Think" (1945). The Memex concept: a personal library that grows associatively, where trails of thought persist and connect across sessions. The assembly's reference library is a proto-Memex — but only if it persists.
- **Bret Victor** — "The Humane Representation of Thought" (2014 talk). Thinking is spatial, temporal, and embodied. Flat text interfaces waste most of human cognitive bandwidth. The assembly's relational structure (characters, tensions, alliances) is inherently spatial and deserves spatial representation.

### Unix Philosophy / CLI Purism — Tomás

- **Doug McIlroy** — The Unix pipeline concept (1964). Programs should be small, composable, and communicate through text streams. The assembly is a pipeline: Claude Code generates, the file system stores, the viewer renders. Adding interactivity to the viewer merges three concerns into one.
- **Rob Pike** — "Systems Software Research is Irrelevant" (2000). Simplicity through composability, not through features. Plan 9 failed commercially but was architecturally right — it pushed composition further than Unix.
- **Eric Raymond** — *The Art of Unix Programming* (2003). The Rule of Separation: separate policy from mechanism, interface from engine. The viewer is interface; Claude Code is engine. Mixing them violates separation.
- **Drew DeVault** — Blog posts on software complexity and suckless philosophy (2019-2024). Every dependency is a liability. The zero-JS viewer is a feature, not a limitation.

### Direct Manipulation / Spatial Interfaces — Yuki

- **Ben Shneiderman** — "Direct Manipulation: A Step Beyond Programming Languages" (1983). Users should manipulate representations of objects directly, not through command intermediaries. The assembly's characters and tension map are objects that should be directly manipulable.
- **Bret Victor** — "Inventing on Principle" (2012 talk). Creators need immediate, visual feedback. The gap between "ask a question in the terminal" and "see the answer in the viewer" is a feedback latency that kills creative thinking.
- **Evan Wallace & Dylan Field** — Figma's architecture (2016-present). Proof that complex real-time collaboration can work in a browser with no plugins. Figma's CRDT-based multiplayer and canvas rendering engine demonstrate that "web app" doesn't mean "slow and bloated."
- **Andy Matuschak** — "Why books don't work" (2019). Passive consumption (reading static output) is fundamentally inferior to active engagement (interaction) for understanding. The static viewer forces passive consumption.

### Protocol-First Design — Dev

- **Roy Fielding** — "Architectural Styles and the Design of Network-Based Software Architectures" (2000 dissertation). REST constraints as architectural principles. The assembly needs a defined interface contract between Claude Code and any viewer.
- **Stripe API Design Team** — Idempotency keys, versioning strategy, and API design principles (documented by Brandur Leach, 2015-2023). Protocol quality determines product quality. If the protocol between Claude Code and the viewer is well-designed, multiple frontends become possible.
- **Anthropic** — Model Context Protocol (MCP) specification (2024-2026). MCP provides a standardized way to connect AI applications to external tools and data sources. MCP servers expose capabilities through Resources (read-only data), Tools (actions with side effects), and Prompts (reusable templates). Claude Code already supports MCP — the assembly viewer could communicate through this existing protocol layer rather than inventing a new one.
- **Martin Kleppmann** — *Designing Data-Intensive Applications* (2017). The boundary between systems is defined by the data contract, not the implementation. The assembly's workspace file structure is an implicit schema that should be made explicit.

### Worse is Better / Shipping Pragmatism — Astrid

- **Richard Gabriel** — "Worse is Better" (1989). Simple, slightly incomplete systems beat complex, correct ones because simplicity enables adoption. The assembly-viewer works NOW. Adding features risks making it not work.
- **Jason Fried & DHH** — *Getting Real* (2006) and *Rework* (2010). Build less. The best feature is the one you don't build. Every feature has ongoing cost.
- **Kathy Sierra** — *Badass: Making Users Awesome* (2015). Users don't want features; they want to be better at their task. The assembly's task is "help me think through a complex problem." Which feature actually serves that?
- **Des Traynor** — "Product Strategy Means Saying No" (Intercom blog series). The discipline of refusing good ideas. Every feature proposed for the assembly-viewer is a good idea individually. That's the trap.

### Deliberation Architecture / Collective Intelligence — Kofi

- **Philip Tetlock** — *Superforecasting* (2015). Structured protocols with adversarial challenge dramatically improve prediction quality. The assembly is a structured adversarial protocol. Interactive features should be evaluated by whether they improve deliberation quality.
- **James Surowiecki** — *The Wisdom of Crowds* (2004). Group judgment outperforms individual expertise under specific conditions: diversity, independence, decentralization, and aggregation. Individual character chat violates the independence condition.
- **Scott Page** — *The Difference* (2007). Mathematical proof that diverse perspectives outperform homogeneous expertise. The assembly's value is in framework diversity. Features that collapse diversity (single-character chat) degrade the output.
- **Daniel Kahneman & Gary Klein** — "A Failure to Disagree" (2009). The adversarial collaboration model: researchers with opposing theories design joint experiments. The assembly is an adversarial collaboration — follow-up features should preserve this structure.
- **Recent research (2024-2025)** — Multi-agent LLM debate systems show that structured adversarial and cooperative communication among agents improves performance on mathematical reasoning, fact checking, healthcare decision-making, and code summarization. The next scaling frontier may be "societies of models" designed as structured collective intelligences, not just bigger individual models.

### Cross-Reading Assignments

- **Nadia** must engage: Richard Gabriel's "Worse is Better" — her vision of persistent thinking environments is directly challenged by the argument that simpler, less complete systems win through adoption.
- **Tomás** must engage: Shneiderman's direct manipulation principles — his CLI purism dismisses visual interaction without engaging the cognitive science evidence for why spatial/visual interfaces reduce cognitive load.
- **Yuki** must engage: Gabriel's "Worse is Better" AND the assembly's current zero-JS architecture as an intentional design choice, not a limitation.
- **Dev** must engage: Kathy Sierra's *Badass* — his protocol-first instinct could produce a beautiful API that nobody uses because it takes 6 months to build.
- **Astrid** must engage: Tetlock's *Superforecasting* — her "ship the minimum" instinct could strip away deliberation quality features that are actually the core value.
- **Kofi** must engage: Raymond's Rule of Separation — his desire for the UI to show deliberation structure might be achievable through better static rendering rather than interactivity.

---

## LAYER 2: EMPIRICAL EVIDENCE

### What is the current state of MCP and Claude Code extensibility?

- MCP adoption grew 340% in 2025, with over 500 MCP servers in public registries. Anthropic donated MCP to the Linux Foundation's Agentic AI Foundation in December 2025. — Source: Industry reports, 2025-2026. Relevant to: Dev's argument that MCP is the natural protocol layer; it's a growing, well-supported standard.
- A new MCP UI Framework was announced January 26, 2026. — Source: Anthropic/AAIF, January 2026. Relevant to: Potentially resolves the Yuki/Dev tension — if MCP has a UI framework, the viewer could use it rather than building from scratch.
- Claude Code supports MCP servers natively, allowing tools and resources to be exposed to the AI agent. — Source: Claude Code documentation. Relevant to: Dev's argument that the protocol layer already exists; the question is how to use it for assembly interactivity.

### What do tools-for-thought products show about persistent knowledge?

- Roam Research peaked at ~100K users (2020-2021) and declined as the complexity of maintaining a "second brain" exceeded most users' tolerance. — Source: Industry reporting, various. Relevant to: Astrid's argument that knowledge management features sound great but have poor retention.
- Obsidian grew to 1M+ users by 2024, succeeding where Roam struggled, partly because it used plain Markdown files (portable, no lock-in) and kept the core simple while pushing complexity to optional plugins. — Source: Obsidian community metrics. Relevant to: Supports BOTH Tomás (file system as persistence) and Astrid (keep core simple, optional complexity).
- TheBrain, a graph-based knowledge tool, has maintained a niche user base for 25+ years by focusing on power users willing to invest in curation. — Source: TheBrain product history. Relevant to: Nadia's argument that persistent knowledge tools CAN work, but only for committed users.

### What does research show about single-agent vs. multi-agent deliberation quality?

- Multi-agent debate consistently outperforms single-agent on mathematical reasoning, fact-checking, and code tasks, with structured protocols outperforming unstructured discussion. — Source: Multiple papers 2024-2025 (NeurIPS, ACL). Relevant to: Kofi's argument that single-character chat degrades deliberation quality.
- Judge-based systems (designated evaluator) and consensus-driven approaches (iterative convergence) are the two main structured protocol types. — Source: NeurIPS 2024 benchmark paper. Relevant to: The assembly uses neither — it uses a synthesis-based approach that may be novel.
- AI mediators can help groups find common ground by iteratively generating and refining statements that capture shared positions. — Source: Science, 2024. Relevant to: The synthesis phase IS this kind of mediation. Interactive follow-up could refine it further.

### What is the engineering cost of adding frontend interactivity?

- The current assembly-viewer has 0 frontend JS dependencies, ~580 lines of HTML generation, ~970 lines of CSS. Total: ~2500 lines of TypeScript. — Source: Codebase analysis. Relevant to: Tomás's argument about the cost of change. Any frontend framework adds at minimum 5-10x this in dependency weight.
- Svelte/SvelteKit produces significantly smaller bundles than React (typically 5-15KB vs 40-100KB+ for equivalent apps). htmx adds interactivity to server-rendered HTML with ~14KB and no build step. — Source: Framework benchmarks, 2024-2025. Relevant to: The Tomás/Yuki tension — lightweight options exist that don't require "becoming an Electron app."
- Server-Sent Events (SSE) provide a simple mechanism for streaming AI-generated content to a web UI without WebSocket complexity. Claude API natively supports streaming. — Source: Web standards, Claude API docs. Relevant to: Dev's protocol argument — streaming debate responses to the UI is technically straightforward.
