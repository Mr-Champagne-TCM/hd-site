/** Brand tokens, taken from the live site rather than from DOCTRINE.
 *
 *  DOCTRINE still names Plus Jakarta Sans and 1s wave timings; the running site
 *  uses Fraunces, Outfit, and waves at 14s. Source is authority.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          violet: "#7C5CE0",
          teal: "#3FE0C5",
          gold: "#E8CBA0",
          paper: "#F3EFF7",
          muted: "#B4A8CE",
        },
        ground: {
          top: "#0b1428",
          mid: "#1a1040",
          bottom: "#2d1155",
        },
      },
      fontFamily: {
        display: ['"Fraunces"', "Georgia", "serif"],
        sans: ['"Outfit"', "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
};
