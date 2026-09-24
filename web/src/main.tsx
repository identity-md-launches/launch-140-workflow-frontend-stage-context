import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DappProvider } from "./Dapp";
import "./styles.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DappProvider>
      <App />
    </DappProvider>
  </React.StrictMode>,
);
