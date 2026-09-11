import { createTestDatabase } from "./create-test-database";
import { describeRepositoryContract } from "./repository-contract";

describeRepositoryContract("D1", createTestDatabase);
