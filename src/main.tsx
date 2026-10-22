import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ReadingPage from "./ReadingPage";
import { addTimeKeyFromPath, isChartsPath, tokenFromPath, upgradeTokenFromPath } from "./readingRoute";
import { AddTimePage } from "./AddTime";
import MyChartsPage from "./MyCharts";
import "./index.css";

/**
 * Two pages, and which one you get is decided by the path.
 *
 * `/r/<token>` is a delivered reading, `/u/<token>` is the returning buyer's
 * question (release 2), `/charts/` is "Email me my charts", and everything else
 * is the offer page. No
 * router library for three routes -- a dependency to decide two `if`s is a
 * dependency to keep up with forever.
 *
 * The token never becomes state, a prop that outlives the page, or a query
 * parameter. It is read once, here, from the address bar.
 */
const path = window.location.pathname;
const token = tokenFromPath(path);
const upgrading = upgradeTokenFromPath(path);
const addTimeKey = addTimeKeyFromPath(path);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {token ? (
      <ReadingPage token={token} />
    ) : addTimeKey ? (
      <AddTimePage keyToken={addTimeKey} />
    ) : isChartsPath(path) ? (
      <MyChartsPage />
    ) : (
      <App upgradeToken={upgrading} />
    )}
  </StrictMode>,
);
