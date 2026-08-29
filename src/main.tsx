import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ReadingPage from "./ReadingPage";
import { tokenFromPath, upgradeTokenFromPath } from "./readingRoute";
import "./index.css";

/**
 * Two pages, and which one you get is decided by the path.
 *
 * `/r/<token>` is a delivered reading, `/u/<token>` is the tiles priced against
 * what that reading already owns, and everything else is the offer page. No
 * router library for three routes -- a dependency to decide two `if`s is a
 * dependency to keep up with forever.
 *
 * The token never becomes state, a prop that outlives the page, or a query
 * parameter. It is read once, here, from the address bar.
 */
const path = window.location.pathname;
const token = tokenFromPath(path);
const upgrading = upgradeTokenFromPath(path);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {token ? <ReadingPage token={token} /> : <App upgradeToken={upgrading} />}
  </StrictMode>,
);
