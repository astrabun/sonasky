import { describe, expect, it } from "vitest";
import { findTheme } from "@sonasky/apollo-themes";
import { TEMPLATES } from "./index.ts";

describe("templates", () => {
  it.each(TEMPLATES.map((t) => [t.id, t.theme] as const))(
    "%s suggests a theme that exists (%s)",
    (_id, theme) => {
      expect(findTheme(theme)).toBeDefined();
    },
  );
});
