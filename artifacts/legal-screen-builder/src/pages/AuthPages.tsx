// ── Self-hosted sign-in / sign-up / password-reset pages (replaces Clerk's
// hosted widgets). Visual language matches the old clerkAppearance theme so
// the swap is invisible to users: dark card, orange accent, same fonts. ────

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, useSearch } from "wouter";
import {
  useLogin, useRegister, useResetPassword, useAuthProviders,
  useSecurityQuestions, useRecoverAccount, useRecoverAccountLookup, usePasskeyLogin,
} from "../lib/auth";
import { browserSupportsWebAuthn } from "../lib/webauthnLogin";

const ORANGE = "#d9711f";
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Remembers the last username/email someone signed in with on this device,
// so returning users see the field pre-filled instead of a blank form.
const REMEMBERED_USERNAME_KEY = "hyperlaw_last_username";
function getRememberedUsername(): string {
  try { return localStorage.getItem(REMEMBERED_USERNAME_KEY) ?? ""; } catch { return ""; }
}
function rememberUsername(value: string): void {
  try { localStorage.setItem(REMEMBERED_USERNAME_KEY, value); } catch { /* private browsing, etc. — safe to skip */ }
}

const pageStyle: React.CSSProperties = {
  minHeight: "var(--app-100dvh, 100dvh)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  background:
    "radial-gradient(ellipse 800px 400px at 50% -5%, rgba(244,93,1,0.12), transparent 60%), #0a0908",
  padding: "24px 16px",
  fontFamily: "Arial, sans-serif",
};

const cardStyle: React.CSSProperties = {
  background: "#141210",
  borderRadius: 16,
  width: 440,
  maxWidth: "100%",
  border: "1px solid #2a2521",
  padding: "32px 28px",
};

const titleStyle: React.CSSProperties = {
  color: "#f4efe8",
  fontFamily: "Arial Black, Arial, sans-serif",
  fontSize: 22,
  margin: "0 0 4px",
  textAlign: "center",
};

const subtitleStyle: React.CSSProperties = {
  color: "#9c948a",
  fontSize: 13,
  margin: "0 0 24px",
  textAlign: "center",
};

const labelStyle: React.CSSProperties = { color: "#9c948a", fontSize: 13, display: "block", marginBottom: 6 };

const inputStyle: React.CSSProperties = {
  background: "#1b1815",
  border: "1px solid #2a2521",
  borderRadius: 10,
  color: "#f4efe8",
  padding: "11px 14px",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
};

const errorStyle: React.CSSProperties = { color: "#f87171", fontSize: 12, marginTop: 4 };

const buttonStyle: React.CSSProperties = {
  background: `linear-gradient(90deg, ${ORANGE}, #f45d01)`,
  color: "#0a0908",
  fontWeight: 700,
  letterSpacing: "0.05em",
  border: "none",
  borderRadius: 10,
  padding: "12px",
  fontSize: 14,
  width: "100%",
  cursor: "pointer",
};

const socialButtonStyle: React.CSSProperties = {
  background: "#1b1815",
  border: "1px solid #2a2521",
  color: "#f4efe8",
  borderRadius: 10,
  padding: "11px",
  fontSize: 13,
  fontWeight: 600,
  width: "100%",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};

const linkStyle: React.CSSProperties = { color: ORANGE, textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer" };

const alertStyle: React.CSSProperties = {
  background: "#1a0e0e", border: "1px solid #3a1a1a", borderRadius: 8,
  padding: "10px 12px", color: "#f87171", fontSize: 13, marginBottom: 16,
};

const successStyle: React.CSSProperties = {
  background: "#0e1a0e", border: "1px solid #1a3a1a", borderRadius: 8,
  padding: "10px 12px", color: "#4ade80", fontSize: 13, marginBottom: 16,
};

function AuthLogo() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "0 0 12px" }}>
      <img src={`${basePath}/logo.svg`} alt="HyperLaw" style={{ height: 36, width: "auto" }} />
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {error && <div style={errorStyle}>{error}</div>}
    </div>
  );
}

