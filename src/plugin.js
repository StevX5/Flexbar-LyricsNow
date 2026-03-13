/**
 * Spotify Plugin for FlexDesigner
 * Main plugin entry point
 */

const { plugin, logger, pluginPath } = require("@eniac/flexdesigner");
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const OAuthServer = require('./oauth-server');
const SpotifyAPI = require('./spotify-api');
const CanvasRenderer = require('./canvas-renderer');
const LyricRenderer = require('./lyric-renderer');
const { QQLyricsService } = require('./qq-lyrics');

// ============================================================================
// Configuration Manager
// ============================================================================

class ConfigManager {
    constructor() {
        this.configPath = path.join(pluginPath, 'config.json');
        this.config = this.load();
    }

    load() {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf8');
                return JSON.parse(data);
            }
        } catch (err) {
            logger.error(`[Config] Failed to load config: ${err.message}`);
        }
        return {};
    }

    save() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            logger.info('[Config] Configuration saved');
        } catch (err) {
            logger.error(`[Config] Failed to save config: ${err.message}`);
        }
    }

    get(key, defaultValue = null) {
        return this.config[key] !== undefined ? this.config[key] : defaultValue;
    }

    set(key, value) {
        this.config[key] = value;
        this.save();
    }

    saveTokens(tokens) {
        this.config.accessToken = tokens.accessToken;
        this.config.refreshToken = tokens.refreshToken;
        this.config.tokenExpiresAt = tokens.tokenExpiresAt;
        this.save();
    }

    clearTokens() {
        delete this.config.accessToken;
        delete this.config.refreshToken;
        delete this.config.tokenExpiresAt;
        delete this.config.userName;
        this.save();
    }
}

// ============================================================================
// Plugin State
// ============================================================================

const configManager = new ConfigManager();
const oauthServer = new OAuthServer(logger);
const spotifyApi = new SpotifyAPI(logger, configManager);
const canvasRenderer = new CanvasRenderer(logger);
const lyricRenderer = new LyricRenderer(logger);
const qqLyricsService = new QQLyricsService(logger);

// Device and key tracking
const deviceKeys = new Map(); // serialNumber -> { keys: Map<uid, key>, updateTimer: interval }
let globalUpdateTimer = null;
let lastPlaybackState = null;
let lastPlaybackUpdatedAt = 0;
let currentTrackId = null;
let currentTrackUri = null;
let isTrackLiked = false;
let currentLyrics = null;
let currentLyricsTrackId = null;
let lyricLoadRequestId = 0;
let lyricRenderTimer = null;

function createLyricState(status = 'unknown', lyrics = {}) {
    return {
        lines: lyrics?.lines || [],
        translationLines: lyrics?.translationLines || [],
        romaLines: lyrics?.romaLines || [],
        source: lyrics?.source || null,
        wordSynced: lyrics?.wordSynced !== false,
        status
    };
}

// ============================================================================
// System Utilities
// ============================================================================

/**
 * Open URL in system default browser
 * Supports Windows, macOS, and Linux
 */
function openUrlInBrowser(url) {
    const platform = process.platform;
    let command;
    let args;

    switch (platform) {
        case 'win32':
            // Use cmd to run start command
            command = 'cmd';
            args = ['/c', 'start', '', url];
            break;
        case 'darwin':
            command = 'open';
            args = [url];
            break;
        default: // Linux and others
            command = 'xdg-open';
            args = [url];
            break;
    }

    logger.info(`[Plugin] Opening URL in browser (${platform}): ${url}`);

    const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore' 
    });

    child.on('error', (err) => {
        logger.error(`[Plugin] Failed to open URL: ${err.message}`);
    });

    child.unref();
}

// ============================================================================
// Initialization
// ============================================================================

function initializeSpotifyApi() {
    const config = {
        clientId: configManager.get('clientId'),
        clientSecret: configManager.get('clientSecret'),
        accessToken: configManager.get('accessToken'),
        refreshToken: configManager.get('refreshToken'),
        tokenExpiresAt: configManager.get('tokenExpiresAt')
    };

    if (config.clientId && config.clientSecret) {
        spotifyApi.init(config);
        logger.info('[Plugin] Spotify API initialized');
    }
}

// ============================================================================
// Playback State Management
// ============================================================================

