import { Badge } from "@client/components/ui/Badge";

export function SignInMethods({ hasPassword, hasGoogle }: { hasPassword: boolean; hasGoogle: boolean }) {
  return (
    <span className="flex flex-wrap gap-1">
      {hasPassword && <Badge tone="gray">Password</Badge>}
      {hasGoogle && <Badge tone="blue">Google</Badge>}
      {!hasPassword && !hasGoogle && <span className="text-xs text-muted">None</span>}
    </span>
  );
}

export function AccountStatus({ disabledAt }: { disabledAt: string | null }) {
  return disabledAt ? <Badge tone="red">Disabled</Badge> : <Badge tone="green">Active</Badge>;
}
