import { createRoot } from "react-dom/client";
import {
  Switch,
  Route,
  Router as WouterRouter,
  Redirect,
} from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import WelcomePage from "./pages/WelcomePage";
import Plans from "./pages/Plans";
import { SignInPage, SignUpPage, ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from "./pages/AuthPages";
import { useAuth } from "./lib/auth";
import { isIosApp } from "./lib/platform";
import "./index.css";

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function HomeRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (user) return <App />;
  // WelcomePage is a marketing/sign-up landing page — the app wrapper is for
  // existing members only, so a signed-out visit there goes straight to Sign
  // In instead (which has its own quiet, web-only way to create an account).
  return isIosApp() ? <SignInPage /> : <WelcomePage />;
}

function AuthedApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/verify-email" component={VerifyEmailPage} />
        <Route path="/plans" component={Plans} />
        <Route>
          <Redirect to="/" />
        </Route>
      </Switch>
    </QueryClientProvider>
  );
}

function Root() {
  return (
    <WouterRouter base={basePath}>
      <AuthedApp />
    </WouterRouter>
  );
}

createRoot(document.getElementById("root")!).render(<Root />);