async function updatePlaybackState() {
    if (!spotifyApi.isAuthenticated()) {
        lastPlaybackState = null;
        lastPlaybackUpdatedAt = 0;
        currentTrackId = null;
        currentLyrics = null;
        currentLyricsTrackId = null;
        syncLyricRenderTimer();
        return;
    }

    try {
        lastPlaybackState = await spotifyApi.getCurrentPlayback();
        lastPlaybackUpdatedAt = Date.now();
        
        const newTrackId = lastPlaybackState?.item?.id;
        const newTrackUri = lastPlaybackState?.item?.uri;
        
        if (newTrackId) {
            // Always check like status (user might have changed it in Spotify app)
            try {
                const [isLiked] = await spotifyApi.checkSavedTracks(newTrackUri || newTrackId);
                const wasLiked = isTrackLiked;
                isTrackLiked = isLiked;
                
                // Log if track changed or like status changed
                if (newTrackId !== currentTrackId) {
                    currentTrackId = newTrackId;
                    currentTrackUri = newTrackUri || null;
                    currentLyrics = createLyricState('loading');
                    currentLyricsTrackId = newTrackId;
                    logger.info(`[Plugin] Track changed: ${lastPlaybackState.item.name}, liked: ${isTrackLiked}`);
                    void loadLyricsForTrack(lastPlaybackState.item);
                } else if (wasLiked !== isTrackLiked) {
                    logger.info(`[Plugin] Like status changed: ${isTrackLiked}`);
                }
            } catch (err) {
                logger.error(`[Plugin] Failed to check if track is liked: ${err.message}`);
            }
        } else {
            currentTrackId = null;
            currentTrackUri = null;
            isTrackLiked = false;
            currentLyrics = null;
            currentLyricsTrackId = null;
        }
        syncLyricRenderTimer();
    } catch (err) {
        logger.error(`[Plugin] Failed to get playback state: ${err.message}`);
        lastPlaybackState = null;
        lastPlaybackUpdatedAt = 0;
        syncLyricRenderTimer();
    }
}

async function loadLyricsForTrack(track) {
    if (!track?.id) {
        currentLyrics = null;
        currentLyricsTrackId = null;
        syncLyricRenderTimer();
        return;
    }

    const requestId = ++lyricLoadRequestId;

    try {
        const lyrics = await qqLyricsService.getLyricsForTrack(track);
        if (requestId !== lyricLoadRequestId || currentTrackId !== track.id) {
            return;
        }

        currentLyricsTrackId = track.id;
        currentLyrics = lyrics?.lines?.length
            ? createLyricState('ready', lyrics)
            : createLyricState('missing', lyrics);
        logger.info(`[Plugin] Lyrics ${lyrics?.lines?.length ? 'loaded' : 'not found'} for ${track.name}`);
        syncLyricRenderTimer();
        await updateLyricKeys();
    } catch (err) {
        if (requestId !== lyricLoadRequestId) return;
        logger.error(`[Plugin] Failed to load lyrics: ${err.message}`);
        currentLyrics = createLyricState('unknown');
        currentLyricsTrackId = track.id;
        syncLyricRenderTimer();
    }
}

async function updateAllDeviceKeys() {
    await updatePlaybackState();
    
    for (const [serialNumber, deviceData] of deviceKeys) {
        await updateDeviceKeys(serialNumber, deviceData.keys);
    }
}

async function updateDeviceKeys(serialNumber, keys) {
    for (const [uid, key] of keys) {
        await updateKey(serialNumber, key);
    }
}

async function updateKey(serialNumber, key) {
    try {
        switch (key.cid) {
            case 'com.jennergray.lyricsnow.nowplaying':
                await updateNowPlayingKey(serialNumber, key);
                break;
            case 'com.jennergray.lyricsnow.lyric':
                await updateLyricKey(serialNumber, key);
                break;
            case 'com.jennergray.lyricsnow.playpause':
                updatePlayPauseKey(serialNumber, key);
                break;
            case 'com.jennergray.lyricsnow.like':
                updateLikeKey(serialNumber, key);
                break;
            case 'com.jennergray.lyricsnow.shuffle':
                updateShuffleKey(serialNumber, key);
                break;
            case 'com.jennergray.lyricsnow.repeat':
                updateRepeatKey(serialNumber, key);
                break;
        }
    } catch (err) {
        logger.error(`[Plugin] Failed to update key ${key.cid}: ${err.message}`);
    }
}

