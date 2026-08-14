import { createContext, type ReactNode, useContext } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string | null;
  roles: Array<"customer" | "companion" | "admin">;
  ageConfirmed: boolean;
  suspended: boolean;
  riskLevel: string;
};

type AuthContextValue = {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<unknown>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refresh: async () => undefined,
  logout: async () => undefined,
});

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json() as { error?: string };
    return body.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function requestOtp(email: string, purpose: "login" | "admin" = "login") {
  const res = await fetch("/api/auth/otp/request", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, purpose }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<{ sent: true; email: string; devCode?: string }>;
}

export async function verifyOtp(email: string, code: string, purpose: "login" | "admin" = "login") {
  const res = await fetch("/api/auth/otp/verify", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code, purpose }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<{ user: SessionUser }>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["auth-me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.status === 401) return { user: null as SessionUser | null };
      if (!res.ok) throw new Error(await readError(res));
      return res.json() as Promise<{ user: SessionUser }>;
    },
    retry: false,
    staleTime: 15_000,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    },
    onSuccess: () => {
      qc.setQueryData(["auth-me"], { user: null });
      qc.invalidateQueries();
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: query.data?.user ?? null,
        loading: query.isLoading,
        refresh: () => query.refetch(),
        logout: async () => {
          await logoutMutation.mutateAsync();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function dashboardPath(user: SessionUser | null): string {
  if (!user) return "/login";
  if (user.roles.includes("admin")) return "/admin/operations";
  if (user.roles.includes("companion")) return "/dashboard/companion";
  return "/dashboard/customer";
}
