import React from "react";
import AppProviders from "./components/AppProviders";
import AppRouter from "./routes/AppRouter";

export default function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}
