// Edits markdown the way Obsidian's Live Preview does: the file's own text, shown formatted, with
// symbols visible only on the line you're on. Nothing is converted, so saving changes only what you typed.
import { Editor } from "./Editor";

export function MarkdownEditor({ value, onChange, path, readOnly, onSave }: { value: string; onChange: (v: string) => void; path: string; readOnly?: boolean; onSave?: () => void }) {
  return <Editor value={value} onChange={onChange} path={path} readOnly={readOnly} onSave={onSave} preview />;
}
