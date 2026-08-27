import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "./layout/MainLayout";
import Gallery from "./pages/Gallery";
import OverlayControls from "./pages/OverlayControls";
import MapDetection from "./pages/MapDetection";
import Settings from "./pages/Settings";
import Overlay from "./Overlay";
import { DetectionProvider } from "./lib/DetectionContext";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/overlay" element={<Overlay />} />
        <Route
          element={
            <DetectionProvider>
              <MainLayout />
            </DetectionProvider>
          }
        >
          <Route path="/" element={<Navigate to="/gallery" replace />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/controls" element={<OverlayControls />} />
          <Route path="/detect" element={<MapDetection />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </HashRouter>
  </React.StrictMode>,
);
