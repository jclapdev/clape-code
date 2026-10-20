// Which account Claude Code uses: the Account section on Settings.
import { useQuery } from "@tanstack/react-query";
import { api, enc } from "@/lib/api";
import type { Account } from "@/lib/types";
import { ErrorNote, Loading } from "@/components/ui";

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
    <dl className="flex max-w-[640px] flex-col divide-y divide-line rounded-lg border border-line bg-surface px-4">
      <Row label={cloud ? "Provider" : "Signed in with"} value={a.loggedIn === false ? "Not signed in" : a.methodName} />
      <Row label="Email" value={a.email} />
      <Row label="Organization" value={a.organization} />
      <Row label="Plan" value={a.plan} />
    </dl>
  );
}
