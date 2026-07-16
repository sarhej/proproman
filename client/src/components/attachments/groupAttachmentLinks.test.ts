import { describe, it, expect } from "vitest";
import type { Attachment, AttachmentLink } from "../../types/models";
import { groupAttachmentLinks } from "./groupAttachmentLinks";

function attachment(
  partial: Pick<Attachment, "id" | "kind"> &
    Partial<Pick<Attachment, "parentAttachmentId" | "filename">>
): Attachment {
  return {
    id: partial.id,
    filename: partial.filename ?? `${partial.id}.png`,
    mimeType: "image/png",
    byteSize: 100,
    checksum: "x",
    storageKey: `k/${partial.id}`,
    source: "UPLOAD",
    kind: partial.kind,
    parentAttachmentId: partial.parentAttachmentId ?? null,
    status: "ACTIVE",
    createdByUserId: "u1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function link(id: string, att: Attachment): AttachmentLink {
  return {
    id,
    attachmentId: att.id,
    role: "EVIDENCE",
    createdByUserId: "u1",
    createdAt: new Date().toISOString(),
    attachment: att
  };
}

describe("groupAttachmentLinks", () => {
  it("pairs ANNOTATED with its ORIGINAL and shows annotated first", () => {
    const original = link("lo", attachment({ id: "ao", kind: "ORIGINAL", filename: "shot.png" }));
    const annotated = link(
      "la",
      attachment({
        id: "aa",
        kind: "ANNOTATED",
        parentAttachmentId: "ao",
        filename: "shot-annotated.png"
      })
    );
    const pairs = groupAttachmentLinks([annotated, original]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].primary.id).toBe("la");
    expect(pairs[0].related?.id).toBe("lo");
  });

  it("pairs when ORIGINAL appears before ANNOTATED in the list", () => {
    const original = link("lo", attachment({ id: "ao", kind: "ORIGINAL" }));
    const annotated = link(
      "la",
      attachment({ id: "aa", kind: "ANNOTATED", parentAttachmentId: "ao" })
    );
    const pairs = groupAttachmentLinks([original, annotated]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].primary.attachment?.kind).toBe("ANNOTATED");
    expect(pairs[0].related?.attachment?.kind).toBe("ORIGINAL");
  });

  it("keeps unpaired ORIGINAL alone", () => {
    const original = link("lo", attachment({ id: "ao", kind: "ORIGINAL" }));
    const pairs = groupAttachmentLinks([original]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].primary.id).toBe("lo");
    expect(pairs[0].related).toBeNull();
  });

  it("pairs audio ORIGINAL with DERIVATIVE transcript", () => {
    const audio = link("la", attachment({ id: "aa", kind: "ORIGINAL", filename: "note.webm" }));
    const transcript = link(
      "lt",
      attachment({
        id: "at",
        kind: "DERIVATIVE",
        parentAttachmentId: "aa",
        filename: "note-transcript.txt"
      })
    );
    const pairs = groupAttachmentLinks([audio, transcript]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].primary.id).toBe("la");
    expect(pairs[0].related?.id).toBe("lt");
  });
});