const EyeIcon = ({ open }: { open: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9c948a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {open ? (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ) : (
      <>
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <path d="M6.61 6.61A18.5 18.5 0 0 0 1 12s4 8 11 8a9.26 9.26 0 0 0 5.39-1.61" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </>
    )}
  </svg>
);

/** Password input with a show/hide toggle — react-hook-form's register()
 *  spread is passed straight through, same as a plain <input>. */
function PasswordField({ registerProps, autoComplete }: { registerProps: ReturnType<ReturnType<typeof useForm>["register"]>; autoComplete: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input style={{ ...inputStyle, paddingRight: 40 }} type={visible ? "text" : "password"} {...registerProps} autoComplete={autoComplete} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", padding: 4, cursor: "pointer", display: "flex" }}
      >
        <EyeIcon open={visible} />
      </button>
    </div>
  );
}

function SocialButtons() {
  const { data: providers } = useAuthProviders();
  if (!providers?.google && !providers?.apple) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
      {providers.google && (
        <a href={`${basePath}/api/auth/google`} style={{ textDecoration: "none" }}>
          <button type="button" style={socialButtonStyle}>Continue with Google</button>
        </a>
      )}
      {providers.apple && (
        <button type="button" style={socialButtonStyle} onClick={triggerAppleSignIn}>
          Continue with Apple
        </button>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#4a4542", fontSize: 12 }}>
        <div style={{ flex: 1, height: 1, background: "#2a2521" }} />
        or
        <div style={{ flex: 1, height: 1, background: "#2a2521" }} />
      </div>
    </div>
  );
}

/** Apple's JS SDK posts the id_token to our callback directly (form_post) —
 *  loaded lazily so pages that don't need it never pay for the script. */
function triggerAppleSignIn() {
  const w = window as unknown as { AppleID?: { auth: { signIn: () => void } } };
  if (w.AppleID) { w.AppleID.auth.signIn(); return; }
  const script = document.createElement("script");
  script.src = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
  script.onload = () => (window as unknown as { AppleID?: { auth: { signIn: () => void } } }).AppleID?.auth.signIn();
  document.head.appendChild(script);
}

const TOS_LINKS = (
  <p style={{ marginTop: 20, textAlign: "center", fontSize: 11, lineHeight: 1.65, color: ORANGE, maxWidth: 340 }}>
    By signing in or creating an account, you agree to HyperLaw's{" "}
    <a href={`${basePath}/legal.html`} target="_blank" rel="noopener noreferrer" style={{ color: ORANGE, textDecoration: "underline", textUnderlineOffset: 2 }}>
      Terms of Service
    </a>{" "}
    and{" "}
    <a href={`${basePath}/legal.html`} target="_blank" rel="noopener noreferrer" style={{ color: ORANGE, textDecoration: "underline", textUnderlineOffset: 2 }}>
      Privacy Policy
    </a>.
  </p>
);

// ── Sign in ──────────────────────────────────────────────────────────────

const signInSchema = z.object({
  usernameOrEmail: z.string().min(1, "Enter your username or email"),
  password: z.string().min(1, "Enter your password"),
  rememberMe: z.boolean().optional(),
});
type SignInValues = z.infer<typeof signInSchema>;

export function SignInPage() {
  const [, navigate] = useLocation();
  const login = useLogin();
  const passkeyLogin = usePasskeyLogin();
  const showPasskeyOption = browserSupportsWebAuthn();
  const { register, handleSubmit, formState: { errors } } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { usernameOrEmail: getRememberedUsername() },
  });

  const onSubmit = (values: SignInValues) => {
    login.mutate(values, {
      onSuccess: () => { rememberUsername(values.usernameOrEmail); navigate(`${basePath}/`); },
    });
  };

  const onPasskeyClick = () => {
    passkeyLogin.mutate(undefined, {
      onSuccess: (user) => { rememberUsername(user.username); navigate(`${basePath}/`); },
    });
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <AuthLogo />
        <h1 style={titleStyle}>Welcome back</h1>
        <p style={subtitleStyle}>Sign in to access your cases</p>
        <SocialButtons />
        {login.isError && <div style={alertStyle}>{login.error.message}</div>}
        <form onSubmit={handleSubmit(onSubmit)}>
          <Field label="Username or email" error={errors.usernameOrEmail?.message}>
            <input style={inputStyle} {...register("usernameOrEmail")} autoComplete="username" />
          </Field>
          <Field label="Password" error={errors.password?.message}>
            <PasswordField registerProps={register("password")} autoComplete="current-password" />
          </Field>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#9c948a", fontSize: 12 }}>
              <input type="checkbox" {...register("rememberMe")} /> Remember me
            </label>
            <span style={{ ...linkStyle, fontSize: 12 }} onClick={() => navigate(`${basePath}/forgot-password`)}>
              Forgot password?
            </span>
          </div>
          {showPasskeyOption ? (
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" style={{ ...buttonStyle, flex: 1 }} disabled={login.isPending}>
                {login.isPending ? "Signing in…" : "Sign in"}
              </button>
              <button
                type="button"
                style={{ ...socialButtonStyle, flex: 1, color: ORANGE, borderColor: ORANGE }}
                disabled={passkeyLogin.isPending}
                onClick={onPasskeyClick}
              >
                {passkeyLogin.isPending ? "Waiting…" : "Sign in with a passkey"}
              </button>
            </div>
          ) : (
            <button type="submit" style={buttonStyle} disabled={login.isPending}>
              {login.isPending ? "Signing in…" : "Sign in"}
            </button>
          )}
          {passkeyLogin.isError && <div style={{ ...errorStyle, marginTop: 8 }}>{passkeyLogin.error.message}</div>}
        </form>
        <div style={{ textAlign: "center", marginTop: 18, fontSize: 13, color: "#666360" }}>
          Don't have an account?{" "}
          <span style={linkStyle} onClick={() => navigate(`${basePath}/sign-up`)}>Sign up</span>
        </div>
      </div>
      {TOS_LINKS}
    </div>
  );
}

