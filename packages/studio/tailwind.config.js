/** @type {import('tailwindcss').Config} */
const sharedConfig = require('../../tailwind.config.js');

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  // The root Tailwind config is the sole mapping from UI classes to the
  // :root tokens in app/globals.css. Keeping this package on that same theme
  // prevents its standalone stylesheet from reviving a second palette.
  theme: sharedConfig.theme,
  plugins: sharedConfig.plugins,
};
