module.exports = {
  content: [
    "./pages/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./game/**/*.{js,jsx}",
    "./games-online/**/*.{js,jsx}", // ensure Bingo files are scanned for Tailwind classes
  ],
  theme: { extend: {} },
  plugins: [],
};
