import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Kbd } from "@/components/ui/kbd";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useTheme } from "next-themes";
import { Page } from "@/components/Panes";
import { Loading, useConfirm } from "@/components/ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface Config {
  projectRoots: string[];
  port: number;
  lan: { enabled: boolean; hasPassword: boolean };
  platform: string;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const SHORTCUTS: [string[], string][] = [
  [["⌘", "K"], "Search and actions"],
  [["["], "Hide or show the menu"],
  [["]"], "Hide or show the list pane"],
  [["/"], "Filter the current list"],
  [["g", "h"], "Go to Home (also g p, g s, g l, g j, g i, g t, g m, g a)"],
  [["⌘", "S"], "Save the open file"],
];

const METRIC_LABEL: Record<string, string> = {
  "edits.saved": "Edits saved",
  "edits.conflictsCaught": "Conflicts caught before overwriting",
  "live.started": "Sessions started here",
  "live.answered": "Approvals and questions answered here",
  "items.archived": "Archive actions",
  "items.deleted": "Delete actions",
};

function UsageCard() {
  const q = useQuery({ queryKey: ["metrics"], queryFn: () => api.get<{ counts: Record<string, number>; feedback: string }>("/metrics") });
  const counts = q.data?.counts ?? {};
  const views = Object.entries(counts)
    .filter(([k]) => k.startsWith("view."))
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k.slice(5)} ${n}`)
    .join(", ");
  return (
    <Card title="How you use this app">
      <p className="text-[13px] text-muted-foreground">Counted on this computer only, for reviewing what to build next. Save feedback from the search box (⌘K): type a note and choose “Save as feedback”.</p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[13.5px]">
        {Object.entries(METRIC_LABEL).map(([k, label]) => (
          <div key={k} className="contents">
            <dt className="text-ink-2">{label}</dt>
            <dd className="text-right font-mono">{counts[k] ?? 0}</dd>
          </div>
        ))}
      </dl>
      {views && <p className="text-[13px] text-muted-foreground">Views opened: {views}</p>}
      {q.data?.feedback && <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-sunken p-2.5 text-[12.5px]">{q.data.feedback}</pre>}
    </Card>
  );
}

export function PreferencesPage() {
  const q = useQuery({ queryKey: ["config"], queryFn: () => api.get<Config>("/config") });
  const auth = useQuery({ queryKey: ["auth"], queryFn: () => api.get<{ isLocal: boolean }>("/auth/status") });
  const { theme, setTheme } = useTheme();
  const [roots, setRoots] = useState("");
  const [password, setPassword] = useState("");
  const qc = useQueryClient();
  const confirm = useConfirm();
  useEffect(() => {
    if (q.data) setRoots(q.data.projectRoots.join("\n"));
  }, [q.data]);

  const saveRoots = useMutation({
    mutationFn: () => api.post("/config", { projectRoots: roots.split("\n").map((r) => r.trim()).filter(Boolean) }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Project folders saved.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const lan = useMutation({
    mutationFn: (enabled: boolean) => api.post("/lan", { enabled, password: password || undefined }),
    onSuccess: (_r, enabled) => {
      setPassword("");
      qc.invalidateQueries({ queryKey: ["config"] });
      toast.success(enabled ? "Home network mode is on. The app restarts on HTTPS; reload this page." : "Home network mode is off.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <Loading />;
  const c = q.data!;
  return (
    <Page title="Preferences">
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">
        <Card title="Appearance">
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink-2">Theme</span>
            <ToggleGroup type="single" variant="outline" size="sm" value={theme ?? "system"} onValueChange={(v) => v && setTheme(v)} aria-label="Theme">
              <ToggleGroupItem value="system">Match system</ToggleGroupItem>
              <ToggleGroupItem value="light">Light</ToggleGroupItem>
              <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <p className="text-[13px] text-muted-foreground">Pane sizes and collapsed panes are remembered in this browser. Drag a divider to resize; double-click it to reset.</p>
        </Card>

        <Card title="Project folders">
          <p className="text-[13px] text-muted-foreground">Each folder inside these is listed as a project. Folders where you've run Claude elsewhere are found automatically.</p>
          <Textarea rows={3} value={roots} onChange={(e) => setRoots(e.target.value)} aria-label="Project folders, one per line" className="font-mono text-[13px]" />
          <div>
            <Button variant="default" busy={saveRoots.isPending} onClick={() => saveRoots.mutate()}>
              Save folders
            </Button>
          </div>
        </Card>

        <Card title="Home network">
          <p className="text-[13px] text-muted-foreground">
            {c.lan.enabled
              ? `On. Other devices on your network can open https://<this computer's address>:${c.port} and sign in with the password. Your browser will warn about the certificate the first time; it is made by this app.`
              : "Off. Only this computer can open the app. Turn it on to check sessions and answer Claude from your phone at home."}
          </p>
          {auth.data?.isLocal ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-[13px] text-ink-2">{c.lan.hasPassword ? "New password (leave empty to keep the current one)" : "Password (at least 10 characters)"}</span>
                <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              <div className="flex gap-2">
                {c.lan.enabled ? (
                  <>
                    {password && (
                      <Button variant="outline" busy={lan.isPending} onClick={() => lan.mutate(true)}>
                        Change password
                      </Button>
                    )}
                    <Button variant="destructive" busy={lan.isPending} onClick={() => lan.mutate(false)}>
                      Turn off
                    </Button>
                  </>
                ) : (
                  <Button
                   
                    variant="default"
                    busy={lan.isPending}
                    disabled={!c.lan.hasPassword && password.length < 10}
                    onClick={async () => {
                      if (await confirm({ title: "Turn on home network mode?", body: "Anyone on your network with the password can see your sessions and files and run Claude on this computer. The app restarts on HTTPS.", confirm: "Turn on" })) lan.mutate(true);
                    }}
                  >
                    Turn on
                  </Button>
                )}
              </div>
            </>
          ) : (
            <p className="text-[13px] text-muted-foreground">Change this from the computer the app runs on.</p>
          )}
        </Card>

        <UsageCard />

        <Card title="Keyboard">
          <ul className="flex flex-col gap-2">
            {SHORTCUTS.map(([keys, what]) => (
              <li key={what} className="flex items-center justify-between gap-3 text-[13.5px]">
                <span className="text-ink-2">{what}</span>
                <span className="flex gap-1">
                  {keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Page>
  );
}
