export {};
declare global {
  interface Window {
    desktop?: {
      open(): Promise<{ xml: string; path: string } | null>;
      opened(path: string): Promise<void>;
      newDocument(): Promise<void>;
      save(xml: string, saveAs?: boolean): Promise<string | null>;
      export(xml: string): Promise<string | null>;
      changed(dirty: boolean): void;
      onSaveRequest(callback: () => Promise<boolean>): () => void;
      clipboardRead(): Promise<string>;
      clipboardWrite(xml: string): Promise<void>;
    };
  }
}
