export function createAttachmentPreviewUrl(file: File): string | undefined {
	if (!file.type.startsWith("image/")) {
		return undefined;
	}

	try {
		if (typeof URL.createObjectURL !== "function") {
			return undefined;
		}

		return URL.createObjectURL(file);
	} catch {
		// A preview is an enhancement. An unsupported or rejected object URL must
		// never prevent the real file from entering attachment state.
		return undefined;
	}
}

export function revokeAttachmentPreviewUrl(previewUrl: string | undefined): void {
	if (!previewUrl?.startsWith("blob:")) {
		return;
	}

	try {
		if (typeof URL.revokeObjectURL === "function") {
			URL.revokeObjectURL(previewUrl);
		}
	} catch {
		// Revocation is cleanup only and must not break attachment replacement.
	}
}
