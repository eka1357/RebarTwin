/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router";
import { RouteFallback } from "../components/RouteFallback";
import { AppShell } from "./AppShell";

const LandingRoute = lazy(() =>
  import("../routes/LandingRoute").then((m) => ({ default: m.LandingRoute })),
);
const DemoRoute = lazy(() => import("../routes/DemoRoute").then((m) => ({ default: m.DemoRoute })));
const ProjectRoute = lazy(() =>
  import("../routes/ProjectRoute").then((m) => ({ default: m.ProjectRoute })),
);
const UploadRoute = lazy(() =>
  import("../routes/UploadRoute").then((m) => ({ default: m.UploadRoute })),
);
const ReviewRoute = lazy(() =>
  import("../routes/ReviewRoute").then((m) => ({ default: m.ReviewRoute })),
);
const JointRoute = lazy(() =>
  import("../routes/JointRoute").then((m) => ({ default: m.JointRoute })),
);
const ReportRoute = lazy(() =>
  import("../routes/ReportRoute").then((m) => ({ default: m.ReportRoute })),
);
const StyleguideRoute = lazy(() =>
  import("../routes/StyleguideRoute").then((m) => ({ default: m.StyleguideRoute })),
);

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<RouteFallback />}>
            <LandingRoute />
          </Suspense>
        ),
      },
      {
        path: "demo",
        element: (
          <Suspense fallback={<RouteFallback />}>
            <DemoRoute />
          </Suspense>
        ),
      },
      {
        path: "projects/:id",
        element: (
          <Suspense fallback={<RouteFallback />}>
            <ProjectRoute />
          </Suspense>
        ),
      },
      {
        path: "projects/:id/upload",
        element: (
          <Suspense fallback={<RouteFallback />}>
            <UploadRoute />
          </Suspense>
        ),
      },
      {
        path: "projects/:id/review",
        element: (
          <Suspense fallback={<RouteFallback />}>
            <ReviewRoute />
          </Suspense>
        ),
      },
      {
        path: "projects/:id/joints/:jointId",
        element: (
          <Suspense fallback={<RouteFallback />}>
            <JointRoute />
          </Suspense>
        ),
      },
      {
        path: "projects/:id/report",
        element: (
          <Suspense fallback={<RouteFallback />}>
            <ReportRoute />
          </Suspense>
        ),
      },
      {
        path: "styleguide",
        element: (
          <Suspense fallback={<RouteFallback />}>
            <StyleguideRoute />
          </Suspense>
        ),
      },
    ],
  },
]);
