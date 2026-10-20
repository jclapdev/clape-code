// Which account Claude Code uses: the Account section on Settings, with Claude account sign-in and sign-out.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, enc } from "@/lib/api";
import type { Account } from "@/lib/types";
import { ErrorNote, Loading, useConfirm } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LoginState {
  state: "idle" | "waiting" | "checking" | "done" | "failed";
  url: string | null;
  message: string | null;
}

export const accountKey = (project?: string) => ["account", project ?? ""];

export function useAccount(project?: string) {
  return useQuery({ queryKey: accountKey(project), queryFn: () => api.get<Account>(`/account${project ? `?project=${enc(project)}` : ""}`) });
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 py-2">
      <dt className="w-32 flex-none text-[13.5px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all">{value}</dd>
    </div>
  );
}

export function AccountDetails({ project }: { project?: string }) {
  const q = useAccount(project);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} onRetry={() => q.refetch()} />;
  const a = q.data!;
  if (a.problem)
    return (
      <p role="alert" className="text-[13.5px] text-danger">
        {a.problem}
      </p>
    );
  const cloud = a.loggedIn === null;
  return (
    <div className="flex max-w-[640px] flex-col gap-3">
      <dl className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface px-4">
        <Row label={cloud ? "Provider" : "Signed in with"} value={a.loggedIn === false ? "Not signed in" : a.methodName} />
        <Row label="Email" value={a.email} />
        <Row label="Organization" value={a.organization} />
        <Row label="Plan" value={a.plan} />
      </dl>
      {(a.method === "none" || a.method === "claude.ai") && <SignIn signedIn={a.method === "claude.ai"} />}
    </div>
  );
}

/**
 * Claude account sign-in through Claude Code: open the sign-in page, then paste the code it shows. The code is a
 * one-time secret, so it lives only in this component's state (no draft in local storage).
 */
function SignIn({ signedIn }: { signedIn: boolean }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [code, setCode] = useState("");
  const login = useQuery({
    queryKey: ["account-login"],
    queryFn: () => api.get<LoginState>("/account/login"),
    refetchInterval: (q) => (q.state.data?.state === "waiting" || q.state.data?.state === "checking" ? 1500 : false),
  });
  const s = login.data;
  const set = (v: LoginState) => qc.setQueryData(["account-login"], v);
  const refresh = () => qc.invalidateQueries({ queryKey: ["account"] });
  useEffect(() => {
    if (s?.state !== "done") return;
    toast.success(s.message ?? "Signed in");
    void refresh();
    void api.del<LoginState>("/account/login").then(set);
  }, [s?.state]);

  const start = useMutation({ mutationFn: () => api.post<LoginState>("/account/login"), onSuccess: set, onError: (e: Error) => toast.error(e.message) });
  const send = useMutation({
    mutationFn: () => api.post<LoginState>("/account/login/code", { code }),
    onSuccess: (v) => {
      setCode("");
      set(v);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancel = useMutation({
    mutationFn: () => api.del<LoginState>("/account/login"),
    onSuccess: (v) => {
      setCode("");
      set(v);
    },
  });
  const out = useMutation({
    mutationFn: () => api.post<{ message: string }>("/account/logout"),
    onSuccess: (r) => {
      toast.success(r.message || "Signed out");
      void refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const signOut = async () => {
    const ok = await confirm({ title: "Sign out of Claude Code?", body: "Sessions here and in the terminal can't run until you sign in again.", confirm: "Sign out", danger: true });
    if (ok) out.mutate();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (code.trim()) send.mutate();
  };

  if (s?.state === "waiting" || s?.state === "checking")
    return (
      <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-primary-line bg-surface p-4">
        {s.url && (
          <a href={s.url} target="_blank" rel="noreferrer" className="font-medium">
            Open the Claude sign-in page
          </a>
        )}
        <label htmlFor="signin-code" className="text-[14px] font-medium">
          Code from the sign-in page
        </label>
        <div className="flex flex-wrap gap-2">
          <Input id="signin-code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} disabled={s.state === "checking"} className="min-w-0 flex-1 basis-48 font-mono" />
          <Button type="submit" disabled={!code.trim() || s.state === "checking"} busy={send.isPending || s.state === "checking"}>
            Sign in
          </Button>
          <Button type="button" variant="outline" onClick={() => cancel.mutate()}>
            Cancel
          </Button>
        </div>
        {s.state === "waiting" && s.message && (
          <p role="alert" className="text-[13.5px] text-danger">
            {s.message}
          </p>
        )}
      </form>
    );
  return (
    <div className="flex flex-col gap-2">
      {s?.state === "failed" && (
        <p role="alert" className="text-[13.5px] text-danger">
          {s.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant={signedIn ? "outline" : "default"} busy={start.isPending} onClick={() => start.mutate()}>
          {signedIn ? "Sign in with another Claude account" : "Sign in with a Claude account"}
        </Button>
        {signedIn && (
          <Button variant="outline" busy={out.isPending} onClick={signOut}>
            Sign out
          </Button>
        )}
      </div>
    </div>
  );
}
