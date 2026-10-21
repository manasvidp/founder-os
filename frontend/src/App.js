import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/Auth";
import Shell from "@/components/app/Shell";
import Login from "@/pages/Login";
import ResetPassword from "@/pages/ResetPassword";
import Onboarding from "@/pages/Onboarding";
import Home from "@/pages/Home";
import Tasks from "@/pages/Tasks";
import Projects, { ProjectDetail } from "@/pages/Projects";
import Plan from "@/pages/Plan";
import CalendarPage from "@/pages/Calendar";
import People from "@/pages/People";
import Finance from "@/pages/Finance";
import Personal from "@/pages/Personal";
import Notes from "@/pages/Notes";
import Reviews from "@/pages/Reviews";
import Chief from "@/pages/Chief";
import Settings from "@/pages/Settings";
import Business from "@/pages/Business";
import Content from "@/pages/Content";
import Knowledge from "@/pages/Knowledge";
import Privacy from "@/pages/Privacy";

const Loading = () => (
  <div className="grid h-screen place-items-center" data-testid="app-loading">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
  </div>
);

function Protected({ children, allowOnboarding }) {
  const { user } = useAuth();
  if (user === null) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (!allowOnboarding && !user.settings?.onboarding_complete) return <Navigate to="/onboarding" replace />;
  return children;
}

function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/onboarding" element={<Protected allowOnboarding><Onboarding /></Protected>} />
      <Route element={<Protected><Shell /></Protected>}>
        <Route path="/" element={<Home />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/people" element={<People />} />
        <Route path="/finance" element={<Finance />} />
        <Route path="/personal" element={<Personal />} />
        <Route path="/notes" element={<Notes />} />
        <Route path="/reviews" element={<Reviews />} />
        <Route path="/chief" element={<Chief />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/business" element={<Business />} />
        <Route path="/content" element={<Content />} />
        <Route path="/knowledge" element={<Knowledge />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
        <Toaster position="bottom-right" richColors closeButton />
      </AuthProvider>
    </BrowserRouter>
  );
}
