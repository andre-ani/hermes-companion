export type ViewIdentity = {
  connectionId: string | null;
  profileId: string | null;
  sessionId: string | null;
  draftId: string | null;
  location: 'chat' | 'settings' | 'surface';
};

export type ViewOwner = Readonly<ViewIdentity & { epoch: number }>;

export type ViewResourceIdentity = Pick<ViewIdentity, 'connectionId' | 'profileId' | 'sessionId' | 'draftId'>;

export type SelectionIntent<T> = Readonly<{
  generation: number;
  target: T;
  completion: Promise<void>;
}>;

export function viewResourceKey(owner: ViewResourceIdentity) {
  const resource = owner.sessionId === null
    ? ['draft', owner.draftId ?? 'missing']
    : ['session', owner.sessionId];
  return JSON.stringify([owner.connectionId, owner.profileId, resource]);
}

/**
 * Owns renderer projection, not the remote operation itself. A request may
 * continue after navigation, but only the current owner may paint its result.
 */
export class ViewOwnership {
  #epoch = 0;
  #current: ViewOwner | null = null;

  get current(): ViewOwner | null {
    return this.#current;
  }

  begin(identity: ViewIdentity): ViewOwner {
    this.#current = Object.freeze({ ...identity, epoch: ++this.#epoch });
    return this.#current;
  }

  owns(owner: ViewOwner | null | undefined): owner is ViewOwner {
    return Boolean(owner && this.#current
      && owner.epoch === this.#current.epoch
      && owner.connectionId === this.#current.connectionId
      && owner.profileId === this.#current.profileId
      && owner.sessionId === this.#current.sessionId);
  }

  adoptSession(owner: ViewOwner, sessionId: string): ViewOwner | null {
    if (!this.owns(owner)) return null;
    this.#current = Object.freeze({ ...owner, sessionId, draftId: null });
    return this.#current;
  }
}

/**
 * Serializes remote mutations that change shared backend selection while
 * exposing latest-intent identity separately from renderer navigation.
 * Navigating the center pane must not pretend an already-started mutation was
 * cancelled; its latest completion still needs authoritative reconciliation.
 */
export class SerializedSelectionQueue<T> {
  #generation = 0;
  #queue: Promise<void> = Promise.resolve();
  #lastSuccessfulTarget: T | null = null;

  get lastSuccessfulTarget(): T | null {
    return this.#lastSuccessfulTarget;
  }

  enqueue(target: T, mutate: (target: T) => Promise<void>): SelectionIntent<T> {
    const generation = ++this.#generation;
    const completion = this.#queue.then(async () => {
      await mutate(target);
      this.#lastSuccessfulTarget = target;
    });
    this.#queue = completion.catch(() => undefined);
    return Object.freeze({ generation, target, completion });
  }

  isLatest(intent: SelectionIntent<T>): boolean {
    return intent.generation === this.#generation;
  }
}
