type AttachmentFileIdentity = Pick<File, 'name' | 'type'>;

export function matchesAttachmentAccept(file: AttachmentFileIdentity, accept?: string): boolean {
	if (!accept?.trim()) return true;
	const filename = file.name.toLocaleLowerCase();
	const mediaType = file.type.toLocaleLowerCase();
	return accept.split(',').map((pattern) => pattern.trim().toLocaleLowerCase()).filter(Boolean).some((pattern) => {
		if (pattern.startsWith('.')) return filename.endsWith(pattern);
		if (pattern.endsWith('/*')) return mediaType.startsWith(pattern.slice(0, -1));
		return mediaType === pattern;
	});
}
