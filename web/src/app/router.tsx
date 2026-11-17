import { createBrowserRouter } from "react-router";
import { DemoRoute } from "../routes/DemoRoute";
import { JointRoute } from "../routes/JointRoute";
import { LandingRoute } from "../routes/LandingRoute";
import { ProjectRoute } from "../routes/ProjectRoute";
import { ReportRoute } from "../routes/ReportRoute";
import { ReviewRoute } from "../routes/ReviewRoute";
import { StyleguideRoute } from "../routes/StyleguideRoute";
import { UploadRoute } from "../routes/UploadRoute";
import { AppShell } from "./AppShell";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <LandingRoute /> },
      { path: "demo", element: <DemoRoute /> },
      { path: "projects/:id", element: <ProjectRoute /> },
      { path: "projects/:id/upload", element: <UploadRoute /> },
      { path: "projects/:id/review", element: <ReviewRoute /> },
      { path: "projects/:id/joints/:jointId", element: <JointRoute /> },
      { path: "projects/:id/report", element: <ReportRoute /> },
      { path: "styleguide", element: <StyleguideRoute /> },
    ],
  },
]);