// ── Sign up ──────────────────────────────────────────────────────────────

// Fallback labels shown before /api/auth/security-questions resolves — must
// stay in sync with SECURITY_QUESTIONS in services/auth.ts on the backend.
const DEFAULT_SECURITY_QUESTIONS = [
  "What street did you grow up on?",
  "What is your mother's first name?",
  "What was your favorite TV show as a child?",
];

const signUpSchema = z.object({
  username: z.string().min(3, "At least 3 characters"),
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  phoneNumber: z.string().min(7, "Enter a valid phone number"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
  confirmPassword: z.string(),
  securityAnswer1: z.string().min(1, "Required"),
  securityAnswer2: z.string().min(1, "Required"),
  securityAnswer3: z.string().min(1, "Required"),
  isAdminRequest: z.boolean().optional(),
  secondaryEmail: z.string().optional(),
  ssnLast4: z.string().optional(),
  adminSecurityQuestion: z.string().optional(),
  adminSecurityAnswer: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
}).superRefine((data, ctx) => {
  if (!data.isAdminRequest) return;
  if (!data.secondaryEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.secondaryEmail)) {
    ctx.addIssue({ code: "custom", message: "Enter a valid second email address", path: ["secondaryEmail"] });
  }
  if (!data.ssnLast4 || !/^\d{4}$/.test(data.ssnLast4)) {
    ctx.addIssue({ code: "custom", message: "Enter exactly 4 digits", path: ["ssnLast4"] });
  }
  if (!data.adminSecurityQuestion?.trim()) {
    ctx.addIssue({ code: "custom", message: "Write your own security question", path: ["adminSecurityQuestion"] });
  }
  if (!data.adminSecurityAnswer?.trim()) {
    ctx.addIssue({ code: "custom", message: "Answer your security question", path: ["adminSecurityAnswer"] });
  }
});
type SignUpValues = z.infer<typeof signUpSchema>;

