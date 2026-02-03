/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // MagicQC Brand Colors
                primary: '#264c59',        // Deep Teal (from logo)
                'primary-dark': '#1a3640', // Darker teal for hover
                'primary-light': '#3a6a7a', // Lighter teal
                secondary: '#f7a536',      // Orange/Gold (from logo)
                'secondary-dark': '#e59420', // Darker orange for hover
                'secondary-light': '#fdb94d', // Lighter orange

                // Complementary Colors
                accent: '#264c59',         // Same as primary for consistency
                'accent-active': '#1a3640',
                'accent-light': '#e8f4f7', // Very light teal

                // Status Colors
                success: '#22c55e',        // Vivid Green
                'success-light': '#dcfce7',
                error: '#ef4444',          // Red
                'error-light': '#fee2e2',
                warning: '#f7a536',        // Use brand orange as warning
                'warning-light': '#fef3c7',

                // Surface Colors
                surface: '#f8fafc',        // Light surface
                'surface-dark': '#f1f5f9', // Slightly darker
                'surface-teal': '#e8f4f7', // Teal-tinted surface

                // Text Colors
                'text-primary': '#264c59',
                'text-secondary': '#64748b',
                'text-muted': '#94a3b8',
            },
            fontFamily: {
                sans: ['Inter', 'Roboto', 'system-ui', 'sans-serif'],
            },
            fontSize: {
                // Larger touch-friendly sizes
                'touch-xs': ['14px', { lineHeight: '20px' }],
                'touch-sm': ['16px', { lineHeight: '24px' }],
                'touch-base': ['18px', { lineHeight: '28px' }],
                'touch-lg': ['20px', { lineHeight: '28px' }],
                'touch-xl': ['24px', { lineHeight: '32px' }],
                'touch-2xl': ['28px', { lineHeight: '36px' }],
            },
            spacing: {
                '11': '2.75rem',  // 44px - minimum touch target
                '13': '3.25rem',  // 52px
                '14': '3.5rem',   // 56px - comfortable touch
                '15': '3.75rem',  // 60px
            },
            borderRadius: {
                'touch': '12px',
            },
            boxShadow: {
                'touch': '0 2px 8px -2px rgba(38, 76, 89, 0.15), 0 4px 12px -4px rgba(38, 76, 89, 0.1)',
                'touch-active': '0 0 0 3px rgba(38, 76, 89, 0.25)',
                'card': '0 1px 4px rgba(38, 76, 89, 0.08), 0 2px 8px rgba(38, 76, 89, 0.04)',
                'card-hover': '0 4px 12px rgba(38, 76, 89, 0.12), 0 2px 4px rgba(38, 76, 89, 0.08)',
            },
            borderWidth: {
                '3': '3px',
            },
            scale: {
                '102': '1.02',
            },
        },
    },
    plugins: [],
}
