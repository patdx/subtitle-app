module.exports = {
  content: ['./pages/**/*.{js,ts,jsx,tsx}', './renderer/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/forms')({
      strategy: 'class',
    }),
  ],
};
