import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { withItalics } from "@/components/prose-reader";

describe("prose text", () => {
  it("shows Gutenberg's _underscored_ words as italics", () => {
    expect(renderToStaticMarkup(<p>{withItalics("“I shall be _very_ late!” and _never_ once")}</p>))
      .toBe("<p>“I shall be <em>very</em> late!” and <em>never</em> once</p>");
    expect(renderToStaticMarkup(<p>{withItalics("No marks here")}</p>)).toBe("<p>No marks here</p>");
  });
});
