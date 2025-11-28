function fitTextToContainer() {
    const title = document.querySelector('.title');
    const container = title.parentElement;
    const maxWidth = container.clientWidth;

    // Start with your preferred size (match your CSS)
    let fontSize = window.innerHeight * 0.15; // 15vh equivalent
    title.style.fontSize = `${fontSize}px`;

    // While text is too wide, reduce font size
    while (title.scrollWidth > maxWidth && fontSize > 0) {
        fontSize -= 1;
        title.style.fontSize = `${fontSize}px`;
    }
}

// Run on load and resize
window.addEventListener('load', fitTextToContainer);
window.addEventListener('resize', fitTextToContainer);


document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('checkboxForm');
    const fillRect = document.querySelector('.thermometer .fill');
    const root = document.documentElement; // to set CSS variables

    form.addEventListener('change', () => {
        const checkedCount = form.querySelectorAll('input[type="checkbox"]:checked').length;
        const percentage = checkedCount * 10; // each checkbox 10%

        // Height calculation for the fill:
        const scale = 0.31 + percentage / 100 * 0.69
        fillRect.style.transform = `scaleY(${scale})`;

        const pFracPulse = percentage / 100;

        let shakeSpeed = 0;
        let shakeDistance = 0;
        const pulseSpeed = `${2 - 1.6 * pFracPulse}s`;
        let pulseIntensity = `${0.5 * pFracPulse}`;

        if (percentage >= 20) {
            const pFracShake = (percentage - 20) / 80;
            shakeSpeed = `${0.9 - 0.8 * pFracShake}s`;
            shakeDistance = `${0.25 + 4.75 * pFracShake}px`;
        }

        root.style.setProperty('--shake-speed', shakeSpeed);
        root.style.setProperty('--shake-distance', shakeDistance);
        root.style.setProperty('--pulse-speed', pulseSpeed);
        root.style.setProperty('--pulse-intensity', pulseIntensity);

    });
});