export function SignUpPage() {
  const [, navigate] = useLocation();
  const register_ = useRegister();
  const { data: fetchedQuestions } = useSecurityQuestions();
  const questions = fetchedQuestions?.length ? fetchedQuestions : DEFAULT_SECURITY_QUESTIONS;
  const { register, handleSubmit, watch, formState: { errors } } = useForm<SignUpValues>({ resolver: zodResolver(signUpSchema) });
  const isAdminRequest = watch("isAdminRequest");

  const onSubmit = (values: SignUpValues) => {
    register_.mutate(values, { onSuccess: () => navigate(`${basePath}/`) });
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <AuthLogo />
        <h1 style={titleStyle}>Create your account</h1>
        <p style={subtitleStyle}>Start organizing your case today</p>
        <SocialButtons />
        {register_.isError && <div style={alertStyle}>{register_.error.message}</div>}
        <form onSubmit={handleSubmit(onSubmit)}>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Field label="First name" error={errors.firstName?.message}>
                <input style={inputStyle} {...register("firstName")} autoComplete="given-name" />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="Last name" error={errors.lastName?.message}>
                <input style={inputStyle} {...register("lastName")} autoComplete="family-name" />
              </Field>
            </div>
          </div>
          <Field label="Username" error={errors.username?.message}>
            <input style={inputStyle} {...register("username")} autoComplete="username" />
          </Field>
          <Field label="Phone number" error={errors.phoneNumber?.message}>
            <input style={inputStyle} type="tel" {...register("phoneNumber")} autoComplete="tel" />
          </Field>
          <Field label="Email address" error={errors.email?.message}>
            <input style={inputStyle} type="email" {...register("email")} autoComplete="email" />
          </Field>
          <Field label="Password" error={errors.password?.message}>
            <input style={inputStyle} type="password" {...register("password")} autoComplete="new-password" />
          </Field>
          <Field label="Confirm password" error={errors.confirmPassword?.message}>
            <input style={inputStyle} type="password" {...register("confirmPassword")} autoComplete="new-password" />
          </Field>

          <p style={{ ...subtitleStyle, textAlign: "left", margin: "18px 0 12px" }}>
            Security questions — used to get back into your account if you ever lose access to your email
          </p>
          <Field label={questions[0]} error={errors.securityAnswer1?.message}>
            <input style={inputStyle} {...register("securityAnswer1")} autoComplete="off" />
          </Field>
          <Field label={questions[1]} error={errors.securityAnswer2?.message}>
            <input style={inputStyle} {...register("securityAnswer2")} autoComplete="off" />
          </Field>
          <Field label={questions[2]} error={errors.securityAnswer3?.message}>
            <input style={inputStyle} {...register("securityAnswer3")} autoComplete="off" />
          </Field>

          <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#9c948a", fontSize: 13, margin: "18px 0 4px" }}>
            <input type="checkbox" {...register("isAdminRequest")} /> This is an admin account
          </label>

          {isAdminRequest && (
            <div style={{ marginTop: 10 }}>
              <p style={{ ...subtitleStyle, textAlign: "left", margin: "0 0 12px" }}>
                Admin accounts need extra verification — both authorized email addresses are required, one as primary and one as second.
              </p>
              <Field label="Second email address" error={errors.secondaryEmail?.message}>
                <input style={inputStyle} type="email" {...register("secondaryEmail")} autoComplete="off" />
              </Field>
              <Field label="Last 4 digits of your SSN" error={errors.ssnLast4?.message}>
                <input style={inputStyle} inputMode="numeric" maxLength={4} {...register("ssnLast4")} autoComplete="off" />
              </Field>
              <Field label="Write your own security question" error={errors.adminSecurityQuestion?.message}>
                <input style={inputStyle} placeholder="Something only you would know" {...register("adminSecurityQuestion")} autoComplete="off" />
              </Field>
              <Field label="Answer to your question" error={errors.adminSecurityAnswer?.message}>
                <input style={inputStyle} {...register("adminSecurityAnswer")} autoComplete="off" />
              </Field>
            </div>
          )}

          <button type="submit" style={{ ...buttonStyle, marginTop: 4 }} disabled={register_.isPending}>
            {register_.isPending ? "Creating account…" : "Create account"}
          </button>
        </form>
        <div style={{ textAlign: "center", marginTop: 18, fontSize: 13, color: "#666360" }}>
          Already have an account?{" "}
          <span style={linkStyle} onClick={() => navigate(`${basePath}/sign-in`)}>Sign in</span>
        </div>
      </div>
      {TOS_LINKS}
    </div>
  );
}

