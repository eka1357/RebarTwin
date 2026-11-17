import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import App from "./App";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { StyleguideRoute } from "./routes/StyleguideRoute";
import "./styles/globals.css";

const isStyleguide = window.location.pathname === "/styleguide";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        {isStyleguide ? <StyleguideRoute /> : <App />}
        <Toaster />
      </TooltipProvider>
    </MotionConfig>
  </StrictMode>,
);
