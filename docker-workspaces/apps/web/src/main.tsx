import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@workspace/ui/globals.css"
import { App } from "./App.tsx"
import { bootstrapAppearance } from "@/state/appearance"

// Apply the persisted theme *before* React mounts so the page never
// flashes the wrong theme on reload. AppearanceProvider then takes over
// and keeps it in sync as the user changes settings.
bootstrapAppearance()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
