import { BobmanError } from "../lib/errors.js";
import {
  defaultGithubClient,
  fetchIssueContext,
  requireToken,
  type GithubClient,
  type GithubClientFactory,
} from "../lib/github.js";
import { enforceTokenBudget } from "../lib/token-budget.js";
import { GetIssueContextInputSchema } from "../schemas/tool-inputs.js";
import { getSession } from "../state/session.js";
import type { ToolDeps } from "./deps.js";

let clientFactory: GithubClientFactory | null = null;

export function setGithubClientFactoryForTests(f: GithubClientFactory | null): void {
  clientFactory = f;
}

function buildClient(): GithubClient {
  const token = requireToken();
  return (clientFactory ?? defaultGithubClient)(token);
}

export async function handleGetIssueContext(deps: ToolDeps, raw: unknown) {
  const input = GetIssueContextInputSchema.parse(raw);
  const session = getSession(deps.db, input.session_id);
  if (!session) {
    throw new BobmanError("NOT_FOUND", `Session not found: ${input.session_id}`, {
      entity: "session_id",
      session_id: input.session_id,
    });
  }
  const gh = buildClient();
  const ctx = await fetchIssueContext(gh, input.owner, input.repo, input.issue_number);
  return enforceTokenBudget({ session_id: session.session_id, ...ctx }).value;
}
