declare global {
  namespace App { interface Locals { companionActor?: string } }
  interface Window {
    companion?: {
      platform: NodeJS.Platform;
      invoke<T = unknown>(capability: string, input: unknown): Promise<T>;
      onAnnotation(callback: (value: unknown) => void): () => void;
    };
    __HERMES_DESIGN_BRIDGE__?: {
      version: number;
      annotate(payload: unknown): void;
    };
  }
}
export {};
