# Fact-Check Report

## Verdict: PASS (after revision)

### Claims verified:
- **Claude CLI supports `--output-format stream-json`**: CONFIRMED. The `-p` flag with `--output-format stream-json`, `--verbose`, and `--include-partial-messages` produces newline-delimited JSON events with token-level granularity.
- **SSE (Server-Sent Events) is standard browser API**: CONFIRMED. EventSource is supported in all modern browsers, requires no library.
- **The current viewer has zero JS and ~2,500 lines of TS**: CONFIRMED via codebase analysis. 580 lines in html.ts, 969 lines in CSS, remainder across scanner/parser/server/cli/types.
- **MCP adoption grew 340% in 2025**: Cited from search results. Plausible but unverifiable exact number — sourced from industry reporting.
- **MCP UI Framework announced January 2026**: Cited from search results. Confirmed.
- **Claude Agent SDK exists as alternative to CLI subprocess**: CONFIRMED. TypeScript package available for programmatic Claude Code invocation.

### Claims revised:
- **Original claim**: "spawn('claude', ['--output-format', 'stream-json', '--prompt-file', '...'])" — **Corrected**: The correct invocation is `claude -p "prompt" --output-format stream-json --verbose --include-partial-messages`. The `-p` flag is required for non-interactive mode. `--prompt-file` is not the correct flag.

### No logical gaps or internal contradictions found.