function getEstimatedProgressMs() {
    if (!lastPlaybackState?.item) return 0;

    const baseProgress = lastPlaybackState.progress_ms || 0;
    const duration = lastPlaybackState.item.duration_ms || 0;
    if (!lastPlaybackState.is_playing || !lastPlaybackUpdatedAt) {
        return Math.min(baseProgress, duration);
    }

    const elapsed = Date.now() - lastPlaybackUpdatedAt;
    return Math.max(0, Math.min(baseProgress + elapsed, duration));
}

async function updateNowPlayingKey(serialNumber, key) {
    const options = {
        showTitle: key.data?.showTitle !== false,
        showArtist: key.data?.showArtist !== false,
        showAlbum: key.data?.showAlbum !== false,
        showProgress: key.data?.showProgress !== false,
        backgroundColor: key.data?.backgroundColor || '#121212',
        secondaryTextColor: key.data?.secondaryTextColor || '#D6D6D6',
        progressFillColor: key.data?.progressFillColor || '#1DB954',
        progressBgColor: key.data?.progressBgColor || '#404040',
        useDynamicBackground: key.data?.useDynamicBackground === true
    };

    // Get key dimensions from style, default to 600x60
    const width = key.style?.width || 600;
    const height = 60; // Fixed height for Flexbar

    const imageBuffer = await canvasRenderer.render(lastPlaybackState, options, width, height);
    const base64Image = imageBuffer.toString('base64');
    
    key.style.showImage = true;
    key.style.showIcon = false;
    key.style.showTitle = false;
    key.style.image = `data:image/png;base64,${base64Image}`;
    
    plugin.draw(serialNumber, key, 'draw');
}

async function updateLyricKey(serialNumber, key) {
    const d = key.data || {};
    const options = {
        showDualLine: d.showDualLine !== false,
        showTranslation: d.showTranslation !== false,
        highlightWord: d.highlightWord !== false && currentLyrics?.wordSynced !== false,
        useDynamicBackground: d.useDynamicBackground === true,
        backgroundColor: d.backgroundColor || '#1a1a1a',
        primaryAlign: d.primaryAlign || 'center',
        primaryFontSize: d.primaryFontSize || 22,
        singleLineFontSize: d.singleLineFontSize || 28,
        primaryColor: d.primaryColor || '#FFFFFF',
        highlightColor: d.highlightColor || '#08FC00',
        primaryPaddingTop: d.primaryPaddingTop ?? 5,
        secondaryAlign: d.secondaryAlign || 'center',
        secondaryFontSize: d.secondaryFontSize || 18,
        secondaryColor: d.secondaryColor || '#D6D6D6',
        secondaryPaddingTop: d.secondaryPaddingTop ?? 35,
        paddingHorizontal: d.paddingHorizontal || 10
    };

    const width = key.style?.width || 480;
    const height = 60;
    const songInfo = lastPlaybackState?.item ? {
        title: lastPlaybackState.item.name,
        artist: lastPlaybackState.item.artists?.map((item) => item.name).join(', ') || '',
        album: lastPlaybackState.item.album?.name || '',
        albumArtUrl: lastPlaybackState.item.album?.images?.[0]?.url ||
            lastPlaybackState.item.album?.images?.[1]?.url ||
            lastPlaybackState.item.album?.images?.[2]?.url ||
            ''
    } : null;

    const imageBuffer = await lyricRenderer.render(
        currentLyrics,
        songInfo,
        getEstimatedProgressMs(),
        options,
        width,
        height
    );
    const base64Image = imageBuffer.toString('base64');

    key.style.showImage = true;
    key.style.showIcon = false;
    key.style.showTitle = false;
    key.style.image = `data:image/png;base64,${base64Image}`;

    plugin.draw(serialNumber, key, 'draw');
}

function updatePlayPauseKey(serialNumber, key) {
    const isPlaying = lastPlaybackState?.is_playing || false;
    const newState = isPlaying ? 1 : 0;
    // Use plugin.set() for multiState keys
    plugin.set(serialNumber, key, { state: newState });
}

function updateLikeKey(serialNumber, key) {
    const newState = isTrackLiked ? 1 : 0;
    // Use plugin.set() for multiState keys
    plugin.set(serialNumber, key, { state: newState });
}

function updateShuffleKey(serialNumber, key) {
    const shuffleState = lastPlaybackState?.shuffle_state || false;
    const newState = shuffleState ? 1 : 0;
    // Use plugin.set() for multiState keys
    plugin.set(serialNumber, key, { state: newState });
}

