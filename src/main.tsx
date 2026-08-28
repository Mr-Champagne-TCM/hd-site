import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ReadingPage from "./ReadingPage";
import { tokenFromPath } from "./readingRoute";
import "./index.css";

/**
 * Two pages, and which one you get is decided by the path.
 *
 * `/r/<token>` is a delivered reading; everything else is the offer page. No
 * router library for two routes -- a dependency to decide one `if` is a
 * dependency to keep up with forever.
 *
 * The token never becomes state, a prop that outlives the page, or a query
 * parameter. It is read once, here, from the address bar.
 */
const token = tokenFromPath(window.location.pathname);

createRoot(document.getElementById("root")!).render(
  <StrictMode>{token ? <ReadingPage token={token} /> : <App />}</StrictMode>,
);
