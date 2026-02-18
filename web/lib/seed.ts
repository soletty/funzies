import { readFileSync, readdirSync } from "fs";
import { join, basename } from "path";
import { Pool } from "pg";
import { hashSync } from "bcryptjs";
import { parseCharacterFiles } from "./parsers/characters";
import { parseSynthesis } from "./parsers/synthesis";
import { parseTranscript } from "./parsers/transcript";
import { parseReferenceLibrary } from "./parsers/reference-library";
import type { Topic, Iteration, Deliverable, VerificationReport } from "./types";

const DEMO_DIR = join(__dirname, "../../assembly-viewer/demo-data/battery-recycling-deep-dive");

function readMd(relativePath: string): string {
  return readFileSync(join(DEMO_DIR, relativePath), "utf-8");
}

function readMdFiles(dir: string): Array<{ slug: string; title: string; content: string }> {
  const fullDir = join(DEMO_DIR, dir);
  return readdirSync(fullDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const content = readFileSync(join(fullDir, f), "utf-8");
      const titleMatch = content.match(/^#\s+(.+)$/m);
      return {
        slug: basename(f, ".md"),
        title: titleMatch ? titleMatch[1].trim() : basename(f, ".md"),
        content,
      };
    });
}

async function seed() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Read all markdown files
    const charactersMd = readMd("characters.md");
    const synthesisMd = readMd("synthesis.md");
    const referenceLibraryMd = readMd("reference-library.md");
    const iterationTranscriptMd = readMd("iteration-1-grande-table/transcript.md");
    const iterationSynthesisMd = readMd("iteration-1-grande-table/synthesis.md");
    const deliverableFiles = readMdFiles("deliverable");
    const verificationFiles = readMdFiles("verification");

    // Build raw_files map
    const rawFiles: Record<string, string> = {
      "characters.md": charactersMd,
      "synthesis.md": synthesisMd,
      "reference-library.md": referenceLibraryMd,
      "iteration-1-grande-table/transcript.md": iterationTranscriptMd,
      "iteration-1-grande-table/synthesis.md": iterationSynthesisMd,
    };
    for (const f of deliverableFiles) {
      rawFiles[`deliverable/${f.slug}.md`] = f.content;
    }
    for (const f of verificationFiles) {
      rawFiles[`verification/${f.slug}.md`] = f.content;
    }

    // Parse into structured data
    const characters = parseCharacterFiles([charactersMd]);
    const synthesis = parseSynthesis(synthesisMd);
    const parsedReferenceLibrary = parseReferenceLibrary(referenceLibraryMd);

    const iteration: Iteration = {
      number: 1,
      structure: "Grande Table",
      synthesis: parseSynthesis(iterationSynthesisMd),
      transcriptRaw: iterationTranscriptMd,
      rounds: parseTranscript(iterationTranscriptMd),
    };

    const deliverables: Deliverable[] = deliverableFiles.map((f) => ({
      slug: f.slug,
      title: f.title,
      content: f.content,
    }));

    const verificationReports: VerificationReport[] = verificationFiles.map((f) => ({
      type: f.slug,
      title: f.title,
      content: f.content,
    }));

    const parsedData: Topic = {
      slug: "battery-recycling-deep-dive",
      title: "Deep Dive into Battery Recycling",
      characters,
      iterations: [iteration],
      synthesis,
      deliverables,
      verification: verificationReports,
      referenceLibrary: referenceLibraryMd,
      parsedReferenceLibrary,
      researchFiles: [],
      followUps: [],
    };

    // Insert demo user
    const passwordHash = hashSync("password123", 10);
    const userResult = await pool.query(
      `INSERT INTO users (email, name, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET password_hash = $3
       RETURNING id`,
      ["demo@example.com", "Demo User", passwordHash]
    );
    const userId = userResult.rows[0].id;

    // Insert assembly
    await pool.query(
      `INSERT INTO assemblies (user_id, slug, topic_input, status, raw_files, parsed_data, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (user_id, slug) DO UPDATE
       SET status = $4, raw_files = $5, parsed_data = $6, completed_at = now()`,
      [
        userId,
        "battery-recycling-deep-dive",
        "Deep dive into battery recycling",
        "complete",
        JSON.stringify(rawFiles),
        JSON.stringify(parsedData),
      ]
    );

    console.log("Seed completed: demo user and battery-recycling-deep-dive assembly inserted.");
  } finally {
    await pool.end();
  }
}

seed();
