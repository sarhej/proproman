import { describe, expect, it } from "vitest";
import {
  CLIENT_ATTACHMENT_MAX_BYTES,
  imageFileFromDataTransfer,
  validateClientImageFile
} from "./attachmentCapture";

describe("attachmentCapture", () => {
  it("accepts png under size limit", () => {
    const file = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });
    expect(validateClientImageFile(file)).toEqual({ ok: true });
  });

  it("rejects oversized files", () => {
    const big = new Uint8Array(CLIENT_ATTACHMENT_MAX_BYTES + 1);
    const file = new File([big], "big.png", { type: "image/png" });
    const res = validateClientImageFile(file);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("SIZE_REJECTED");
  });

  it("rejects non-image MIME", () => {
    const file = new File(["%PDF"], "x.pdf", { type: "application/pdf" });
    const res = validateClientImageFile(file);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("MIME_REJECTED");
  });

  it("extracts first image from DataTransfer-like files", () => {
    const png = new File([new Uint8Array([1])], "a.png", { type: "image/png" });
    const pdf = new File(["x"], "a.pdf", { type: "application/pdf" });
    const dt = {
      files: [pdf, png] as unknown as FileList,
      items: [] as unknown as DataTransferItemList
    } as DataTransfer;
    Object.defineProperty(dt, "files", { value: [pdf, png] });
    expect(imageFileFromDataTransfer(dt)?.name).toBe("a.png");
  });
});
