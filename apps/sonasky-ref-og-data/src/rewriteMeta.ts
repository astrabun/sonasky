import type { CharacterMeta } from "./lookupCharacter";

class SetTextContent {
  #value: string;
  constructor(value: string) {
    this.#value = value;
  }
  element(element: Element) {
    element.setInnerContent(this.#value);
  }
}

class SetMetaContent {
  content: string;
  constructor(content: string) {
    this.content = content;
  }
  element(element: Element) {
    element.setAttribute("content", this.content);
  }
}

// Rewrites the SPA shell's generic <title>/og:*/twitter:* tags with the
// specific character's name + resolved ref image, leaving everything else
// (scripts, styles, the app's mount point) untouched.
export function rewriteMeta(response: Response, meta: CharacterMeta, pageUrl: string): Response {
  const title = `${meta.name} - SonaSky Ref`;
  const description = `View ${meta.name}'s ref sheet on SonaSky Ref.`;

  const rewriter = new HTMLRewriter()
    .on("title", new SetTextContent(title))
    .on('meta[property="og:title"]', new SetMetaContent(title))
    .on('meta[name="twitter:title"]', new SetMetaContent(title))
    .on('meta[property="og:description"]', new SetMetaContent(description))
    .on('meta[name="twitter:description"]', new SetMetaContent(description))
    .on('meta[property="og:url"]', new SetMetaContent(pageUrl));

  if (meta.imageUrl) {
    rewriter
      .on('meta[property="og:image"]', new SetMetaContent(meta.imageUrl))
      .on('meta[name="twitter:image"]', new SetMetaContent(meta.imageUrl));
  }

  return rewriter.transform(response);
}
