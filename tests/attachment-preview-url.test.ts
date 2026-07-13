import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createAttachmentPreviewUrl,
	revokeAttachmentPreviewUrl,
} from "../apps/desktop/src/lib/components/ai-elements/prompt-input/context/attachment-preview-url";

describe("attachment preview URLs", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("does not create previews for non-image attachments", () => {
		let createObjectURL = vi.spyOn(URL, "createObjectURL");
		let file = new File(["hello"], "notes.txt", { type: "text/plain" });

		expect(createAttachmentPreviewUrl(file)).toBeUndefined();
		expect(createObjectURL).not.toHaveBeenCalled();
	});

	it("returns the object URL for an image when preview creation succeeds", () => {
		vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:attachment-preview");
		let file = new File([new Uint8Array([1, 2, 3])], "pixel.png", { type: "image/png" });

		expect(createAttachmentPreviewUrl(file)).toBe("blob:attachment-preview");
	});

	it("keeps an image attachable when preview creation fails", () => {
		vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
			throw new TypeError("Object URL rejected");
		});
		let file = new File([new Uint8Array([1, 2, 3])], "pixel.png", { type: "image/png" });

		expect(createAttachmentPreviewUrl(file)).toBeUndefined();
	});

	it("treats preview revocation as best-effort cleanup", () => {
		let revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {
			throw new TypeError("Object URL already revoked");
		});

		expect(() => revokeAttachmentPreviewUrl("blob:attachment-preview")).not.toThrow();
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:attachment-preview");
	});
});
