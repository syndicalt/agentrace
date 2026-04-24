import { FixError, type FixOptions, type FixResult } from "./types.js";

export type {
  FixOptions,
  FixResult,
  FixMode,
  FixProgress,
  Source,
  PathSource,
  GitSource,
  LlmConfig,
  LlmProvider,
} from "./types.js";
export { FixError } from "./types.js";

export async function fix(_options: FixOptions): Promise<FixResult> {
  throw new FixError("fix() is not yet implemented — wired up in T8");
}
