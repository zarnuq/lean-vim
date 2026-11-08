import { Plugin } from "obsidian";

// Editing itself is Obsidian's built-in vim mode (CodeMirror vim). This plugin
// only turns it on and adds mappings that run Obsidian commands.

// Normal-mode lhs -> Obsidian command id. List ids in the dev console with
// Object.keys(app.commands.commands).
const MAPPINGS: Record<string, string> = {
  "<Space>wh": "file-explorer:open",
  "<Space>wl": "editor:focus",
  "-": "file-explorer:reveal-active-file",
};

// "<Space>wh" -> " wh": the raw key sequence a mapping is matched against.
const rawKeys = (lhs: string) => lhs.replace(/<Space>/g, " ");

// Untyped internals: app.commands, vault config, and the vim state CodeMirror
// vim keeps on its adapter.
interface Internals {
  commands: { executeCommandById(id: string): boolean };
  vault: { getConfig(key: string): unknown; setConfig(key: string, value: unknown): void };
  workspace: {
    activeEditor?: { editor?: { cm?: { cm?: { state?: { vim?: VimState } } } } };
  };
}

interface VimState {
  insertMode: boolean;
  visualMode: boolean;
  inputState: { keyBuffer: string[]; operator: string | null };
}

export default class LeanVim extends Plugin {
  private pending = "";

  onload() {
    const app = this.app as unknown as Internals;
    if (!app.vault.getConfig("vimMode")) app.vault.setConfig("vimMode", true);

    // Matched on raw keys rather than with Vim.map: CodeMirror vim never fires
    // a mapping that starts with <Space>, and vim isn't listening outside
    // editors (file tree), where <Space>wl has to work too.
    this.registerDomEvent(document, "keydown", (e) => {
      if (!this.listening(e, app)) {
        this.pending = "";
        return;
      }
      if (e.key.length !== 1) return;
      this.pending += e.key;
      const hits = Object.entries(MAPPINGS).filter(([lhs]) => rawKeys(lhs).startsWith(this.pending));
      if (!hits.length) {
        this.pending = "";
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const exact = hits.find(([lhs]) => rawKeys(lhs) === this.pending);
      if (exact) {
        this.pending = "";
        app.commands.executeCommandById(exact[1]);
      }
    }, { capture: true });
  }

  // Mappings apply in vim normal mode with nothing half-typed (so "r<Space>"
  // still replaces), and outside editors anywhere but text fields.
  private listening(e: KeyboardEvent, app: Internals): boolean {
    if (e.ctrlKey || e.altKey || e.metaKey) return false;
    const t = e.target as HTMLElement;
    if (!t.closest(".cm-editor")) return !t.closest("input, textarea, [contenteditable]");
    const vim = app.workspace.activeEditor?.editor?.cm?.cm?.state?.vim;
    if (!vim || vim.insertMode || vim.visualMode) return false;
    return this.pending !== "" || (vim.inputState.keyBuffer.length === 0 && !vim.inputState.operator);
  }
}