// ── Reset password (from emailed link, ?token=…) ────────────────────────

const resetSchema = z.object({
  password: z.string().min(8, "At least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});
type ResetValues = z.infer<typeof resetSchema>;

export function ResetPasswordPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") ?? "";
  const reset = useResetPassword();
  const { register, handleSubmit, formState: { errors } } = useForm<ResetValues>({ resolver: zodResolver(resetSchema) });

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Set a new password</h1>
        <p style={subtitleStyle}>Choose a new password for your account</p>
        {!token ? (
          <div style={alertStyle}>This link is missing its reset token — request a new one.</div>
        ) : reset.isSuccess ? (
          <div style={successStyle}>Password updated. You can sign in with it now.</div>
        ) : (
          <>
            {reset.isError && <div style={alertStyle}>{reset.error.message}</div>}
            <form onSubmit={handleSubmit((v) => reset.mutate({ token, password: v.password }))}>
              <Field label="New password" error={errors.password?.message}>
                <input style={inputStyle} type="password" {...register("password")} autoComplete="new-password" />
              </Field>
              <Field label="Confirm new password" error={errors.confirmPassword?.message}>
                <input style={inputStyle} type="password" {...register("confirmPassword")} autoComplete="new-password" />
              </Field>
              <button type="submit" style={buttonStyle} disabled={reset.isPending}>
                {reset.isPending ? "Saving…" : "Update password"}
              </button>
            </form>
          </>
        )}
        <div style={{ textAlign: "center", marginTop: 18, fontSize: 13, color: "#666360" }}>
          <span style={linkStyle} onClick={() => navigate(`${basePath}/sign-in`)}>Back to sign in</span>
        </div>
      </div>
    </div>
  );
}

// ── Reset password (no email needed — identity + security answers,
// straight through to setting a new password). Three steps: an intro screen
// with just the "Recover with security questions" button, an identity-
// confirmation form, then the security questions themselves — plus, for
// admin accounts, their own self-authored question, only revealed after
// identity is confirmed. ───────────────────────────────────────────────

const recoverSchema = z.object({
  email: z.string().email("Enter a valid email"),
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  username: z.string().optional(),
  phoneNumber: z.string().optional(),
  securityAnswer1: z.string().min(1, "Required"),
  securityAnswer2: z.string().min(1, "Required"),
  securityAnswer3: z.string().min(1, "Required"),
  adminSecurityAnswer: z.string().optional(),
  adminEmail1: z.string().optional(),
  adminEmail2: z.string().optional(),
}).superRefine((data, ctx) => {
  if (!data.username?.trim() && !data.phoneNumber?.trim()) {
    ctx.addIssue({ code: "custom", message: "Enter your username or phone number", path: ["username"] });
    ctx.addIssue({ code: "custom", message: "Enter your username or phone number", path: ["phoneNumber"] });
  }
});
type RecoverValues = z.infer<typeof recoverSchema>;

export function ForgotPasswordPage() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [identifierType, setIdentifierType] = useState<"username" | "phone">("username");
  const [adminInfo, setAdminInfo] = useState<{ isAdmin: boolean; adminSecurityQuestion: string | null } | null>(null);
  const lookup = useRecoverAccountLookup();
  const recover = useRecoverAccount();
  const { data: fetchedQuestions } = useSecurityQuestions();
  const questions = fetchedQuestions?.length ? fetchedQuestions : DEFAULT_SECURITY_QUESTIONS;
  const { register, handleSubmit, trigger, setValue, setError, getValues, formState: { errors } } = useForm<RecoverValues>({ resolver: zodResolver(recoverSchema) });

  const chooseIdentifierType = (type: "username" | "phone") => {
    setIdentifierType(type);
    setValue(type === "username" ? "phoneNumber" : "username", "");
  };

  const goToStep2 = async () => {
    const valid = await trigger(["email", "firstName", "lastName", "username", "phoneNumber"]);
    if (!valid) return;
    const { email, firstName, lastName, username, phoneNumber } = getValues();
    lookup.mutate(
      { email, firstName, lastName, username: username || undefined, phoneNumber: phoneNumber || undefined },
      { onSuccess: (data) => { setAdminInfo(data); setStep(2); } },
    );
  };

  const onSubmit = (values: RecoverValues) => {
    if (adminInfo?.isAdmin) {
      if (!values.adminSecurityAnswer?.trim()) {
        setError("adminSecurityAnswer", { message: "Required" });
        return;
      }
      if (!values.adminEmail1?.trim() || !EMAIL_RE.test(values.adminEmail1)) {
        setError("adminEmail1", { message: "Enter a valid email" });
        return;
      }
      if (!values.adminEmail2?.trim() || !EMAIL_RE.test(values.adminEmail2)) {
        setError("adminEmail2", { message: "Enter a valid email" });
        return;
      }
    }
    recover.mutate(values, { onSuccess: (data) => navigate(`${basePath}${data.resetLink}`) });
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <AuthLogo />
        <h1 style={titleStyle}>Reset your password</h1>

        {step === 0 && (
          <>
            <p style={subtitleStyle}>Verify your identity to set a new password</p>
            <button type="button" style={buttonStyle} onClick={() => setStep(1)}>
              Recover with security questions
            </button>
          </>
        )}

        {step > 0 && (
          <>
            <p style={subtitleStyle}>
              {step === 1 ? "Confirm who you are" : "Answer your security questions"}
            </p>
            <form onSubmit={handleSubmit(onSubmit)}>
              <div style={{ display: step === 1 ? "block" : "none" }}>
                <Field label="Email address" error={errors.email?.message}>
                  <input style={inputStyle} type="email" {...register("email")} autoComplete="email" />
                </Field>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <Field label="First name" error={errors.firstName?.message}>
                      <input style={inputStyle} {...register("firstName")} autoComplete="given-name" />
                    </Field>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Field label="Last name" error={errors.lastName?.message}>
                      <input style={inputStyle} {...register("lastName")} autoComplete="family-name" />
                    </Field>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <button
                    type="button"
                    onClick={() => chooseIdentifierType("username")}
                    style={{
                      ...socialButtonStyle,
                      padding: "8px",
                      fontSize: 12,
                      borderColor: identifierType === "username" ? ORANGE : "#2a2521",
                      color: identifierType === "username" ? ORANGE : "#f4efe8",
                    }}
                  >
                    Use username
                  </button>
                  <button
                    type="button"
                    onClick={() => chooseIdentifierType("phone")}
                    style={{
                      ...socialButtonStyle,
                      padding: "8px",
                      fontSize: 12,
                      borderColor: identifierType === "phone" ? ORANGE : "#2a2521",
                      color: identifierType === "phone" ? ORANGE : "#f4efe8",
                    }}
                  >
                    Use phone number
                  </button>
                </div>
                {identifierType === "username" ? (
                  <Field label="Username" error={errors.username?.message}>
                    <input style={inputStyle} {...register("username")} autoComplete="username" />
                  </Field>
                ) : (
                  <Field label="Phone number" error={errors.phoneNumber?.message}>
                    <input style={inputStyle} type="tel" {...register("phoneNumber")} autoComplete="tel" />
                  </Field>
                )}

                {lookup.isError && <div style={alertStyle}>{lookup.error.message}</div>}
                <button type="button" style={{ ...buttonStyle, marginTop: 4 }} onClick={goToStep2} disabled={lookup.isPending}>
                  {lookup.isPending ? "Checking…" : "Next"}
                </button>
              </div>

              {step === 2 && (
                <div>
                  {recover.isError && <div style={alertStyle}>{recover.error.message}</div>}
                  <Field label={questions[0]} error={errors.securityAnswer1?.message}>
                    <input style={inputStyle} {...register("securityAnswer1")} autoComplete="off" />
                  </Field>
                  <Field label={questions[1]} error={errors.securityAnswer2?.message}>
                    <input style={inputStyle} {...register("securityAnswer2")} autoComplete="off" />
                  </Field>
                  <Field label={questions[2]} error={errors.securityAnswer3?.message}>
                    <input style={inputStyle} {...register("securityAnswer3")} autoComplete="off" />
                  </Field>
                  {adminInfo?.isAdmin && (
                    <>
                      <Field label={adminInfo.adminSecurityQuestion ?? "Your admin security question"} error={errors.adminSecurityAnswer?.message}>
                        <input style={inputStyle} {...register("adminSecurityAnswer")} autoComplete="off" />
                      </Field>
                      <p style={{ ...subtitleStyle, textAlign: "left", margin: "12px 0 12px", fontSize: 12 }}>
                        Admin accounts on file — type both email addresses
                      </p>
                      <Field label="First email on file" error={errors.adminEmail1?.message}>
                        <input style={inputStyle} type="email" {...register("adminEmail1")} autoComplete="off" />
                      </Field>
                      <Field label="Second email on file" error={errors.adminEmail2?.message}>
                        <input style={inputStyle} type="email" {...register("adminEmail2")} autoComplete="off" />
                      </Field>
                    </>
                  )}
                  <button type="submit" style={{ ...buttonStyle, marginTop: 4 }} disabled={recover.isPending}>
                    {recover.isPending ? "Verifying…" : "Continue"}
                  </button>
                  <div style={{ textAlign: "center", marginTop: 12, fontSize: 12 }}>
                    <span style={linkStyle} onClick={() => setStep(1)}>Back</span>
                  </div>
                </div>
              )}
            </form>
          </>
        )}

        <div style={{ textAlign: "center", marginTop: 18, fontSize: 13, color: "#666360" }}>
          <span style={linkStyle} onClick={() => navigate(`${basePath}/sign-in`)}>Back to sign in</span>
        </div>
      </div>
    </div>
  );
}

// ── Verify email (from emailed link, ?token=…) ──────────────────────────

export function VerifyEmailPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") ?? "";
  const [status, setStatus] = useState<"pending" | "ok" | "error">("pending");

  useEffect(() => {
    if (!token) { setStatus("error"); return; }
    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then((r) => setStatus(r.ok ? "ok" : "error"))
      .catch(() => setStatus("error"));
  }, [token]);

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Verify your email</h1>
        {status === "pending" && <p style={subtitleStyle}>Confirming…</p>}
        {status === "ok" && <div style={successStyle}>Your email is verified.</div>}
        {status === "error" && <div style={alertStyle}>This verification link is invalid or has expired.</div>}
        <button type="button" style={buttonStyle} onClick={() => navigate(`${basePath}/`)}>Continue</button>
      </div>
    </div>
  );
}
