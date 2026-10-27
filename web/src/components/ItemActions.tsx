import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { LibraryItem } from "@/lib/types";
import { SimpleSelect } from "./SimpleSelect";
import { cn, useConfirm } from "./ui";
import { Button } from "./ui/button";

const SKILL_STATES = [
  { value: "on", label: "On: Claude uses it when it fits, and you can type /name" },
  { value: "name-only", label: "Name only: Claude sees just its name" },
  { value: "user-invocable-only", label: "Only when you type /name" },
  { value: "off", label: "Off: Claude can't use it and it's not in the / list" },
];

/** Kinds that are a file or folder of their own, moved into the app's archive when deleted. */
const ARCHIVABLE: Partial<Record<LibraryItem["kind"], string>> = {
  skill: "skill",
  agent: "agent",
  command: "command",
  rule: "rule",
  "output-style": "output-style",
  plan: "plan",
  memory: "memory",
  workflow: "workflow",
  "scheduled-task": "scheduled-task",
  "claude-md": "file",
  hook: "file",
};

type How = { by: "archive"; kind: string } | { by: "hook" } | { by: "mcp" } | { by: "uninstall" } | { by: "plugin" } | { by: "synced" } | null;

/** A plugin kept as a folder in your skills folder (`claude plugin init`), rather than installed from a marketplace. */
export const isSkillsDirPlugin = (i: LibraryItem) => i.kind === "plugin" && typeof i.overrideKey === "string" && i.overrideKey.endsWith("@skills-dir");

/** How an item is deleted, or why it can't be. */
export function deleteHow(i: LibraryItem): How {
  if (i.kind === "plugin") return i.overrideKey ? { by: "uninstall" } : null;
  if (i.source === "plugin") return { by: "plugin" };
  if (i.source === "synced") return { by: "synced" };
  if (i.kind === "mcp") return i.meta?.scope === "plugin" ? { by: "plugin" } : { by: "mcp" };
  if (i.access !== "edit") return null;
  if (i.kind === "hook-def") return typeof i.meta?.group === "number" && typeof i.meta?.index === "number" ? { by: "hook" } : null;
  const kind = ARCHIVABLE[i.kind];
  return kind ? { by: "archive", kind } : null;
}

/**
 * What you can do with one item: turn a skill or plugin on or off, check a skill against the standard, delete it.
 * `scope` is the project id, or "global" for what applies everywhere.
 */
