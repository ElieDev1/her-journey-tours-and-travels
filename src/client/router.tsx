import { createBrowserRouter } from "react-router";
import { SiteLayout } from "./components/site/SiteLayout";
import { PageLoader } from "./components/ui/Spinner";
import { HomePage } from "./pages/HomePage";
import { ToursPage } from "./pages/ToursPage";
import { TourDetailPage } from "./pages/TourDetailPage";
import { BookingPage } from "./pages/BookingPage";
import { BookingStatusPage } from "./pages/BookingStatusPage";
import { BookingLookupPage } from "./pages/BookingLookupPage";
import { ContactPage } from "./pages/ContactPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { AccountPage } from "./pages/AccountPage";

export const router = createBrowserRouter([
  {
    // The admin dashboard is a separate bundle, loaded only when visited.
    path: "/admin/*",
    lazy: async () => ({ Component: (await import("./admin/AdminApp")).AdminApp }),
    HydrateFallback: PageLoader,
  },
  {
    Component: SiteLayout,
    children: [
      { index: true, Component: HomePage },
      { path: "tours", Component: ToursPage },
      { path: "tours/:slug", Component: TourDetailPage },
      { path: "tours/:slug/book", Component: BookingPage },
      { path: "booking/lookup", Component: BookingLookupPage },
      { path: "booking/:reference", Component: BookingStatusPage },
      { path: "contact", Component: ContactPage },
      { path: "login", Component: LoginPage },
      { path: "register", Component: RegisterPage },
      { path: "account", Component: AccountPage },
      { path: "*", Component: NotFoundPage },
    ],
  },
]);
