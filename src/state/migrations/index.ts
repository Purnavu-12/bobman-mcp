import { MIGRATION_001_DDL, MIGRATION_001_VERSION } from "./001_init.js";
import { MIGRATION_002_DDL, MIGRATION_002_VERSION } from "./002_git.js";
import { MIGRATION_003_DDL, MIGRATION_003_VERSION } from "./003_analyzer.js";
import { MIGRATION_004_DDL, MIGRATION_004_VERSION } from "./004_risk.js";
import { MIGRATION_005_DDL, MIGRATION_005_VERSION } from "./005_knowledge.js";
import { MIGRATION_006_DDL, MIGRATION_006_VERSION } from "./006_multi_repo.js";

export interface Migration {
  version: number;
  name: string;
  ddl: string;
}

export const MIGRATIONS: Migration[] = [
  { version: MIGRATION_001_VERSION, name: "init", ddl: MIGRATION_001_DDL },
  { version: MIGRATION_002_VERSION, name: "git", ddl: MIGRATION_002_DDL },
  { version: MIGRATION_003_VERSION, name: "analyzer", ddl: MIGRATION_003_DDL },
  { version: MIGRATION_004_VERSION, name: "risk", ddl: MIGRATION_004_DDL },
  { version: MIGRATION_005_VERSION, name: "knowledge", ddl: MIGRATION_005_DDL },
  { version: MIGRATION_006_VERSION, name: "multi_repo", ddl: MIGRATION_006_DDL },
];

export const KNOWN_SCHEMA_VERSION = Math.max(...MIGRATIONS.map((m) => m.version));
