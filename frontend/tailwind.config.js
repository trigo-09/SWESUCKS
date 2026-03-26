/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5fbf8",
          100: "#d8efe4",
          500: "#12715d",
          700: "#0b4f43",
          900: "#082a24"
        },
        sand: "#f7f2e8",
        ink: "#172026"
      },
      boxShadow: {
        panel: "0 20px 45px rgba(23, 32, 38, 0.08)"
      }
    }
  },
  plugins: []
};
