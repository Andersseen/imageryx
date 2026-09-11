import { createSqliteTestDatabase } from "./create-sqlite-test-database";
import { describeRepositoryContract } from "./repository-contract";

describeRepositoryContract("SQLite", createSqliteTestDatabase);
