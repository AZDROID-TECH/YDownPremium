import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import "boxicons/css/boxicons.min.css";
import "./index.css";
import { store } from "./app/store";
import { App } from "./app/App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);

