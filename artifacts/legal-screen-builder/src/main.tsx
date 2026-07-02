import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  ClerkProvider,
  SignIn,
  SignUp,
  Show,
  useClerk,
} from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import {
  Switch,
  Route,
  useLocation,
  Router as WouterRouter,
  Redirect,
} from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import App from "./App";
import Landing from "./pages/Landing";
import "./index.css";

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: "top" as const,
    socialButtonsVariant: "blockButton" as const,
  },
  variables: {
    colorPrimary: "#d9711f",
    colorForeground: "#f4efe8",
    colorMutedForeground: "#9c948a",
    colorDanger: "#ef4444",
    colorBackground: "#141210",
    colorInput: "#1b1815",
    colorInputForeground: "#f4efe8",
    colorNeutral: "#2a2521",
    fontFamily: "Arial, sans-serif",
    borderRadius: "10px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#141210] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#2a2521]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: { color: "#f4efe8", fontFamily: "Arial Black, Arial, sans-serif" },
    headerSubtitle: { color: "#9c948a" },
    socialButtonsBlockButtonText: { color: "#f4efe8" },
    formFieldLabel: { color: "#9c948a", fontSize: "13px" },
    footerActionLink: { color: "#d9711f" },
    footerActionText: { color: "#666360" },
    dividerText: { color: "#4a4542" },
    identityPreviewEditButton: { color: "#d9711f" },
    formFieldSuccessText: { color: "#22c55e" },
    alertText: { color: "#f87171" },
    logoBox: { justifyContent: "center", padding: "8px 0 4px" },
    logoImage: { height: "36px", width: "auto" },
    socialButtonsBlockButton: {
      background: "#1b1815",
      border: "1px solid #2a2521",
      color: "#f4efe8",
    },
    formButtonPrimary: {
      background: "linear-gradient(90deg, #d9711f, #f45d01)",
      color: "#0a0908",
      fontWeight: "700",
      letterSpacing: "0.05em",
    },
    formFieldInput: {
      background: "#1b1815",
      border: "1px solid #2a2521",
      color: "#f4efe8",
    },
    footerAction: { background: "#0f0d0c", borderTop: "1px solid #2a2521" },
    dividerLine: { background: "#2a2521" },
    alert: { background: "#1a0e0e", border: "1px solid #3a1a1a" },
    otpCodeFieldInput: { background: "#1b1815", border: "1px solid #2a2521" },
    formFieldRow: {},
    main: { background: "#141210" },
  },
};

function SignInPage() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(ellipse 800px 400px at 50% -5%, rgba(244,93,1,0.12), transparent 60%), #0a0908",
        padding: "24px 16px",
      }}
    >
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(ellipse 800px 400px at 50% -5%, rgba(244,93,1,0.12), transparent 60%), #0a0908",
        padding: "24px 16px",
      }}
    >
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <App />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to access your cases",
          },
        },
        signUp: {
          start: {
            title: "Create your account",
            subtitle: "Start organizing your case today",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route>
            <Redirect to="/" />
          </Route>
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function Root() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

createRoot(document.getElementById("root")!).render(<Root />);
