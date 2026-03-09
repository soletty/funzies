import { execSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

// ── CLI arg parsing ─────────────────────────────────────────────────

const argv = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const idx = argv.indexOf(`--${name}`);
  return idx !== -1 && idx + 1 < argv.length ? argv[idx + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return argv.includes(`--${name}`);
}

const step = getArg("step") ?? "all";
const entityType = getArg("entity-type");
const entityId = getArg("id");
const limit = getArg("limit");
const dryRun = hasFlag("dry-run");
const fix = hasFlag("fix");
const pretty = hasFlag("pretty");

const VALID_STEPS = ["all", "seed", "research", "extract", "resolve", "export"];

if (hasFlag("help") || !VALID_STEPS.includes(step)) {
  console.log(`Usage: npx tsx src/index.ts [options]

Options:
  --step <step>         Run specific step: seed | research | extract | resolve | export | all
                        Default: all
  --entity-type <type>  Filter by entity type (for research/extract steps)
  --id <id>             Process single entity (for research/extract steps)
  --limit <n>           Max entities to process (for research/extract steps)
  --dry-run             Preview without making changes
  --fix                 Apply auto-fixes in resolve step
  --pretty              Pretty-print exported JSON
  --help                Show help`);
  process.exit(hasFlag("help") ? 0 : 1);
}

// ── Runner ──────────────────────────────────────────────────────────

function run(script: string, extraArgs: string[] = []) {
  const cmd = `npx tsx ${join(__dirname, script)} ${extraArgs.join(" ")}`.trim();
  console.log(`> ${cmd}\n`);
  execSync(cmd, { stdio: "inherit", cwd: projectRoot });
}

function entityFilterArgs(): string[] {
  const args: string[] = [];
  if (entityType) args.push("--entity-type", entityType);
  if (entityId) args.push("--id", entityId);
  if (limit) args.push("--limit", limit);
  if (dryRun) args.push("--dry-run");
  return args;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Ansab Pipeline ===\n");

  if (step === "all" || step === "seed") {
    console.log("── Step 1: Seeding ──");
    run("seed.ts");
  }

  if (step === "all" || step === "research") {
    console.log("\n── Step 2: Research ──");
    run("research.ts", entityFilterArgs());
  }

  if (step === "all" || step === "extract") {
    console.log("\n── Step 3: Extraction ──");
    run("extract.ts", entityFilterArgs());
  }

  if (step === "all" || step === "resolve") {
    console.log("\n── Step 4: Resolution ──");
    const args: string[] = [];
    if (fix) args.push("--fix");
    run("resolve.ts", args);
  }

  if (step === "all" || step === "export") {
    console.log("\n── Step 5: Export ──");
    const args: string[] = [];
    if (pretty) args.push("--pretty");
    run("export.ts", args);
  }

  console.log("\n=== Pipeline Complete ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
