import { Navigate, Route, Routes, useLocation } from "react-router";
import { useEffect } from "react";
import { PageLoader } from "@client/components/ui/Spinner";
import { ErrorState } from "@client/components/ui/EmptyState";
import { useSession } from "./session";
import { AdminLayout } from "./AdminLayout";
import { LoginPage } from "./pages/LoginPage";
import { SetupPage } from "./pages/SetupPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ToursPage } from "./pages/ToursPage";
import { TourEditorPage } from "./pages/TourEditorPage";
import { CategoriesPage } from "./pages/CategoriesPage";
import { BookingsPage } from "./pages/BookingsPage";
import { BookingDetailPage } from "./pages/BookingDetailPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { ReviewsPage } from "./pages/ReviewsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { UsersPage } from "./pages/UsersPage";
import { CustomersPage } from "./pages/CustomersPage";
import { CustomerDetailPage } from "./pages/CustomerDetailPage";
import { AuditPage } from "./pages/AuditPage";
import { AccountPage } from "./pages/AccountPage";

function RequireSession({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const location = useLocation();
  if (session.isPending) return <PageLoader label="Checking your session" />;
  if (session.isError) return <div className="p-10"><ErrorState message="Could not reach the server." onRetry={() => session.refetch()} /></div>;
  if (!session.data) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function AdminApp() {
  useEffect(() => {
    document.title = "Admin | Her Journey Tours and Travels";
    // Admin pages must never be indexed.
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route path="setup" element={<SetupPage />} />
      <Route
        element={
          <RequireSession>
            <AdminLayout />
          </RequireSession>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="tours" element={<ToursPage />} />
        <Route path="tours/new" element={<TourEditorPage />} />
        <Route path="tours/:id" element={<TourEditorPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="bookings/:id" element={<BookingDetailPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="reviews" element={<ReviewsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="users" element={<CustomersPage />} />
        <Route path="users/:id" element={<CustomerDetailPage />} />
        <Route path="administrators" element={<UsersPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