export function ItemActions({ i, scope, projectId, onDeleting, onDeleted }: { i: LibraryItem; scope: string; projectId?: string | null; onDeleting?: (on: boolean) => void; onDeleted?: () => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [check, setCheck] = useState<{ ok: boolean; output: string; available: boolean } | null>(null);
  const done = () => void qc.invalidateQueries();
  const state = useMutation({
    mutationFn: (v: string) =>
      i.kind === "plugin"
        ? api.post<{ message: string }>(`/plugins/${v === "on" ? "enable" : "disable"}`, { id: i.overrideKey })
        : api.post<{ message?: string }>("/library/skill-state", { key: i.overrideKey, state: v, scope }),
    onSuccess: (r) => {
      if (i.kind === "plugin" && r?.message) toast.success(r.message);
      done();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const how = deleteHow(i);
  const navigate = useNavigate();
  const del = useMutation({
    onMutate: () => onDeleting?.(true),
    mutationFn: () => {
      if (how?.by === "hook") return api.post("/hooks/remove", { path: i.path, event: i.meta.event, group: i.meta.group, index: i.meta.index });
      if (how?.by === "mcp") return api.post("/mcp/remove", { name: i.name, scope: i.meta.scope, project: projectId ?? undefined });
      if (how?.by === "uninstall") return api.post<{ message: string }>("/plugins/uninstall", { id: i.overrideKey });
      return api.post("/library/archive", { path: i.path, kind: how?.by === "archive" ? how.kind : "file" });
    },
    onSuccess: (r) => {
      const said = (r as { message?: string } | undefined)?.message;
      const kept = how?.by === "archive" || how?.by === "hook" || (how?.by === "mcp" && (r as { archived?: boolean } | undefined)?.archived);
      const msg = said || (kept ? `Moved ${i.name} to Archived items.` : `Removed ${i.name}.`);
      toast.success(msg, msg.includes("Archived items") ? { action: { label: "Open Archived items", onClick: () => void navigate({ to: "/archive" }) } } : undefined);
      onDeleted?.();
      // The item's own file is gone; re-fetching it while its view closes would only fail.
      const gone = how?.by === "archive";
      void qc.invalidateQueries({ predicate: (q) => !(gone && q.queryKey[0] === "file" && q.queryKey[1] === i.path) });
    },
    onError: (e: Error) => {
      onDeleting?.(false);
      toast.error(e.message);
    },
  });
  const validate = useMutation({
    mutationFn: () => api.post<{ ok: boolean; output: string; available: boolean }>("/library/validate", { path: i.path }),
    onSuccess: setCheck,
    onError: (e: Error) => toast.error(e.message),
  });
  const editable = i.access === "edit";
  const canState = (i.kind === "skill" && !!i.overrideKey && i.source !== "plugin" && i.source !== "synced") || i.kind === "plugin";
  const canDelete = how?.by === "archive" || how?.by === "hook" || how?.by === "mcp" || how?.by === "uninstall";
  const canCheck = i.kind === "skill" && editable;
  const note =
    how?.by === "plugin" ? `Comes with the plugin ${i.sourceName}, so it's turned on, off or removed with the plugin.` : how?.by === "synced" ? "Comes from your claude.ai account, so it's changed there." : null;
  if (!canState && !canDelete && !canCheck && !note) return null;

  const ask = () => {
    if (how?.by === "hook") return { body: `It's taken out of ${i.display} and moves to Archived items. You can restore it from there.`, confirm: "Delete" };
    if (how?.by === "mcp") return { body: "Claude Code removes it from its settings, and it moves to Archived items. You can restore it from there.", confirm: "Remove" };
    if (how?.by === "uninstall" && isSkillsDirPlugin(i))
      return { body: `Its folder, ${i.display.replace(/[\\/]\.claude-plugin[\\/]plugin\.json$/, "")}, moves to Archived items, where Claude Code no longer loads it. You can restore it from there.`, confirm: "Move to archive" };
    if (how?.by === "uninstall") return { body: "Claude Code uninstalls it and deletes the options and data it saved. You can install it again from Find plugins.", confirm: "Uninstall" };
    return { body: "It moves to Archived items, where Claude Code no longer loads it. You can restore it from there.", confirm: "Move to archive" };
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {canState && (
          <SimpleSelect
            label={i.kind === "plugin" ? "Plugin on or off" : "Can Claude use it"}
            value={i.kind === "plugin" ? (i.state === "off" ? "off" : "on") : (i.state ?? "on")}
            onChange={(v) => state.mutate(v)}
            className="max-w-full min-w-0 [&>[data-slot=select-value]]:block [&>[data-slot=select-value]]:truncate"
            options={i.kind === "plugin" ? [{ value: "on", label: "On" }, { value: "off", label: "Off" }] : SKILL_STATES}
          />
        )}
        {note && <span className="text-[13px] text-muted-foreground">{note}</span>}
        {canCheck && (
          <Button size="sm" variant="outline" busy={validate.isPending} onClick={() => validate.mutate()}>
            Check against the standard
          </Button>
        )}
        {canDelete && (
          <Button
            size="sm"
            variant="outline"
            className="text-danger"
            busy={del.isPending}
            onClick={async () => {
              const a = ask();
              if (await confirm({ title: `${how?.by === "uninstall" ? (isSkillsDirPlugin(i) ? "Remove" : "Uninstall") : "Delete"} ${i.name}?`, body: a.body, confirm: a.confirm, danger: true })) del.mutate();
            }}
          >
            {how?.by === "uninstall" ? (isSkillsDirPlugin(i) ? "Remove" : "Uninstall") : "Delete"}
          </Button>
        )}
      </div>
      {check && (
        <p className={cn("rounded-md px-3 py-2 text-[13px]", check.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger")}>
          {!check.available ? check.output : check.ok ? "It follows the Agent Skills standard." : `It doesn't follow the standard yet: ${check.output.split("\n").filter(Boolean).slice(-3).join(" ")}`}
        </p>
      )}
    </div>
  );
}
