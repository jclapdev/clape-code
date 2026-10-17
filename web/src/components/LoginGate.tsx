import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import {  } from "./ui";

/** In home-network mode, other devices sign in with the password before seeing anything. */
export function LoginGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["auth"], queryFn: () => api.get<{ lanEnabled: boolean; loggedIn: boolean; isLocal: boolean }>("/auth/status") });
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onNeed = () => qc.invalidateQueries({ queryKey: ["auth"] });
    window.addEventListener("cc:login-required", onNeed);
    return () => window.removeEventListener("cc:login-required", onNeed);
  }, [qc]);

  if (!status.data || status.data.loggedIn) return <>{children}</>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/login", { password });
      await qc.invalidateQueries();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't sign in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid h-full place-items-center p-4">
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-line bg-surface p-6">
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="size-7" />
          <h1 className="text-[18px] font-semibold">Control Center</h1>
        </div>
        <p className="text-muted-foreground">Enter the password set on the computer running the app.</p>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-ink-2">Password</span>
          <Input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 text-[15px]"
          />
        </label>
        {error && <p className="text-danger">{error}</p>}
        <Button size="lg" type="submit" variant="default" busy={busy} disabled={!password}>
          Sign in
        </Button>
      </form>
    </div>
  );
}
