/**
 * Spotify Web API Client
 * Handles all Spotify API requests with automatic token refresh
 */

const axios = require('axios');
const querystring = require('querystring');

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

class SpotifyAPI {
    constructor(logger, configManager) {
        this.logger = logger;
        this.configManager = configManager;
        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpiresAt = null;
        this.clientId = null;
        this.clientSecret = null;
    }

    /**
     * Initialize with config
     */
    init(config) {
        this.clientId = config.clientId;
        this.clientSecret = config.clientSecret;
        this.accessToken = config.accessToken;
        this.refreshToken = config.refreshToken;
        if (config.tokenExpiresAt) {
            this.tokenExpiresAt = new Date(config.tokenExpiresAt);
        }
        this.logger.info('[SpotifyAPI] Initialized');
    }

    /**
     * Set tokens after OAuth
     */
    setTokens(accessToken, refreshToken, expiresIn) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
        this.logger.info(`[SpotifyAPI] Tokens set, expires at ${this.tokenExpiresAt.toISOString()}`);
    }

    /**
     * Check if tokens are valid
     */
    isAuthenticated() {
        return !!(this.accessToken && this.refreshToken);
    }

    /**
     * Check if token needs refresh (5 min buffer)
     */
    needsRefresh() {
        if (!this.tokenExpiresAt) return true;
        return Date.now() >= this.tokenExpiresAt.getTime() - 5 * 60 * 1000;
    }

    /**
     * Refresh the access token
     */
    async refreshAccessToken() {
        if (!this.refreshToken || !this.clientId || !this.clientSecret) {
            throw new Error('Missing refresh token or credentials');
        }

        this.logger.info('[SpotifyAPI] Refreshing access token...');

        try {
            const response = await axios.post(
                'https://accounts.spotify.com/api/token',
                querystring.stringify({
                    grant_type: 'refresh_token',
                    refresh_token: this.refreshToken
                }),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': 'Basic ' + Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')
                    }
                }
            );

            this.accessToken = response.data.access_token;
            this.tokenExpiresAt = new Date(Date.now() + response.data.expires_in * 1000);
            
            // Some refresh responses include a new refresh token
            if (response.data.refresh_token) {
                this.refreshToken = response.data.refresh_token;
            }

            this.logger.info('[SpotifyAPI] Token refreshed successfully');

            // Save to config
            if (this.configManager) {
                await this.configManager.saveTokens({
                    accessToken: this.accessToken,
                    refreshToken: this.refreshToken,
                    tokenExpiresAt: this.tokenExpiresAt.toISOString()
                });
            }

            return true;
        } catch (err) {
            this.logger.error(`[SpotifyAPI] Token refresh failed: ${err.response?.data?.error_description || err.message}`);
            throw err;
        }
    }

    /**
     * Make an authenticated API request
     */
    async request(method, endpoint, data = null) {
        // Refresh token if needed
        if (this.needsRefresh()) {
            try {
                await this.refreshAccessToken();
            } catch (err) {
                this.logger.error('[SpotifyAPI] Failed to refresh token, clearing auth');
                this.accessToken = null;
                throw new Error('Authentication expired');
            }
        }

        if (!this.accessToken) {
            throw new Error('Not authenticated');
        }

        try {
            const config = {
                method,
                url: `${SPOTIFY_API_BASE}${endpoint}`,
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            };

            if (data) {
                config.data = data;
                config.headers['Content-Type'] = 'application/json';
            }

            const response = await axios(config);
            return response.data;
        } catch (err) {
            if (err.response?.status === 401) {
                // Token expired, try refresh
                this.logger.warn('[SpotifyAPI] Got 401, attempting token refresh');
                await this.refreshAccessToken();
                // Retry request
                return this.request(method, endpoint, data);
            }
            if (err.response?.status === 403) {
                // Permission denied - likely Premium required or need to reauthorize
                this.logger.error('[SpotifyAPI] 403 Forbidden - This feature may require Spotify Premium or reauthorization');
                throw new Error('Spotify Premium required or please reconnect your account');
            }
            throw err;
        }
    }

    /**
     * Get the lyrics shown by Spotify for a track.
     *
     * Spotify does not expose lyrics through the public Web API. The
     * official clients use the internal color-lyrics endpoint instead.
     * This is intentionally best-effort; callers should keep their own
     * lyrics provider as a fallback.
     */
    async getSpotifyLyrics(trackId, retry = true) {
        if (!trackId) return null;

        if (this.needsRefresh()) {
            await this.refreshAccessToken();
        }

        if (!this.accessToken) {
            throw new Error('Not authenticated');
        }

        const url = `https://spclient.wg.spotify.com/color-lyrics/v2/track/${encodeURIComponent(trackId)}`;

        try {
            const response = await axios.get(url, {
                params: {
                    format: 'json',
                    vocalRemoval: false,
                    market: 'from_token'
                },
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'App-Platform': 'WebPlayer',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
                    'Accept': 'application/json'
                },
                validateStatus: () => true
            });

            if (response.status === 404) {
                this.logger.info(`[SpotifyAPI] No Spotify lyrics for track ${trackId}`);
                return null;
            }

            if (response.status === 401 && retry) {
                this.logger.warn('[SpotifyAPI] Spotify lyrics endpoint returned 401, refreshing token and retrying');
                await this.refreshAccessToken();
                return this.getSpotifyLyrics(trackId, false);
            }

            if (response.status < 200 || response.status >= 300) {
                const detail = typeof response.data === 'string' ? response.data.slice(0, 200) : '';
                this.logger.warn(`[SpotifyAPI] Spotify lyrics request failed: HTTP ${response.status}${detail ? ` - ${detail}` : ''}`);
                return null;
            }

            const lyrics = response.data?.lyrics;
            const rawLines = Array.isArray(lyrics?.lines) ? lyrics.lines : [];
            if (!rawLines.length) return null;

            const lines = rawLines
                .map((line, index) => {
                    const text = String(line?.words || '').trim();
                    if (!text) return null;

                    const startMs = Number(line?.startTimeMs);
                    const nextStartMs = Number(rawLines[index + 1]?.startTimeMs);
                    const explicitEndMs = Number(line?.endTimeMs);
                    const durationMs = Number.isFinite(explicitEndMs) && explicitEndMs > startMs
                        ? explicitEndMs - startMs
                        : Number.isFinite(nextStartMs) && nextStartMs > startMs
                            ? nextStartMs - startMs
                            : 4000;

                    return {
                        startMs: Number.isFinite(startMs) ? Math.max(0, startMs) : 0,
                        durationMs: Math.max(1, durationMs),
                        glyphs: [{ text, offsetMs: 0, durationMs: Math.max(1, durationMs) }],
                        raw: text
                    };
                })
                .filter(Boolean);

            if (!lines.length) return null;

            return {
                source: 'spotify',
                wordSynced: false,
                originalXml: '',
                translationXml: null,
                romanizationXml: null,
                lines,
                translationLines: [],
                romanizationLines: [],
                songId: trackId,
                songMid: '',
                syncType: lyrics?.syncType || null
            };
        } catch (err) {
            this.logger.warn(`[SpotifyAPI] Spotify lyrics request failed: ${err.message}`);
            return null;
        }
    }

    /**
     * Get current user profile
     */
    async getCurrentUser() {
        return this.request('GET', '/me');
    }

    /**
     * Get current playback state
     */
    async getCurrentPlayback() {
        try {
            const response = await axios.get(`${SPOTIFY_API_BASE}/me/player`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });
            
            // 204 means no active playback
            if (response.status === 204 || !response.data) {
                return null;
            }
            
            return response.data;
        } catch (err) {
            if (err.response?.status === 401) {
                await this.refreshAccessToken();
                return this.getCurrentPlayback();
            }
            if (err.response?.status === 204) {
                return null;
            }
            throw err;
        }
    }

    /**
     * Start or resume playback
     */
    async play() {
        try {
            await this.request('PUT', '/me/player/play');
            this.logger.info('[SpotifyAPI] Playback started');
        } catch (err) {
            // 404 means no active device
            if (err.response?.status === 404) {
                this.logger.warn('[SpotifyAPI] No active device for playback');
            }
            throw err;
        }
    }

    /**
     * Pause playback
     */
    async pause() {
        try {
            await this.request('PUT', '/me/player/pause');
            this.logger.info('[SpotifyAPI] Playback paused');
        } catch (err) {
            if (err.response?.status === 404) {
                this.logger.warn('[SpotifyAPI] No active device for pause');
            }
            throw err;
        }
    }

    /**
     * Skip to next track
     */
    async next() {
        try {
            await this.request('POST', '/me/player/next');
            this.logger.info('[SpotifyAPI] Skipped to next track');
        } catch (err) {
            if (err.response?.status === 404) {
                this.logger.warn('[SpotifyAPI] No active device for next');
            }
            throw err;
        }
    }

    /**
     * Skip to previous track
     */
    async previous() {
        try {
            await this.request('POST', '/me/player/previous');
            this.logger.info('[SpotifyAPI] Skipped to previous track');
        } catch (err) {
            if (err.response?.status === 404) {
                this.logger.warn('[SpotifyAPI] No active device for previous');
            }
            throw err;
        }
    }

    /**
     * Set shuffle state
     */
    async setShuffle(state) {
        try {
            await this.request('PUT', `/me/player/shuffle?state=${state}`);
            this.logger.info(`[SpotifyAPI] Shuffle set to ${state}`);
        } catch (err) {
            if (err.response?.status === 404) {
                this.logger.warn('[SpotifyAPI] No active device for shuffle');
            }
            throw err;
        }
    }

    /**
     * Set repeat mode: off, context, track
     */
    async setRepeat(state) {
        try {
            await this.request('PUT', `/me/player/repeat?state=${state}`);
            this.logger.info(`[SpotifyAPI] Repeat set to ${state}`);
        } catch (err) {
            if (err.response?.status === 404) {
                this.logger.warn('[SpotifyAPI] No active device for repeat');
            }
            throw err;
        }
    }

    /**
     * Normalize Spotify URIs for generic library endpoints
     */
    normalizeUris(urisOrIds, entityType = 'track') {
        const values = Array.isArray(urisOrIds) ? urisOrIds : [urisOrIds];
        return values
            .filter(Boolean)
            .map((value) => (String(value).startsWith('spotify:') ? String(value) : `spotify:${entityType}:${value}`));
    }

    /**
     * Check if items are saved in user's library
     */
    async checkLibraryContains(urisOrIds, entityType = 'track') {
        const uris = this.normalizeUris(urisOrIds, entityType);
        const encodedUris = encodeURIComponent(uris.join(','));
        return this.request('GET', `/me/library/contains?uris=${encodedUris}`);
    }

    /**
     * Save items to user's library
     */
    async saveToLibrary(urisOrIds, entityType = 'track') {
        const uris = this.normalizeUris(urisOrIds, entityType);
        const encodedUris = encodeURIComponent(uris.join(','));
        await this.request('PUT', `/me/library?uris=${encodedUris}`);
        this.logger.info(`[SpotifyAPI] Saved ${uris.length} item(s) to library`);
    }

    /**
     * Remove items from user's library
     */
    async removeFromLibrary(urisOrIds, entityType = 'track') {
        const uris = this.normalizeUris(urisOrIds, entityType);
        const encodedUris = encodeURIComponent(uris.join(','));
        await this.request('DELETE', `/me/library?uris=${encodedUris}`);
        this.logger.info(`[SpotifyAPI] Removed ${uris.length} item(s) from library`);
    }

    /**
     * Track-specific wrappers for plugin code
     */
    async checkSavedTracks(trackUrisOrIds) {
        return this.checkLibraryContains(trackUrisOrIds, 'track');
    }

    async saveTracks(trackUrisOrIds) {
        return this.saveToLibrary(trackUrisOrIds, 'track');
    }

    async removeTracks(trackUrisOrIds) {
        return this.removeFromLibrary(trackUrisOrIds, 'track');
    }

    /**
     * Get album art as buffer
     */
    async getAlbumArt(url) {
        if (!url) return null;
        
        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer'
            });
            return Buffer.from(response.data);
        } catch (err) {
            this.logger.error(`[SpotifyAPI] Failed to fetch album art: ${err.message}`);
            return null;
        }
    }

    /**
     * Clear authentication
     */
    clearAuth() {
        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpiresAt = null;
        this.logger.info('[SpotifyAPI] Authentication cleared');
    }
}

module.exports = SpotifyAPI;
