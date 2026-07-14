declare global {
  namespace App { interface Locals { companionActor?: string } }
  interface Window {
    companion?: {
      platform: NodeJS.Platform;
      invoke<T = unknown>(capability: string, input: unknown): Promise<T>;
    };
  }
}
export {};
