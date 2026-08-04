// ── Self-hosted auth (replaces Clerk) ───────────────────────────────────────
// react-query IS the provider here — no separate Context needed, same as
// ShortHop's use-auth.ts. useAuth() reads the "me" query directly; mutations
// seed that same cache key on success instead of triggering a refetch.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { signInWithPasskey } from "./webauthnLogin";

export interface AuthUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  email: string;
  emailVerified: boolean;
  googleId: string | null;
  appleId: string | null;
  isAdmin: boolean;
  isTester: boolean;
  secondaryEmail: string | null;
  stripeCustomerId: string | null;
  creditBalance: number;
  hasSeenWelcome: boolean;
  createdAt: string;
  updatedAt: string;
}

const ME_KEY = ["auth", "me"] as const;

async function fetchMe(): Promise<AuthUser | null> {
  const r = await fetch("/api/auth/me", { credentials: "include" });
  if (r.status === 401) return null;
  if (!r.ok) throw new Error("Failed to load session");
  return r.json();
}

export function useAuth(): { user: AuthUser | null; isLoading: boolean } {
  const { data, isLoading } = useQuery({ queryKey: ME_KEY, queryFn: fetchMe, staleTime: Infinity, retry: false });
  return { user: data ?? null, isLoading };
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error || "Something went wrong");
  return data as T;
}

export interface RegisterInput {
  username: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  password: string;
  confirmPassword: string;
  securityAnswer1: string;
  securityAnswer2: string;
  securityAnswer3: string;
  isAdminRequest?: boolean;
  secondaryEmail?: string;
  ssnLast4?: string;
  adminSecurityQuestion?: string;
  adminSecurityAnswer?: string;
  isTesterRequest?: boolean;
  testerCode?: string;
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) => postJson<AuthUser>("/api/auth/register", input),
    onSuccess: (user) => qc.setQueryData(ME_KEY, user),
  });
}

export function usePasskeyLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => signInWithPasskey<AuthUser>(),
    onSuccess: (user) => qc.setQueryData(ME_KEY, user),
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { usernameOrEmail: string; password: string; rememberMe?: boolean }) =>
      postJson<AuthUser>("/api/auth/login", {
        username: input.usernameOrEmail,
        password: input.password,
        rememberMe: input.rememberMe ?? false,
      }),
    onSuccess: (user) => qc.setQueryData(ME_KEY, user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postJson<{ ok: boolean }>("/api/auth/logout", {}),
    onSuccess: () => {
      qc.setQueryData(ME_KEY, null);
      qc.clear();
    },
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (input: { token: string; password: string }) =>
      postJson<{ ok: boolean }>("/api/auth/reset-password", input),
  });
}

export interface AuthProviders {
  google: boolean;
  apple: boolean;
}

export function useAuthProviders() {
  return useQuery({
    queryKey: ["auth", "providers"],
    queryFn: async (): Promise<AuthProviders> => {
      const r = await fetch("/api/auth/providers", { credentials: "include" });
      if (!r.ok) return { google: false, apple: false };
      return r.json();
    },
    staleTime: Infinity,
  });
}

/** The 3 fixed security questions, same order as securityAnswer{1,2,3} everywhere. */
export function useSecurityQuestions() {
  return useQuery({
    queryKey: ["auth", "security-questions"],
    queryFn: async (): Promise<string[]> => {
      const r = await fetch("/api/auth/security-questions", { credentials: "include" });
      if (!r.ok) return [];
      const data = await r.json();
      return data.questions ?? [];
    },
    staleTime: Infinity,
  });
}

export interface RecoverIdentityInput {
  email: string;
  firstName: string;
  lastName: string;
  username?: string;
  phoneNumber?: string;
}

export function useRecoverAccountLookup() {
  return useMutation({
    mutationFn: (input: RecoverIdentityInput) =>
      postJson<{ ok: boolean; isAdmin: boolean; adminSecurityQuestion: string | null }>("/api/auth/recover-account/lookup", input),
  });
}

export interface RecoverAccountInput extends RecoverIdentityInput {
  securityAnswer1: string;
  securityAnswer2: string;
  securityAnswer3: string;
  adminSecurityAnswer?: string;
  adminEmail1?: string;
  adminEmail2?: string;
}

export function useRecoverAccount() {
  return useMutation({
    mutationFn: (input: RecoverAccountInput) =>
      postJson<{ ok: boolean; resetLink: string }>("/api/auth/recover-account", input),
  });
}
