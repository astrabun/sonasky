import type { Destination } from "@sonasky/feeds-def";

/** Reads `--dest=prod|test` from argv (default "prod"). */
export const parseDestination = (argv: string[]): Destination => {
  const arg = argv.find((a) => a.startsWith("--dest="));
  const value = arg ? arg.slice("--dest=".length) : "prod";
  if (value !== "prod" && value !== "test") {
    throw new Error(`Invalid --dest "${value}" - expected "prod" or "test".`);
  }
  return value;
};
