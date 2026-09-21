import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import ClienteApp from "./ClienteApp.tsx";
import { ClientProvider } from "./lib/client";
import "./index.css";

// El panel-cliente (paquete vendido) vive en /cliente y es una app aparte:
// no comparte el selector de tenants ni ninguna vista de operación (BM).
const esPanelCliente = window.location.pathname.startsWith("/cliente");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {esPanelCliente ? (
      <ClienteApp />
    ) : (
      <ClientProvider>
        <App />
      </ClientProvider>
    )}
  </React.StrictMode>
);