function updateRepeatKey(serialNumber, key) {
    const repeatState = lastPlaybackState?.repeat_state || 'off';
    let newState = 0;
    if (repeatState === 'context') newState = 1;
    else if (repeatState === 'track') newState = 2;
    // Use plugin.set() for multiState keys
    plugin.set(serialNumber, key, { state: newState });
}

// ============================================================================
// Key Action Handlers
// ============================================================================

async function handleKeyAction(serialNumber, key, currentState) {
    if (!key) {
        logger.warn('[Plugin] Key action ignored: missing key payload');
        return;
    }

    if (key.cid === 'com.jennergray.lyricsnow.lyric') {
        await handleLyricToggle(serialNumber, key);
        return;
    }

    if (!spotifyApi.isAuthenticated()) {
        logger.warn('[Plugin] Not authenticated, ignoring key action');
        return;
    }

    try {
        switch (key.cid) {
            case 'com.jennergray.lyricsnow.playpause':
                await handlePlayPause(serialNumber, key);
                break;
            case 'com.jennergray.lyricsnow.like':
                await handleLike(serialNumber, key);
                break;
            case 'com.jennergray.lyricsnow.shuffle':
                await handleShuffle(serialNumber, key);
                break;
            case 'com.jennergray.lyricsnow.repeat':
                await handleRepeat(serialNumber, key);
                break;
            case 'com.jennergray.lyricsnow.previous':
                await spotifyApi.previous();
                break;
            case 'com.jennergray.lyricsnow.next':
                await spotifyApi.next();
                break;
        }
        
        // Update all keys state after action
        setTimeout(() => updateAllDeviceKeys(), 500);
    } catch (err) {
        // Check if this is a Premium-only feature error
        if (err.message?.includes('403') || err.message?.includes('Premium')) {
            logger.error(`[Plugin] Key action failed: Spotify Premium required for playback control`);
        } else {
            logger.error(`[Plugin] Key action failed: ${err.message}`);
        }
        // Revert key state on error
        setTimeout(() => updateAllDeviceKeys(), 100);
    }
}

async function handlePlayPause(serialNumber, key) {
    const isPlaying = lastPlaybackState?.is_playing || false;
    if (isPlaying) {
        await spotifyApi.pause();
        plugin.set(serialNumber, key, { state: 0 }); // paused
    } else {
        await spotifyApi.play();
        plugin.set(serialNumber, key, { state: 1 }); // playing
    }
    logger.info(`[Plugin] Playback ${isPlaying ? 'paused' : 'resumed'}`);
}

async function handleLike(serialNumber, key) {
    if (!currentTrackId || !currentTrackUri) {
        logger.warn('[Plugin] No track to like/unlike');
        return;
    }
    
    if (isTrackLiked) {
        await spotifyApi.removeTracks(currentTrackUri);
        isTrackLiked = false;
    } else {
        await spotifyApi.saveTracks(currentTrackUri);
        isTrackLiked = true;
    }
    logger.info(`[Plugin] Track ${isTrackLiked ? 'liked' : 'unliked'}`);
    
    // Immediately update the key state
    plugin.set(serialNumber, key, { state: isTrackLiked ? 1 : 0 });
}

async function handleShuffle(serialNumber, key) {
    const currentState = lastPlaybackState?.shuffle_state || false;
    const newState = !currentState;
    await spotifyApi.setShuffle(newState);
    plugin.set(serialNumber, key, { state: newState ? 1 : 0 });
    logger.info(`[Plugin] Shuffle ${newState ? 'enabled' : 'disabled'}`);
}

async function handleRepeat(serialNumber, key) {
    const currentState = lastPlaybackState?.repeat_state || 'off';
    let newState = 'off';
    let stateNum = 0;
    
    if (currentState === 'off') {
        newState = 'context';
        stateNum = 1;
    } else if (currentState === 'context') {
        newState = 'track';
        stateNum = 2;
    } else {
        newState = 'off';
        stateNum = 0;
    }
    
    await spotifyApi.setRepeat(newState);
    plugin.set(serialNumber, key, { state: stateNum });
    logger.info(`[Plugin] Repeat set to ${newState}`);
}

