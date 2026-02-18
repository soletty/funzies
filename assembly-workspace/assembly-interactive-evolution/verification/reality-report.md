# Reality Report

## Verdict: PASS (with caveats noted)

### Has this been tried before?
- CLI-to-web bridges with SSE streaming are a well-established pattern. `vercel dev`, `next dev`, and numerous developer tools use this exact architecture.
- Character-consistent follow-up in AI systems is less proven. The prompt template for maintaining character voices across follow-ups is the highest-risk component.

### Would this survive contact with production?
- The architecture is simple enough to be reliable: spawn a process, pipe stdout, bridge to SSE.
- **What breaks first:** Character voice fidelity in follow-up responses. Claude may drift from the established character framework, especially for long or complex follow-ups. This is a prompt engineering problem, not an architecture problem.
- **Second failure point:** Large workspace files exceeding Claude Code's context window when included in the follow-up prompt. Mitigation: include only the relevant section of the synthesis + the specific character profiles, not the entire workspace.

### Is this implementable given constraints?
- Yes. The team uses Claude Code. The viewer is already a Node.js application. The estimated ~660 lines of new code is realistic for 2-3 weeks of work.
- The main constraint: Claude Code cannot be spawned inside another Claude Code session (confirmed during fact-checking). The viewer's server must run as a standalone process, not from within a Claude Code session. This is the normal usage pattern (you run the viewer, then use it in your browser), so this isn't a real blocker — but it should be documented.

### Migration path: viable
- All changes are additive. No existing code needs refactoring.
- The viewer continues to work as a static renderer if Claude Code isn't available — the follow-up feature simply won't appear or will show an error state.

### Caveats flagged to user:
1. The prompt template for character continuation needs iteration. Ship a v1, expect to revise it 2-3 times based on output quality.
2. Context window management for large workspaces needs attention — don't blindly include all files in the follow-up prompt.
3. The Claude Agent SDK may be a better long-term foundation than CLI subprocess spawning, but adds a dependency. Evaluate after V1.1 ships.
