const { createCanvas } = require('@napi-rs/canvas');

function clamp(value, min = 0, max = 255) {
    return Math.min(max, Math.max(min, value));
}

function normalizeHex(color, fallback = '#1E1E1E') {
    if (!color || typeof color !== 'string') return fallback;
    const raw = color.trim().replace('#', '');
    const hex = raw.length === 3
        ? raw.split('').map((char) => char + char).join('')
        : raw;
    return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex.toUpperCase()}` : fallback;
}

function hexToRgb(color) {
    const hex = normalizeHex(color, null);
    if (!hex) return null;
    return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16)
    };
}

function adjustColor(color, amount) {
    const rgb = hexToRgb(color);
    if (!rgb) return '#000000';

    const toHex = (value) => clamp(value + amount).toString(16).padStart(2, '0');
    return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`.toUpperCase();
}

function colorDistance(a, b) {
    return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

function getImageColors(image) {
    try {
        if (!image || !image.width || !image.height) {
            return ['#1E1E1E', '#2E2E2E'];
        }

        const sampleSize = Math.max(4, Math.min(50, image.width, image.height));
        const tempCanvas = createCanvas(sampleSize, sampleSize);
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(image, 0, 0, sampleSize, sampleSize);
        const imageData = tempCtx.getImageData(0, 0, sampleSize, sampleSize).data;

        const getPixel = (x, y) => {
            const index = (y * sampleSize + x) * 4;
            return {
                r: imageData[index],
                g: imageData[index + 1],
                b: imageData[index + 2]
            };
        };

        const topLeft = getPixel(0, 0);
        const topRight = getPixel(sampleSize - 1, 0);
        const topLeftHex = normalizeHex(
            `#${topLeft.r.toString(16).padStart(2, '0')}${topLeft.g.toString(16).padStart(2, '0')}${topLeft.b.toString(16).padStart(2, '0')}`
        );
        const topRightHex = normalizeHex(
            `#${topRight.r.toString(16).padStart(2, '0')}${topRight.g.toString(16).padStart(2, '0')}${topRight.b.toString(16).padStart(2, '0')}`
        );

        if (colorDistance(topLeft, topRight) > 30) {
            return [topLeftHex, topRightHex];
        }

        return [topLeftHex, adjustColor(topLeftHex, 20)];
    } catch {
        return ['#1E1E1E', '#2E2E2E'];
    }
}

function fillDynamicBackground(ctx, width, height, colors, overlayAlpha = 0.3) {
    const [colorA, colorB] = colors && colors.length >= 2
        ? colors
        : ['#1E1E1E', '#2E2E2E'];

    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, colorA);
    gradient.addColorStop(1, colorB);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = `rgba(0, 0, 0, ${overlayAlpha})`;
    ctx.fillRect(0, 0, width, height);
}

module.exports = {
    adjustColor,
    getImageColors,
    fillDynamicBackground,
    normalizeHex
};