async function handleLyricToggle(serialNumber, key) {
    const deviceData = deviceKeys.get(serialNumber);
    const targetKey = deviceData?.keys?.get(key.uid) || key;

    if (!targetKey) {
        logger.warn('[Plugin] Lyric toggle ignored: target key not found');
        return;
    }

    if (!targetKey.data) {
        targetKey.data = {};
    }

    const currentShowDualLine = targetKey.data.showDualLine !== false;
    targetKey.data.showDualLine = !currentShowDualLine;

    logger.info(`[Plugin] Lyric display toggled: ${targetKey.data.showDualLine ? 'dual-line' : 'single-line'}`);
    await updateLyricKey(serialNumber, targetKey);
}

// ============================================================================
// Device Management
// ============================================================================

function registerDevice(serialNumber, keys) {
    if (!deviceKeys.has(serialNumber)) {
        deviceKeys.set(serialNumber, { keys: new Map() });
        logger.info(`[Plugin] Device registered: ${serialNumber}`);
    }
    
    const deviceData = deviceKeys.get(serialNumber);
    for (const key of keys) {
        deviceData.keys.set(key.uid, key);
        logger.info(`[Plugin] Key registered: ${key.cid} (${key.uid})`);
    }
    
    // Start global update timer if not running
    startUpdateTimer();
    syncLyricRenderTimer();
}

function unregisterDevice(serialNumber) {
    if (deviceKeys.has(serialNumber)) {
        deviceKeys.delete(serialNumber);
        logger.info(`[Plugin] Device unregistered: ${serialNumber}`);
    }
    
    // Stop timer if no devices
    if (deviceKeys.size === 0) {
        stopUpdateTimer();
    }
    syncLyricRenderTimer();
}

function startUpdateTimer() {
    if (globalUpdateTimer) return;
    
    globalUpdateTimer = setInterval(async () => {
        await updateAllDeviceKeys();
    }, 1000);
    
    logger.info('[Plugin] Update timer started (1s interval)');
}

function stopUpdateTimer() {
    if (globalUpdateTimer) {
        clearInterval(globalUpdateTimer);
        globalUpdateTimer = null;
        logger.info('[Plugin] Update timer stopped');
    }
}

function hasLyricKeys() {
    for (const [, deviceData] of deviceKeys) {
        for (const [, key] of deviceData.keys) {
            if (key.cid === 'com.jennergray.lyricsnow.lyric') {
                return true;
            }
        }
    }
    return false;
}

async function updateLyricKeys() {
    for (const [serialNumber, deviceData] of deviceKeys) {
        for (const [, key] of deviceData.keys) {
            if (key.cid === 'com.jennergray.lyricsnow.lyric') {
                await updateKey(serialNumber, key);
            }
        }
    }
}

function syncLyricRenderTimer() {
    const shouldRun = !!(
        deviceKeys.size > 0 &&
        hasLyricKeys() &&
        lastPlaybackState?.is_playing &&
        currentLyrics?.lines?.length
    );

    if (shouldRun && !lyricRenderTimer) {
        lyricRenderTimer = setInterval(() => {
            void updateLyricKeys();
        }, 33);
        logger.info('[Plugin] Lyric render timer started (33ms interval)');
        return;
    }

    if (!shouldRun && lyricRenderTimer) {
        clearInterval(lyricRenderTimer);
        lyricRenderTimer = null;
        logger.info('[Plugin] Lyric render timer stopped');
    }
}

function cleanupResources() {
    stopUpdateTimer();
    if (lyricRenderTimer) {
        clearInterval(lyricRenderTimer);
        lyricRenderTimer = null;
    }
    deviceKeys.clear();
    canvasRenderer.clearCache();
    qqLyricsService.clearCache();
    oauthServer.stop();
    lastPlaybackState = null;
    lastPlaybackUpdatedAt = 0;
    currentTrackId = null;
    isTrackLiked = false;
    currentLyrics = null;
    currentLyricsTrackId = null;
    logger.info('[Plugin] Resources cleaned up');
}

// ============================================================================
// Plugin Events
// ============================================================================

/**
 * Called when plugin keys are loaded on a device
 */
plugin.on('plugin.alive', async (payload) => {
    logger.info(`[Plugin] plugin.alive - device: ${payload.serialNumber}, keys: ${payload.keys.length}`);
    registerDevice(payload.serialNumber, payload.keys);
    
    // Initial update
    await updateAllDeviceKeys();
});

/**
 * Called when user interacts with a key
 */
