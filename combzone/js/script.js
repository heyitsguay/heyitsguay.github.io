document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('checkboxForm');
    const fillRect = document.querySelector('.thermometer .fill');

    form.addEventListener('change', () => {
        const checkedCount = form.querySelectorAll('input[type="checkbox"]:checked').length;
        const percentage = checkedCount * 10; // each checkbox 10%

        // Height calculation for the fill:
        const scale = 0.31 + percentage / 100 * 0.69
        fillRect.style.transform = `scaleY(${scale})`;
    });
});