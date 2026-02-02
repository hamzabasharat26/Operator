/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class', // Enable class-based dark mode
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: '#1e293b',    // Industrial Navy
                secondary: '#64748b',  // Slate Gray
                accent: '#475569',     // Steel Blue
                'accent-active': '#3b82f6', // Muted Blue
                success: '#10b981',    // Subtle Industrial Green
                error: '#ef4444',      // Muted Professional Red
            },
            fontFamily: {
                sans: ['Inter', 'Roboto', 'Source Sans Pro', 'ui-sans-serif', 'system-ui'],
            },
        },
    },
    plugins: [],
}

