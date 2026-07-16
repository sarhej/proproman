import type { Attachment, AttachmentLink } from "../../types/models";

export type AttachmentListPair = {
  /** Primary row (annotated image, or audio original, or standalone) */
  primary: AttachmentLink;
  /**
   * Related sibling:
   * - image: ORIGINAL under ANNOTATED
   * - voice: DERIVATIVE transcript under audio ORIGINAL
   */
  related: AttachmentLink | null;
};

/**
 * Group entity attachment links into primary + related pairs.
 */
export function groupAttachmentLinks(links: AttachmentLink[]): AttachmentListPair[] {
  const withAttachment = links.filter((l): l is AttachmentLink & { attachment: Attachment } => !!l.attachment);
  const byAttachmentId = new Map(withAttachment.map((l) => [l.attachment.id, l]));

  const used = new Set<string>();
  const pairs: AttachmentListPair[] = [];

  for (const link of withAttachment) {
    if (used.has(link.id)) continue;
    const a = link.attachment;

    if (a.kind === "ANNOTATED" && a.parentAttachmentId) {
      const parentLink = byAttachmentId.get(a.parentAttachmentId) ?? null;
      used.add(link.id);
      if (parentLink) used.add(parentLink.id);
      pairs.push({ primary: link, related: parentLink });
      continue;
    }

    if (a.kind === "DERIVATIVE" && a.parentAttachmentId) {
      // Prefer showing under parent when parent is also linked; otherwise standalone
      const parentLink = byAttachmentId.get(a.parentAttachmentId);
      if (parentLink && !used.has(parentLink.id)) {
        used.add(parentLink.id);
        used.add(link.id);
        pairs.push({ primary: parentLink, related: link });
        continue;
      }
      if (parentLink && used.has(parentLink.id)) {
        // parent already shown; skip if already nested, else standalone
        used.add(link.id);
        continue;
      }
      used.add(link.id);
      pairs.push({ primary: link, related: null });
      continue;
    }

    if (a.kind === "ORIGINAL") {
      const annotatedChild = withAttachment.find(
        (l) => l.attachment.kind === "ANNOTATED" && l.attachment.parentAttachmentId === a.id
      );
      if (annotatedChild && !used.has(annotatedChild.id)) {
        used.add(annotatedChild.id);
        used.add(link.id);
        pairs.push({ primary: annotatedChild, related: link });
        continue;
      }
      const transcriptChild = withAttachment.find(
        (l) => l.attachment.kind === "DERIVATIVE" && l.attachment.parentAttachmentId === a.id
      );
      if (transcriptChild && !used.has(transcriptChild.id)) {
        used.add(link.id);
        used.add(transcriptChild.id);
        pairs.push({ primary: link, related: transcriptChild });
        continue;
      }
      if (used.has(link.id)) continue;
      used.add(link.id);
      pairs.push({ primary: link, related: null });
      continue;
    }

    used.add(link.id);
    pairs.push({ primary: link, related: null });
  }

  return pairs;
}
