import { promises as fs } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

async function main() {
  const database = new PGlite();
  try {
    const directory = path.join(process.cwd(), "db", "migrations");
    const files = (await fs.readdir(directory))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    for (const file of files) {
      await database.exec(await fs.readFile(path.join(directory, file), "utf8"));
    }
    console.log(`Migration smoke test passed (${files.length} migrations).`);
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
