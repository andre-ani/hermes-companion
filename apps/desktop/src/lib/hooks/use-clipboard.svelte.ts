export class UseClipboard {
  #status = $state<'success' | 'failure' | undefined>(undefined);
  #timeout: ReturnType<typeof setTimeout> | undefined;
  #delay: number;

  constructor({ delay = 800 }: { delay?: number } = {}) {
    this.#delay = delay;
  }

  get status() {
    return this.#status;
  }

  get copied() {
    return this.#status === 'success';
  }

  async copy(text: string) {
    if (this.#timeout) clearTimeout(this.#timeout);
    try {
      await navigator.clipboard.writeText(text);
      this.#status = 'success';
    } catch {
      this.#status = 'failure';
    }
    this.#timeout = setTimeout(() => (this.#status = undefined), this.#delay);
    return this.#status;
  }
}
