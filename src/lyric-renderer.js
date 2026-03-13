const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');
const { matchTranslationLine, resolveCurrentLyric } = require('./qq-lyrics');
const { getImageColors, fillDynamicBackground } = require('./color-utils');

const DEFAULT_COLORS = {
    background: '#1a1a1a',
    primary: '#FFFFFF',
    secondary: '#888888',
    highlight: '#1DB954'
};

const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 60;
const FONT_FAMILY = [
    'Microsoft YaHei',
    'Malgun Gothic',
    'Yu Gothic UI',
    'Yu Gothic',
    'Meiryo',
    'MS Gothic',
    'PingFang SC',
    'Hiragino Sans GB',
    'Songti SC',
    'Apple SD Gothic Neo',
    'AppleGothic',
    'Noto Sans Gothic',
    'SimHei',
    'Noto Sans CJK',
    'Arial Unicode MS',
    'Arial',
    'sans-serif'
].join(', ');

function registerSystemFonts(logger) {
    const platform = process.platform;
    const fontPaths = [];

    if (platform === 'win32') {
        const winFonts = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts');
        fontPaths.push(
            { path: path.join(winFonts, 'msyh.ttc'), family: 'Microsoft YaHei' },
            { path: path.join(winFonts, 'msyhbd.ttc'), family: 'Microsoft YaHei' },
            { path: path.join(winFonts, 'simhei.ttf'), family: 'SimHei' },
            { path: path.join(winFonts, 'malgun.ttf'), family: 'Malgun Gothic' },
            { path: path.join(winFonts, 'malgunbd.ttf'), family: 'Malgun Gothic' },
            { path: path.join(winFonts, 'YuGothM.ttc'), family: 'Yu Gothic' },
            { path: path.join(winFonts, 'YuGothB.ttc'), family: 'Yu Gothic' },
            { path: path.join(winFonts, 'YuGothR.ttc'), family: 'Yu Gothic UI' },
            { path: path.join(winFonts, 'meiryo.ttc'), family: 'Meiryo' },
            { path: path.join(winFonts, 'meiryob.ttc'), family: 'Meiryo' },
            { path: path.join(winFonts, 'msgothic.ttc'), family: 'MS Gothic' },
            { path: path.join(winFonts, 'arialuni.ttf'), family: 'Arial Unicode MS' }
        );
    } else if (platform === 'darwin') {
        fontPaths.push(
            { path: '/System/Library/Fonts/PingFang.ttc', family: 'PingFang SC' },
            { path: '/System/Library/Fonts/Hiragino Sans GB.ttc', family: 'Hiragino Sans GB' },
            { path: '/System/Library/Fonts/AppleSDGothicNeo.ttc', family: 'Apple SD Gothic Neo' },
            { path: '/System/Library/Fonts/Supplemental/AppleGothic.ttf', family: 'AppleGothic' },
            { path: '/System/Library/Fonts/Supplemental/Songti.ttc', family: 'Songti SC' },
            { path: '/System/Library/Fonts/Supplemental/NotoSansGothic-Regular.ttf', family: 'Noto Sans Gothic' }
        );
    } else {
        fontPaths.push(
            { path: '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', family: 'Noto Sans CJK' }
        );
    }

    for (const font of fontPaths) {
        try {
            if (fs.existsSync(font.path)) {
                GlobalFonts.registerFromPath(font.path, font.family);
            }
        } catch {
            logger.warn(`[LyricRenderer] Failed to register font: ${font.family}`);
        }
    }
}

class LyricRenderer {
    constructor(logger) {
        this.logger = logger;
        this.fontsRegistered = false;
        this.albumArtCache = new Map();
    }

    ensureFonts() {
        if (!this.fontsRegistered) {
            registerSystemFonts(this.logger);
            this.fontsRegistered = true;
        }
    }

    truncateText(ctx, text, maxWidth) {
        if (!text) return '';
        let truncated = text;
        while (truncated && ctx.measureText(truncated).width > maxWidth) {
            truncated = truncated.slice(0, -1);
        }
        return truncated === text ? text : `${truncated}...`;
    }

    getAlignedX(align, padding, maxWidth, textWidth) {
        switch (align) {
            case 'center':
                return padding + (maxWidth - textWidth) / 2;
            case 'right':
                return padding + maxWidth - textWidth;
            default:
                return padding;
        }
    }

