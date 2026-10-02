// Writes the shared JSON Schema file from the Zod schema (src/spec/jsonSchema.ts).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { planetSpecJsonSchemaText, SCHEMA_FILE } from "../src/spec/jsonSchema";

const path = fileURLToPath(new URL(`../${SCHEMA_FILE}`, import.meta.url));
writeFileSync(path, planetSpecJsonSchemaText());
console.log(`Wrote ${path}`);
