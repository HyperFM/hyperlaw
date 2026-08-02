import { createRoot } from "react-dom/client";
import {
  Switch,
  Route,
  Router as WouterRouter,
  Redirect,
  useLocation,
} from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import WelcomePage from "./pages/WelcomePage";
import Plans from "./pages/Plans";
import { SignInPage, SignUpPage, ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from "./pages/AuthPages";
import { useAuth } from "./lib/auth";
import { useViewportNudge } from "./lib/viewport";
import "./index.css";

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function HomeRedirect() {
  const { user, isLoading } = useAuth();
  // The moment loading resolves and real content first replaces the splash
  // is exactly when the iOS "Add to Home Screen" bottom-gap bug shows up.
  useViewportNudge([isLoading, user]);
  if (isLoading) return null;
  return user ? <App /> : <WelcomePage />;
}

function AuthedApp() {
  const [location] = useLocation();
  useViewportNudge([location]);
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