    hexToRgb(color) {
        if (!color || typeof color !== 'string') return null;
        const normalized = color.trim().replace('#', '');
        const hex = normalized.length === 3
            ? normalized.split('').map((char) => char + char).join('')
            : normalized;
        if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16)
        };
    }

    rgba(color, alpha = 1) {
        const rgb = this.hexToRgb(color);
        if (!rgb) return color;
        return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
    }

    async loadAlbumArt(url) {
        if (!url) return null;
        if (this.albumArtCache.has(url)) {
            return this.albumArtCache.get(url);
        }

        try {
            const image = await loadImage(url);
            this.albumArtCache.set(url, image);

            if (this.albumArtCache.size > 50) {
                const firstKey = this.albumArtCache.keys().next().value;
                this.albumArtCache.delete(firstKey);
            }

            return image;
        } catch (err) {
            this.logger.warn(`[LyricRenderer] Failed to load album art for dynamic background: ${err.message}`);
            return null;
        }
    }

    renderWordProgress(ctx, glyphs, elapsedMs, config) {
        const {
            x,
            y,
            maxWidth,
            align,
            primaryColor,
            highlightColor,
            fontSize,
            highlightWord,
            textBaseline = 'alphabetic'
        } = config;

        ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`;
        ctx.textBaseline = textBaseline;

        if (!highlightWord) {
            const text = glyphs.map((glyph) => glyph.text).join('').trim();
            const truncated = this.truncateText(ctx, text, maxWidth);
            const textWidth = ctx.measureText(truncated).width;
            const textX = this.getAlignedX(align, x, maxWidth, textWidth);
            ctx.fillStyle = primaryColor;
            ctx.fillText(truncated, textX, y);
            return;
        }

        const width = glyphs.reduce((sum, glyph) => sum + ctx.measureText(glyph.text).width, 0);
        let currentX = this.getAlignedX(align, x, maxWidth, Math.min(width, maxWidth));
        const lineY = y;

        for (const glyph of glyphs) {
            const glyphWidth = ctx.measureText(glyph.text).width;
            if (currentX + glyphWidth > x + maxWidth) {
                ctx.fillStyle = primaryColor;
                ctx.fillText('...', currentX, lineY);
                break;
            }

            const glyphStart = glyph.offsetMs;
            const glyphEnd = glyph.offsetMs + glyph.durationMs;
            let progress = 0;

            if (elapsedMs >= glyphEnd) progress = 1;
            else if (elapsedMs > glyphStart && glyph.durationMs > 0) {
                progress = Math.max(0, Math.min(1, (elapsedMs - glyphStart) / glyph.durationMs));
            }

            if (progress >= 1) {
                ctx.fillStyle = highlightColor;
                ctx.fillText(glyph.text, currentX, lineY);
            } else if (progress <= 0) {
                ctx.fillStyle = primaryColor;
                ctx.fillText(glyph.text, currentX, lineY);
            } else {
                const filledWidth = glyphWidth * progress;
                const transitionWidth = Math.min(Math.max(glyphWidth * 0.18, 6), 14);
                const transitionStart = Math.max(0, filledWidth - transitionWidth);
                const transitionEnd = Math.min(glyphWidth, filledWidth + transitionWidth);
                const gradient = ctx.createLinearGradient(currentX, 0, currentX + glyphWidth, 0);

                gradient.addColorStop(0, highlightColor);

                if (transitionStart > 0) {
                    gradient.addColorStop(transitionStart / glyphWidth, highlightColor);
                }

                gradient.addColorStop(
                    Math.max(0, Math.min(1, filledWidth / glyphWidth)),
                    this.rgba(highlightColor, 0.9)
                );
                gradient.addColorStop(
                    Math.max(0, Math.min(1, transitionEnd / glyphWidth)),
                    this.rgba(primaryColor, 0.95)
                );

                if (transitionEnd < glyphWidth) {
                    gradient.addColorStop(1, primaryColor);
                } else {
                    gradient.addColorStop(1, highlightColor);
                }

                ctx.fillStyle = gradient;
                ctx.fillText(glyph.text, currentX, lineY);
            }

            currentX += glyphWidth;
        }
    }

    renderFallback(canvas, ctx, width, height, songInfo, lyricPackage, options) {
        const {
            primaryColor,
            secondaryColor,
            highlightColor,
            primaryFontSize,
            singleLineFontSize,
            secondaryFontSize,
            paddingHorizontal,
            primaryPaddingTop,
            secondaryPaddingTop,
            primaryAlign,
            secondaryAlign
        } = options;

        const maxWidth = width - paddingHorizontal * 2;
        const isNoPlayback = !songInfo?.title;
        const title = songInfo?.title
            ? `${songInfo.title}${lyricPackage?.status === 'missing' ? ' - 暂无歌词' : ''}`
            : 'Waiting for playback';
        const secondary = isNoPlayback
            ? '暂未播放'
            : (songInfo?.artist && songInfo?.album
                ? `${songInfo.artist} - ${songInfo.album}`
                : songInfo?.artist || songInfo?.album || '');
        const isSingleLine = !secondary;
        const primaryRenderFontSize = isSingleLine ? singleLineFontSize : primaryFontSize;
        const primaryY = isSingleLine
            ? Math.round(height / 2)
            : primaryPaddingTop + primaryRenderFontSize;

        ctx.fillStyle = primaryColor;
        ctx.font = `bold ${primaryRenderFontSize}px ${FONT_FAMILY}`;
        ctx.textBaseline = isSingleLine ? 'middle' : 'alphabetic';
        const primaryText = this.truncateText(ctx, title, maxWidth);
        const primaryWidth = ctx.measureText(primaryText).width;
        const primaryX = this.getAlignedX(primaryAlign, paddingHorizontal, maxWidth, primaryWidth);
        ctx.fillText(primaryText, primaryX, primaryY);

        if (secondary) {
            ctx.fillStyle = secondaryColor;
            ctx.font = `bold ${secondaryFontSize}px ${FONT_FAMILY}`;
            ctx.textBaseline = 'alphabetic';
            const secondaryText = this.truncateText(ctx, secondary, maxWidth);
            const secondaryWidth = ctx.measureText(secondaryText).width;
            const secondaryX = this.getAlignedX(secondaryAlign, paddingHorizontal, maxWidth, secondaryWidth);
            ctx.fillText(secondaryText, secondaryX, secondaryPaddingTop + secondaryFontSize);
        }

        return canvas.toBuffer('image/png');
    }

    async render(lyricPackage, songInfo, progressMs, options = {}, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT) {
        this.ensureFonts();

        const {
            showDualLine = true,
            showTranslation = true,
            highlightWord = true,
            useDynamicBackground = false,
            backgroundColor = DEFAULT_COLORS.background,
            primaryAlign = 'left',
            primaryFontSize = 18,
            singleLineFontSize = 22,
            primaryColor = DEFAULT_COLORS.primary,
            highlightColor = DEFAULT_COLORS.highlight,
            primaryPaddingTop = 5,
            secondaryAlign = 'left',
            secondaryFontSize = 13,
            secondaryColor = DEFAULT_COLORS.secondary,
            secondaryPaddingTop = 28,
            paddingHorizontal = 10
        } = options;

        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        if (useDynamicBackground && songInfo?.albumArtUrl) {
            const albumArt = await this.loadAlbumArt(songInfo.albumArtUrl);
            if (albumArt) {
                fillDynamicBackground(ctx, width, height, getImageColors(albumArt), 0.36);
            } else {
                ctx.fillStyle = backgroundColor;
                ctx.fillRect(0, 0, width, height);
            }
        } else {
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, width, height);
        }

        const lines = lyricPackage?.lines || [];
        if (!lines.length) {
            return this.renderFallback(canvas, ctx, width, height, songInfo, lyricPackage, {
                primaryColor,
                secondaryColor,
                highlightColor,
                primaryFontSize,
                singleLineFontSize,
                secondaryFontSize,
                paddingHorizontal,
                primaryPaddingTop,
                secondaryPaddingTop,
                primaryAlign,
                secondaryAlign
            });
        }

        const current = resolveCurrentLyric(lines, progressMs);
        if (!current.line) {
            return this.renderFallback(canvas, ctx, width, height, songInfo, lyricPackage, {
                primaryColor,
                secondaryColor,
                highlightColor,
                primaryFontSize,
                singleLineFontSize,
                secondaryFontSize,
                paddingHorizontal,
                primaryPaddingTop,
                secondaryPaddingTop,
                primaryAlign,
                secondaryAlign
            });
        }

        const currentLine = current.line;
        const translationLine = showTranslation ? matchTranslationLine(lyricPackage.translationLines, currentLine) : null;
        const secondaryLine = showDualLine
            ? (showTranslation ? (translationLine || current.nextLine) : current.nextLine)
            : null;
        const secondaryText = secondaryLine
            ? secondaryLine.glyphs.map((glyph) => glyph.text).join('').trim()
            : '';
        const maxWidth = width - paddingHorizontal * 2;
        const elapsedMs = Math.max(0, progressMs - currentLine.startMs);
        const isSingleLine = !showDualLine || !secondaryText;
        const primaryRenderFontSize = isSingleLine ? singleLineFontSize : primaryFontSize;
        const primaryY = isSingleLine
            ? Math.round(height / 2)
            : primaryPaddingTop + primaryRenderFontSize;

        this.renderWordProgress(ctx, currentLine.glyphs, elapsedMs, {
            x: paddingHorizontal,
            y: primaryY,
            maxWidth,
            align: primaryAlign,
            primaryColor,
            highlightColor,
            fontSize: primaryRenderFontSize,
            highlightWord,
            textBaseline: isSingleLine ? 'middle' : 'alphabetic'
        });

        if (!isSingleLine && secondaryText) {
            ctx.fillStyle = secondaryColor;
            ctx.font = `bold ${secondaryFontSize}px ${FONT_FAMILY}`;
            const text = this.truncateText(ctx, secondaryText, maxWidth);
            const textWidth = ctx.measureText(text).width;
            const textX = this.getAlignedX(secondaryAlign, paddingHorizontal, maxWidth, textWidth);
            ctx.fillText(text, textX, secondaryPaddingTop + secondaryFontSize);
        }

        return canvas.toBuffer('image/png');
    }
}

module.exports = LyricRenderer;
