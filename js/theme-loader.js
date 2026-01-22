(function () {
    try {
        const cached = localStorage.getItem('maulas_theme_cache');
        if (cached) {
            const theme = JSON.parse(cached);
            const root = document.documentElement;
            // Apply vars immediately to block paint with wrong colors
            Object.entries(theme).forEach(([key, value]) => {
                if (key.startsWith('--')) {
                    root.style.setProperty(key, value);
                }
            });
        }
        const layout = localStorage.getItem('maulas_layout');
        if (layout === 'vertical') {
            document.documentElement.classList.add('layout-vertical');
        }
    } catch (e) {
        // Silent fail
    }
})();