plugin.on('plugin.data', (payload) => {
    const clickedKey = payload?.data?.key;
    logger.info(`[Plugin] plugin.data - key: ${clickedKey?.cid || 'unknown'}, uid: ${clickedKey?.uid || 'unknown'}, state: ${payload?.data?.state}`);
    
    // Execute action asynchronously
    setImmediate(async () => {
        await handleKeyAction(payload.serialNumber, clickedKey, payload?.data?.state);
    });
    
    // Return success immediately for multiState keys
    return {
        'status': 'success',
    };
});

/**
 * Called when device status changes
 */
plugin.on('device.status', (devices) => {
    logger.info(`[Plugin] device.status - ${devices.length} device(s)`);
    
    // Check for disconnected devices
    const connectedSerials = new Set(devices.map(d => d.serialNumber));
    for (const serial of deviceKeys.keys()) {
        if (!connectedSerials.has(serial)) {
            unregisterDevice(serial);
        }
    }
});

/**
 * Called when receiving message from UI
 */
plugin.on('ui.message', async (payload) => {
    logger.info(`[Plugin] ui.message - action: ${payload.action}`);
    
    switch (payload.action) {
        case 'getConfig':
            return {
                clientId: configManager.get('clientId', ''),
                clientSecret: configManager.get('clientSecret', ''),
                redirectUri: configManager.get('redirectUri', 'http://127.0.0.1:38954/auth/callback'),
                connected: spotifyApi.isAuthenticated(),
                userName: configManager.get('userName', '')
            };
            
        case 'saveConfig':
            configManager.set('clientId', payload.data.clientId);
            configManager.set('clientSecret', payload.data.clientSecret);
            configManager.set('redirectUri', payload.data.redirectUri);
            
            // Reinitialize API with new credentials
            spotifyApi.init({
                clientId: payload.data.clientId,
                clientSecret: payload.data.clientSecret,
                accessToken: configManager.get('accessToken'),
                refreshToken: configManager.get('refreshToken'),
                tokenExpiresAt: configManager.get('tokenExpiresAt')
            });
            
            return { success: true };
            
        case 'startOAuth':
            try {
                const clientId = configManager.get('clientId');
                const clientSecret = configManager.get('clientSecret');
                const redirectUri = configManager.get('redirectUri', 'http://127.0.0.1:8888/callback');
                
                if (!clientId || !clientSecret) {
                    return { success: false, error: 'Missing credentials' };
                }
                
                const loginUrl = await oauthServer.start(
                    clientId,
                    clientSecret,
                    redirectUri,
                    async (tokens) => {
                        // Save tokens
                        configManager.saveTokens(tokens);
                        spotifyApi.setTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresIn);
                        
                        // Get user info
                        try {
                            const user = await spotifyApi.getCurrentUser();
                            configManager.set('userName', user.display_name || user.id);
                            logger.info(`[Plugin] User authenticated: ${user.display_name || user.id}`);
                        } catch (err) {
                            logger.error(`[Plugin] Failed to get user info: ${err.message}`);
                        }
                    }
                );
                
                // Open login URL in system browser
                openUrlInBrowser(loginUrl);
                
                return { success: true, loginUrl };
            } catch (err) {
                logger.error(`[Plugin] OAuth start failed: ${err.message}`);
                return { success: false, error: err.message };
            }
            
        case 'checkConnection':
            return {
                connected: spotifyApi.isAuthenticated(),
                userName: configManager.get('userName', '')
            };
            
        case 'disconnect':
            spotifyApi.clearAuth();
            configManager.clearTokens();
            return { success: true };

        case 'openUrl':
            if (payload.url) {
                openUrlInBrowser(payload.url);
                return { success: true };
            }
            return { success: false, error: 'No URL provided' };
            
        default:
            logger.warn(`[Plugin] Unknown UI action: ${payload.action}`);
            return { success: false, error: 'Unknown action' };
    }
});

/**
 * Called when active window changes
 */
plugin.on('system.actwin', (payload) => {
    // Not used in this plugin
});

// ============================================================================
// Cleanup on exit
// ============================================================================

process.on('SIGINT', () => {
    logger.info('[Plugin] Received SIGINT, cleaning up...');
    cleanupResources();
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('[Plugin] Received SIGTERM, cleaning up...');
    cleanupResources();
    process.exit(0);
});

// ============================================================================
// Start Plugin
// ============================================================================

initializeSpotifyApi();
plugin.start();
logger.info('[Plugin] LyricsNow plugin started');
