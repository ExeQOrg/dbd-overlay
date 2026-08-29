import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";

import Overlay from "./Overlay";
import MainLayout from "./layout/MainLayout";
import MapsSyncGate from "./layout/MapsSyncGate";
import GalleryPage from "./pages/GalleryPage";
import MapDetectionPage from "./pages/MapDetectionPage";
import GlobalSettingsPage from "./pages/GlobalSettingsPage";
import { DetectionProvider } from "./lib/DetectionContext";

import "./App.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/overlay" element={<Overlay />} />
        <Route path="/overlay-popout" element={<Overlay chromaKey />} />
        <Route
          element={
            <DetectionProvider>
              <MapsSyncGate>
                <MainLayout />
              </MapsSyncGate>
            </DetectionProvider>
          }
        >
          <Route path="/" element={<Navigate to="/gallery" replace />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="/detect" element={<MapDetectionPage />} />
          <Route path="/settings" element={<GlobalSettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  </React.StrictMode>,
);
