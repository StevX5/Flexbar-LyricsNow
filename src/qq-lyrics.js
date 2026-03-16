const axios = require('axios');
const zlib = require('zlib');
const querystring = require('querystring');

const QQ_3DES_KEY = Buffer.from('!@#)(*$%123ZXC!@!@#)(NHL', 'utf8');
const QQ_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.132 Safari/537.36';
const QQ_COOKIE = 'os=pc;osver=Microsoft-Windows-10-Professional-build-16299.125-64bit;appver=2.0.3.131777;channel=netease;__remember_me=true';
const LONG_GAP_DOTS_THRESHOLD_MS = 5000;
const TRAILING_TAIL_TRIM_SLACK_MS = 120;
const DES_ENCRYPT = 1;
const DES_DECRYPT = 0;
const LRCLIB_BASE_URL = 'https://lrclib.net/api';

const SBOX1 = [
    14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7,
    0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8,
    4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0,
    15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13
];
const SBOX2 = [
    15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10,
    3, 13, 4, 7, 15, 2, 8, 15, 12, 0, 1, 10, 6, 9, 11, 5,
    0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15,
    13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9
];
const SBOX3 = [
    10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8,
    13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1,
    13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7,
    1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12
];
const SBOX4 = [
    7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15,
    13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9,
    10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4,
    3, 15, 0, 6, 10, 10, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14
];
const SBOX5 = [
    2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9,
    14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6,
    4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14,
    11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3
];
const SBOX6 = [
    12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11,
    10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8,
    9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6,
    4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13
];
const SBOX7 = [
    4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1,
    13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6,
    1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2,
    6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12
];
const SBOX8 = [
    13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7,
    1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2,
    7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8,
    2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11
];

const KEY_RND_SHIFT = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];
const KEY_PERM_C = [56, 48, 40, 32, 24, 16, 8, 0, 57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35];
const KEY_PERM_D = [62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 60, 52, 44, 36, 28, 20, 12, 4, 27, 19, 11, 3];
const KEY_COMPRESSION = [13, 16, 10, 23, 0, 4, 2, 27, 14, 5, 20, 9, 22, 18, 11, 3, 25, 7, 15, 6, 26, 19, 12, 1, 40, 51, 30, 36, 46, 54, 29, 39, 50, 44, 32, 47, 43, 48, 38, 55, 33, 52, 45, 41, 49, 35, 28, 31];

function bitNum(bytes, b, c) {
    const idx = Math.floor(b / 32) * 4 + 3 - Math.floor((b % 32) / 8);
    const bit = (bytes[idx] >> (7 - (b % 8))) & 0x01;
    return (bit << c) >>> 0;
}

function bitNumIntr(value, b, c) {
    const bit = (value >>> (31 - b)) & 0x00000001;
    return (bit << c) & 0xff;
}

function bitNumIntl(value, b, c) {
    return ((((value << b) >>> 0) & 0x80000000) >>> c) >>> 0;
}

function sboxBit(value) {
    return (value & 0x20) | ((value & 0x1f) >> 1) | ((value & 0x01) << 4);
}

function initialPermutation(input) {
    const state = [0, 0];
    state[0] = (
        bitNum(input, 57, 31) | bitNum(input, 49, 30) | bitNum(input, 41, 29) | bitNum(input, 33, 28) |
        bitNum(input, 25, 27) | bitNum(input, 17, 26) | bitNum(input, 9, 25) | bitNum(input, 1, 24) |
        bitNum(input, 59, 23) | bitNum(input, 51, 22) | bitNum(input, 43, 21) | bitNum(input, 35, 20) |
        bitNum(input, 27, 19) | bitNum(input, 19, 18) | bitNum(input, 11, 17) | bitNum(input, 3, 16) |
        bitNum(input, 61, 15) | bitNum(input, 53, 14) | bitNum(input, 45, 13) | bitNum(input, 37, 12) |
        bitNum(input, 29, 11) | bitNum(input, 21, 10) | bitNum(input, 13, 9) | bitNum(input, 5, 8) |
        bitNum(input, 63, 7) | bitNum(input, 55, 6) | bitNum(input, 47, 5) | bitNum(input, 39, 4) |
        bitNum(input, 31, 3) | bitNum(input, 23, 2) | bitNum(input, 15, 1) | bitNum(input, 7, 0)
    ) >>> 0;

    state[1] = (
        bitNum(input, 56, 31) | bitNum(input, 48, 30) | bitNum(input, 40, 29) | bitNum(input, 32, 28) |
        bitNum(input, 24, 27) | bitNum(input, 16, 26) | bitNum(input, 8, 25) | bitNum(input, 0, 24) |
        bitNum(input, 58, 23) | bitNum(input, 50, 22) | bitNum(input, 42, 21) | bitNum(input, 34, 20) |
        bitNum(input, 26, 19) | bitNum(input, 18, 18) | bitNum(input, 10, 17) | bitNum(input, 2, 16) |
        bitNum(input, 60, 15) | bitNum(input, 52, 14) | bitNum(input, 44, 13) | bitNum(input, 36, 12) |
        bitNum(input, 28, 11) | bitNum(input, 20, 10) | bitNum(input, 12, 9) | bitNum(input, 4, 8) |
        bitNum(input, 62, 7) | bitNum(input, 54, 6) | bitNum(input, 46, 5) | bitNum(input, 38, 4) |
        bitNum(input, 30, 3) | bitNum(input, 22, 2) | bitNum(input, 14, 1) | bitNum(input, 6, 0)
    ) >>> 0;

    return state;
}

function inverseInitialPermutation(state) {
    const output = new Uint8Array(8);
    output[3] = bitNumIntr(state[1], 7, 7) | bitNumIntr(state[0], 7, 6) | bitNumIntr(state[1], 15, 5) | bitNumIntr(state[0], 15, 4) | bitNumIntr(state[1], 23, 3) | bitNumIntr(state[0], 23, 2) | bitNumIntr(state[1], 31, 1) | bitNumIntr(state[0], 31, 0);
    output[2] = bitNumIntr(state[1], 6, 7) | bitNumIntr(state[0], 6, 6) | bitNumIntr(state[1], 14, 5) | bitNumIntr(state[0], 14, 4) | bitNumIntr(state[1], 22, 3) | bitNumIntr(state[0], 22, 2) | bitNumIntr(state[1], 30, 1) | bitNumIntr(state[0], 30, 0);
    output[1] = bitNumIntr(state[1], 5, 7) | bitNumIntr(state[0], 5, 6) | bitNumIntr(state[1], 13, 5) | bitNumIntr(state[0], 13, 4) | bitNumIntr(state[1], 21, 3) | bitNumIntr(state[0], 21, 2) | bitNumIntr(state[1], 29, 1) | bitNumIntr(state[0], 29, 0);
    output[0] = bitNumIntr(state[1], 4, 7) | bitNumIntr(state[0], 4, 6) | bitNumIntr(state[1], 12, 5) | bitNumIntr(state[0], 12, 4) | bitNumIntr(state[1], 20, 3) | bitNumIntr(state[0], 20, 2) | bitNumIntr(state[1], 28, 1) | bitNumIntr(state[0], 28, 0);
    output[7] = bitNumIntr(state[1], 3, 7) | bitNumIntr(state[0], 3, 6) | bitNumIntr(state[1], 11, 5) | bitNumIntr(state[0], 11, 4) | bitNumIntr(state[1], 19, 3) | bitNumIntr(state[0], 19, 2) | bitNumIntr(state[1], 27, 1) | bitNumIntr(state[0], 27, 0);
    output[6] = bitNumIntr(state[1], 2, 7) | bitNumIntr(state[0], 2, 6) | bitNumIntr(state[1], 10, 5) | bitNumIntr(state[0], 10, 4) | bitNumIntr(state[1], 18, 3) | bitNumIntr(state[0], 18, 2) | bitNumIntr(state[1], 26, 1) | bitNumIntr(state[0], 26, 0);
    output[5] = bitNumIntr(state[1], 1, 7) | bitNumIntr(state[0], 1, 6) | bitNumIntr(state[1], 9, 5) | bitNumIntr(state[0], 9, 4) | bitNumIntr(state[1], 17, 3) | bitNumIntr(state[0], 17, 2) | bitNumIntr(state[1], 25, 1) | bitNumIntr(state[0], 25, 0);
    output[4] = bitNumIntr(state[1], 0, 7) | bitNumIntr(state[0], 0, 6) | bitNumIntr(state[1], 8, 5) | bitNumIntr(state[0], 8, 4) | bitNumIntr(state[1], 16, 3) | bitNumIntr(state[0], 16, 2) | bitNumIntr(state[1], 24, 1) | bitNumIntr(state[0], 24, 0);
    return output;
}

function desF(stateIn, key) {
    const lrgstate = new Uint8Array(6);
    const t1 = (
        bitNumIntl(stateIn, 31, 0) | ((stateIn & 0xf0000000) >>> 1) | bitNumIntl(stateIn, 4, 5) |
        bitNumIntl(stateIn, 3, 6) | ((stateIn & 0x0f000000) >>> 3) | bitNumIntl(stateIn, 8, 11) |
        bitNumIntl(stateIn, 7, 12) | ((stateIn & 0x00f00000) >>> 5) | bitNumIntl(stateIn, 12, 17) |
        bitNumIntl(stateIn, 11, 18) | ((stateIn & 0x000f0000) >>> 7) | bitNumIntl(stateIn, 16, 23)
    ) >>> 0;

    const t2 = (
        bitNumIntl(stateIn, 15, 0) | ((stateIn & 0x0000f000) << 15) | bitNumIntl(stateIn, 20, 5) |
        bitNumIntl(stateIn, 19, 6) | ((stateIn & 0x00000f00) << 13) | bitNumIntl(stateIn, 24, 11) |
        bitNumIntl(stateIn, 23, 12) | ((stateIn & 0x000000f0) << 11) | bitNumIntl(stateIn, 28, 17) |
        bitNumIntl(stateIn, 27, 18) | ((stateIn & 0x0000000f) << 9) | bitNumIntl(stateIn, 0, 23)
    ) >>> 0;

    lrgstate[0] = (t1 >>> 24) & 0xff;
    lrgstate[1] = (t1 >>> 16) & 0xff;
    lrgstate[2] = (t1 >>> 8) & 0xff;
    lrgstate[3] = (t2 >>> 24) & 0xff;
    lrgstate[4] = (t2 >>> 16) & 0xff;
    lrgstate[5] = (t2 >>> 8) & 0xff;

    for (let i = 0; i < 6; i += 1) {
        lrgstate[i] ^= key[i];
    }

    let state = (
        (SBOX1[sboxBit(lrgstate[0] >>> 2)] << 28) |
        (SBOX2[sboxBit(((lrgstate[0] & 0x03) << 4) | (lrgstate[1] >>> 4))] << 24) |
        (SBOX3[sboxBit(((lrgstate[1] & 0x0f) << 2) | (lrgstate[2] >>> 6))] << 20) |
        (SBOX4[sboxBit(lrgstate[2] & 0x3f)] << 16) |
        (SBOX5[sboxBit(lrgstate[3] >>> 2)] << 12) |
        (SBOX6[sboxBit(((lrgstate[3] & 0x03) << 4) | (lrgstate[4] >>> 4))] << 8) |
        (SBOX7[sboxBit(((lrgstate[4] & 0x0f) << 2) | (lrgstate[5] >>> 6))] << 4) |
        SBOX8[sboxBit(lrgstate[5] & 0x3f)]
    ) >>> 0;

    state = (
        bitNumIntl(state, 15, 0) | bitNumIntl(state, 6, 1) | bitNumIntl(state, 19, 2) | bitNumIntl(state, 20, 3) |
        bitNumIntl(state, 28, 4) | bitNumIntl(state, 11, 5) | bitNumIntl(state, 27, 6) | bitNumIntl(state, 16, 7) |
        bitNumIntl(state, 0, 8) | bitNumIntl(state, 14, 9) | bitNumIntl(state, 22, 10) | bitNumIntl(state, 25, 11) |
        bitNumIntl(state, 4, 12) | bitNumIntl(state, 17, 13) | bitNumIntl(state, 30, 14) | bitNumIntl(state, 9, 15) |
        bitNumIntl(state, 1, 16) | bitNumIntl(state, 7, 17) | bitNumIntl(state, 23, 18) | bitNumIntl(state, 13, 19) |
        bitNumIntl(state, 31, 20) | bitNumIntl(state, 26, 21) | bitNumIntl(state, 2, 22) | bitNumIntl(state, 8, 23) |
        bitNumIntl(state, 18, 24) | bitNumIntl(state, 12, 25) | bitNumIntl(state, 29, 26) | bitNumIntl(state, 5, 27) |
        bitNumIntl(state, 21, 28) | bitNumIntl(state, 10, 29) | bitNumIntl(state, 3, 30) | bitNumIntl(state, 24, 31)
    ) >>> 0;

    return state >>> 0;
}

function keySchedule(keySlice, mode) {
    let c = 0 >>> 0;
    let d = 0 >>> 0;
    const schedule = Array.from({ length: 16 }, () => new Uint8Array(6));

    for (let i = 0, j = 31; i < 28; i += 1, j -= 1) c |= bitNum(keySlice, KEY_PERM_C[i], j);
    for (let i = 0, j = 31; i < 28; i += 1, j -= 1) d |= bitNum(keySlice, KEY_PERM_D[i], j);

    for (let i = 0; i < 16; i += 1) {
        const shift = KEY_RND_SHIFT[i];
        c = (((c << shift) | (c >>> (28 - shift))) & 0xfffffff0) >>> 0;
        d = (((d << shift) | (d >>> (28 - shift))) & 0xfffffff0) >>> 0;

        const toGen = mode === DES_DECRYPT ? (15 - i) : i;
        const sub = new Uint8Array(6);
        for (let j = 0; j < 24; j += 1) {
            sub[Math.floor(j / 8)] |= bitNumIntr(c, KEY_COMPRESSION[j], 7 - (j % 8));
        }
        for (let j = 24; j < 48; j += 1) {
            sub[Math.floor(j / 8)] |= bitNumIntr(d, KEY_COMPRESSION[j] - 27, 7 - (j % 8));
        }
        schedule[toGen] = sub;
    }

    return schedule;
}

function desCryptBlock(input, schedule) {
    const state = initialPermutation(input);
    let t = 0 >>> 0;
    for (let i = 0; i < 15; i += 1) {
        t = state[1];
        state[1] = (desF(state[1], schedule[i]) ^ state[0]) >>> 0;
        state[0] = t >>> 0;
    }
    state[0] = (desF(state[1], schedule[15]) ^ state[0]) >>> 0;
    return inverseInitialPermutation(state);
}

function tripleDESKeySetup(key, mode) {
    const schedule = [null, null, null];
    if (mode === DES_ENCRYPT) {
        schedule[0] = keySchedule(key.slice(0, 8), mode);
        schedule[1] = keySchedule(key.slice(8, 16), DES_DECRYPT);
        schedule[2] = keySchedule(key.slice(16, 24), mode);
    } else {
        schedule[2] = keySchedule(key.slice(0, 8), mode);
        schedule[1] = keySchedule(key.slice(8, 16), DES_ENCRYPT);
        schedule[0] = keySchedule(key.slice(16, 24), mode);
    }
    return schedule;
}

function tripleDESCryptCompat(input, mode) {
    const schedule = tripleDESKeySetup(Array.from(QQ_3DES_KEY), mode);
    const output = Buffer.alloc(input.length);

    for (let offset = 0; offset < input.length; offset += 8) {
        const block = Array.from(input.subarray(offset, offset + 8));
        const tmp1 = desCryptBlock(block, schedule[0]);
        const tmp2 = desCryptBlock(Array.from(tmp1), schedule[1]);
        const out = desCryptBlock(Array.from(tmp2), schedule[2]);
        Buffer.from(out).copy(output, offset);
    }

    return output;
}

function toSimplifiedChinese(text) {
    return text || '';
}

function normalizeForMatch(text) {
    return (text || '')
        .replace(/[\(\（\[\{【〔「『《〈][^\)\）\]\}】〕」』》〉]*[\)\）\]\}】〕」』》〉]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff\s]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeForScore(text) {
    return (text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff\s]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function stripParentheticals(text) {
    return (text || '')
        .replace(/[\(\（\[\{【〔「『《〈][^\)\）\]\}】〕」』》〉]*[\)\）\]\}】〕」』》〉]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenSet(text) {
    return new Set((text || '').split(/\s+/).filter(Boolean));
}

function jaccardSimilarity(a, b) {
    if (!a.size && !b.size) return 0;
    let intersection = 0;
    for (const item of a) {
        if (b.has(item)) intersection += 1;
    }
    const union = new Set([...a, ...b]).size;
    return union === 0 ? 0 : intersection / union;
}

function buildPrimaryQuery(song, artist) {
    const songSimp = toSimplifiedChinese(song);
    const artistSimp = toSimplifiedChinese(artist);
    const cleanedSong = stripParentheticals(songSimp);
    const querySong = cleanedSong || songSimp;
    const query = [querySong, artistSimp].filter(Boolean).join(' ').trim();
    return { songSimp, artistSimp, querySong, query };
}

function cleanEncryptedHex(text) {
    return (text || '')
        .replace('<![CDATA[', '')
        .replace(']]>', '')
        .replace(/[^0-9A-Fa-f]/g, '');
}

function decryptQrcHex(hex) {
    const cleaned = cleanEncryptedHex(hex);
    if (!cleaned) return null;

    const evenHex = cleaned.length % 2 === 0 ? cleaned : cleaned.slice(0, -1);
    const encrypted = Buffer.from(evenHex, 'hex');
    if (encrypted.length < 8 || encrypted.length % 8 !== 0) {
        return null;
    }

    const attempts = [
        () => tripleDESCryptCompat(encrypted, DES_DECRYPT),
        () => tripleDESCryptCompat(encrypted, DES_ENCRYPT)
    ];

    for (const attempt of attempts) {
        try {
            const transformed = attempt();
            const inflated = decompressAuto(transformed);
            if (inflated) {
                const text = inflated.toString('utf8');
                if (looksLikeDecryptedLyricText(text)) {
                    return text;
                }
            }

            const fallback = transformed.toString('utf8');
            if (looksLikeDecryptedLyricText(fallback)) {
                return fallback;
            }
        } catch {
            // Try the next transform mode.
        }
    }

    return null;
}

function decompressAuto(buffer) {
    const offsets = [0, 2, 4, 8, 16, 32];
    const decompressors = [zlib.inflateSync, zlib.inflateRawSync, zlib.gunzipSync];

    for (const offset of offsets) {
        if (buffer.length <= offset + 8) continue;
        const slice = buffer.subarray(offset);
        for (const fn of decompressors) {
            try {
                return fn(slice);
            } catch {
                // Try the next format.
            }
        }
    }

    return null;
}

function firstTagText(xml, tag) {
    const match = xml.match(new RegExp(`<${tag}[^>]*>\\s*([\\s\\S]*?)\\s*<\\/${tag}>`, 'i'));
    return match ? match[1] : null;
}

function firstCData(xml, tag) {
    const match = xml.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, 'i'));
    return match ? match[1] : null;
}

function extractEncryptedParts(xml) {
    const mapping = [
        ['content', 'orig'],
        ['contentts', 'ts'],
        ['contentroma', 'roma']
    ];
    const result = {};
    for (const [tag, key] of mapping) {
        result[key] = firstCData(xml, tag) || firstTagText(xml, tag) || '';
    }
    return result;
}

function extractLyricContent(xml) {
    const tagStart = xml.indexOf('<Lyric_1');
    if (tagStart !== -1) {
        const tail = xml.slice(tagStart);
        const closeSelf = tail.indexOf('/>');
        const closeNormal = tail.indexOf('>');
        const closeIndex = closeSelf !== -1
            ? closeSelf
            : closeNormal !== -1
                ? closeNormal
                : -1;

        if (closeIndex !== -1) {
            const attrs = tail.slice(0, closeIndex);
            const key = 'LyricContent="';
            const startIndex = attrs.indexOf(key);
            if (startIndex !== -1) {
                const valueStart = startIndex + key.length;
                const valueEnd = attrs.lastIndexOf('"');
                if (valueEnd > valueStart) {
                    return attrs
                        .slice(valueStart, valueEnd)
                        .replace(/&#10;/g, '\n')
                        .replace(/&#13;/g, '\n')
                        .replace(/&quot;/g, '"')
                        .replace(/&apos;/g, "'")
                        .replace(/&amp;/g, '&')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/\r\n/g, '\n')
                        .replace(/\r/g, '\n');
                }
            }
        }
    }

    const cdataFallback = firstCData(xml, 'content');
    if (cdataFallback) {
        return cdataFallback
            .replace(/&#13;/g, '\n')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n');
    }

    return firstCData(xml, 'LyricContent') || firstTagText(xml, 'LyricContent');
}

function looksLikeQqLyricXml(text) {
    if (!text) return false;
    return (
        text.includes('<Lyric_1') ||
        text.includes('LyricContent=') ||
        text.includes('<LyricContent') ||
        text.includes('<content') ||
        text.includes('<?xml')
    );
}

function looksLikeDecryptedLyricText(text) {
    if (!text) return false;
    if (looksLikeQqLyricXml(text)) return true;
    if (/^\[\d{2}:\d{2}(?:\.\d{1,3})?\]/m.test(text)) return true;

    let printable = 0;
    let total = 0;
    for (const char of text) {
        total += 1;
        if (
            char === '\n' ||
            char === '\r' ||
            char === '\t' ||
            (char >= ' ' && char <= '~') ||
            /[\u00A0-\uD7FF\uE000-\uFFFD]/.test(char)
        ) {
            printable += 1;
        }
    }

    return total > 0 && printable / total > 0.85;
}

function applyReplacements(text) {
    return (text || '')
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\u3000/g, ' ');
}

function plainText(line) {
    return line.glyphs.map((glyph) => glyph.text).join('').trim();
}

function containsBracketTag(text) {
    return (text.includes('[') && text.includes(']')) || (text.includes('【') && text.includes('】'));
}

function containsColon(text) {
    return text.includes(':') || text.includes('：');
}

function hasCreditKeyword(text) {
    const lower = text.toLowerCase();
    const cnTokens = ['词', '曲', '制作人', '编曲', '监制'];
    const enTokens = ['lyrics', 'lyric', 'composed', 'compose', 'producer', 'produced', 'arranger'];
    return cnTokens.some((token) => text.includes(token)) || enTokens.some((token) => lower.includes(token));
}

function isLicenseWarningLine(text) {
    const tokens = ['未经', '许可', '授权', '不得', '请勿', '使用', '版权', '翻唱'];
    let count = 0;
    for (const token of tokens) {
        if (text.includes(token)) count += 1;
    }
    return count >= 4;
}

function parseQrc(xml) {
    const content = extractLyricContent(xml);
    if (!content) return [];

    const lines = [];
    const normalizedContent = content
        .replace(/\uFEFF/g, '')
        .replace(/&#13;/g, '\n')
        .replace(/&#10;/g, '\n')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
    const lineHeaderRe = /^\s*\[(\d+),(\d+)\](.*)$/;
    const timePairRe = /\((\d+),(\d+)\)/g;

    for (const rawLine of normalizedContent.split('\n').map((line) => line.trim()).filter(Boolean)) {
        const headerMatch = rawLine.match(lineHeaderRe);
        if (!headerMatch) continue;

        const startMs = Number(headerMatch[1]);
        const durationMs = Number(headerMatch[2]);
        const body = headerMatch[3] || '';
        const glyphs = [];

        let lastEnd = 0;
        for (const match of body.matchAll(timePairRe)) {
            const matchStart = match.index ?? 0;
            const segment = body.slice(lastEnd, matchStart);
            let tokenText = applyReplacements(segment.replace(/[()]/g, ''));
            const offsetMs = Number(match[1]);
            const glyphDurationMs = Number(match[2]);

            const isBlank = !tokenText.trim();
            if (isBlank) {
                if (/\s/.test(segment)) {
                    glyphs.push({ text: ' ', offsetMs, durationMs: glyphDurationMs });
                }
            } else {
                glyphs.push({ text: tokenText, offsetMs, durationMs: glyphDurationMs });
            }

            lastEnd = matchStart + match[0].length;
        }

        if (!glyphs.length) continue;

        const minOffset = Math.min(...glyphs.map((glyph) => glyph.offsetMs));
        const usesAbsolute = minOffset >= startMs;
        const baseGlyphs = usesAbsolute
            ? glyphs.map((glyph) => ({
                ...glyph,
                offsetMs: glyph.offsetMs - startMs
            }))
            : glyphs;

        const withGaps = [];
        for (let index = 0; index < baseGlyphs.length; index += 1) {
            const glyph = baseGlyphs[index];
            withGaps.push(glyph);

            if (index + 1 < baseGlyphs.length) {
                const end = glyph.offsetMs + glyph.durationMs;
                const nextStart = baseGlyphs[index + 1].offsetMs;
                if (nextStart > end) {
                    withGaps.push({ text: '', offsetMs: end, durationMs: nextStart - end });
                }
            }
        }

        const lastGlyphEnd = Math.max(...withGaps.map((glyph) => glyph.offsetMs + glyph.durationMs));
        const trimmedDuration = Math.max(1, Math.min(durationMs, lastGlyphEnd + TRAILING_TAIL_TRIM_SLACK_MS));

        lines.push({
            startMs,
            durationMs: trimmedDuration,
            glyphs: withGaps,
            raw: rawLine
        });
    }

    let filtered = lines
        .sort((a, b) => a.startMs - b.startMs)
        .filter((line) => {
            const text = plainText(line);
            if (!text) return false;
            if (containsBracketTag(text)) return false;
            if (isLicenseWarningLine(text)) return false;
            if (containsColon(text) && hasCreditKeyword(text)) return false;
            return true;
        });

    if (filtered.length > 1) {
        let trimIndex = filtered.length;
        for (let index = 0; index < filtered.length; index += 1) {
            const text = plainText(filtered[index]);
            if (containsColon(text) && hasCreditKeyword(text)) {
                trimIndex = index;
                break;
            }
        }
        filtered = filtered.slice(0, trimIndex);
    }

    if (!filtered.length) return filtered;

    const finalLines = [];
    const firstLine = filtered[0];
    if (firstLine.startMs >= LONG_GAP_DOTS_THRESHOLD_MS) {
        finalLines.push({
            startMs: 0,
            durationMs: firstLine.startMs,
            glyphs: [{ text: '...', offsetMs: 0, durationMs: firstLine.startMs }],
            raw: `[0,${firstLine.startMs}]...`
        });
    }

    for (let index = 0; index < filtered.length; index += 1) {
        const current = filtered[index];
        finalLines.push(current);
        if (index + 1 < filtered.length) {
            const next = filtered[index + 1];
            const gap = next.startMs - (current.startMs + current.durationMs);
            if (gap >= LONG_GAP_DOTS_THRESHOLD_MS) {
                finalLines.push({
                    startMs: current.startMs + current.durationMs,
                    durationMs: gap,
                    glyphs: [{ text: '...', offsetMs: 0, durationMs: gap }],
                    raw: `[${current.startMs + current.durationMs},${gap}]...`
                });
            }
        }
    }

    return finalLines;
}

function matchTranslationLine(lines, targetLine) {
    if (!lines || !lines.length || !targetLine) return null;
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const line of lines) {
        const distance = Math.abs(line.startMs - targetLine.startMs);
        if (distance < bestDistance) {
            best = line;
            bestDistance = distance;
        }
    }
    return bestDistance <= 800 ? best : null;
}

function parseTranslationLrc(raw) {
    if (!raw) return new Map();
    const extracted = extractLyricContent(raw);
    const source = (extracted || raw)
        .replace(/&#10;/g, '\n')
        .replace(/&#13;/g, '\n')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
    const map = new Map();
    const regex = /^\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\](.*)$/gm;
    let match;

    while ((match = regex.exec(source)) !== null) {
        const mm = Number(match[1] || 0);
        const ss = Number(match[2] || 0);
        const msStr = match[3] || '0';
        const text = (match[4] || '').trim();
        if (!text || text === '//' || text.startsWith('TME')) continue;
        const ms = ((mm * 60) + ss) * 1000 + Math.min(999, Number(`${msStr}00`.slice(0, 3)) || 0);
        map.set(ms, text);
    }

    return map;
}

function normalizeSingerList(value) {
    if (Array.isArray(value)) {
        return value.map((item) => {
            if (!item) return null;
            if (typeof item === 'string') return { name: item };
            return { name: item.name || item.title || item.singerName || '' };
        }).filter((item) => item && item.name);
    }

    if (typeof value === 'string' && value.trim()) {
        return value.split(/[\/,&]/).map((name) => ({ name: name.trim() })).filter((item) => item.name);
    }

    return [];
}

function normalizeQqSearchSong(item) {
    if (!item || typeof item !== 'object') return null;

    const songmid = item.songmid || item.mid || item.songMid || item.music_mid || '';
    const songid = item.songid || item.id || item.songId || item.musicid || 0;
    const songname = item.songname || item.title || item.name || item.songName || '';
    const albumname = item.albumname || item.album?.name || item.albumName || item.album_title || '';
    const singer = normalizeSingerList(item.singer || item.singers || item.artist || item.artists);

    if (!songmid && !songid) return null;
    if (!songname) return null;

    return {
        ...item,
        songmid,
        songid,
        songname,
        albumname,
        singer
    };
}

function parseLrcLines(raw) {
    if (!raw) return [];

    const source = raw
        .replace(/\uFEFF/g, '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
    const timestampRe = /\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
    const parsed = [];

    for (const rawLine of source.split('\n')) {
        if (!rawLine.trim()) continue;

        const timestamps = [...rawLine.matchAll(timestampRe)];
        if (!timestamps.length) continue;

        const text = applyReplacements(rawLine.replace(timestampRe, '')).trim();
        if (!text) continue;
        if (/^(ti|ar|al|by|offset):/i.test(text)) continue;

        for (const match of timestamps) {
            const mm = Number(match[1] || 0);
            const ss = Number(match[2] || 0);
            const msStr = match[3] || '0';
            const startMs = ((mm * 60) + ss) * 1000 + Math.min(999, Number(`${msStr}00`.slice(0, 3)) || 0);

            parsed.push({
                startMs,
                durationMs: 2000,
                glyphs: [{ text, offsetMs: 0, durationMs: 2000 }],
                raw: rawLine
            });
        }
    }

    parsed.sort((a, b) => a.startMs - b.startMs);
    for (let index = 0; index < parsed.length; index += 1) {
        const current = parsed[index];
        const next = parsed[index + 1];
        if (next) {
            current.durationMs = Math.max(1, next.startMs - current.startMs);
            current.glyphs[0].durationMs = current.durationMs;
        } else {
            current.durationMs = Math.max(current.durationMs, 2500);
            current.glyphs[0].durationMs = current.durationMs;
        }
    }

    return parsed;
}

function buildTranslationLinesFromLrc(mainLines, translationMap) {
    if (!mainLines?.length || !translationMap?.size) return [];
    return buildTranslationLines(mainLines, translationMap);
}

function buildTranslationLines(mainLines, translationMap, leadTol = 300, tailTol = 300) {
    if (!mainLines?.length || !translationMap?.size) return [];

    const transArr = [...translationMap.entries()]
        .map(([t, text]) => ({ t, text }))
        .sort((a, b) => a.t - b.t);

    if (!transArr.length) return [];

    const used = new Array(transArr.length).fill(false);
    const result = [];
    const sortedLines = [...mainLines].sort((a, b) => a.startMs - b.startMs);

    const strictTol = 60;
    let ti = 0;

    for (const line of sortedLines) {
        const start = line.startMs;
        while (ti < transArr.length && transArr[ti].t < start - strictTol) ti += 1;

        const candidates = [];
        if (ti > 0) candidates.push(ti - 1);
        candidates.push(ti);
        if (ti + 1 < transArr.length) candidates.push(ti + 1);

        let bestIdx = null;
        let bestDist = Number.POSITIVE_INFINITY;

        for (const ci of candidates) {
            if (ci < 0 || ci >= transArr.length || used[ci]) continue;
            const dist = Math.abs(transArr[ci].t - start);
            if (dist <= strictTol && dist < bestDist) {
                bestDist = dist;
                bestIdx = ci;
            }
        }

        if (bestIdx !== null) {
            used[bestIdx] = true;
            result.push({
                startMs: line.startMs,
                durationMs: line.durationMs,
                glyphs: [{ text: transArr[bestIdx].text, offsetMs: 0, durationMs: line.durationMs }],
                raw: transArr[bestIdx].text
            });
        }
    }

    if (result.length < sortedLines.length) {
        const existing = new Map(result.map((line) => [line.startMs, line]));

        function neighborStart(index, delta) {
            const nextIndex = index + delta;
            if (nextIndex < 0 || nextIndex >= sortedLines.length) return null;
            return sortedLines[nextIndex].startMs;
        }

        let startIdx = 0;
        for (let i = 0; i < sortedLines.length; i += 1) {
            const line = sortedLines[i];
            if (existing.has(line.startMs)) continue;

            const start = line.startMs;
            const end = line.startMs + line.durationMs;
            const winL = start - leadTol;
            const winR = end + tailTol;
            const center = start + Math.floor(line.durationMs / 2);
            const prevStart = neighborStart(i, -1);
            const nextStart = neighborStart(i, 1);

            while (startIdx < transArr.length && transArr[startIdx].t < winL) startIdx += 1;

            let bestIdx = null;
            let bestScore = Number.POSITIVE_INFINITY;

            for (let idx = startIdx; idx < transArr.length; idx += 1) {
                const { t } = transArr[idx];
                if (t > winR) break;
                if (used[idx]) continue;

                let closerToThis = true;
                if (prevStart !== null && Math.abs(t - start) > Math.abs(t - prevStart)) closerToThis = false;
                if (nextStart !== null && Math.abs(t - start) > Math.abs(t - nextStart)) closerToThis = false;
                if (!closerToThis) continue;

                const score = Math.abs(t - center);
                if (score < bestScore) {
                    bestScore = score;
                    bestIdx = idx;
                }
            }

            if (bestIdx !== null) {
                used[bestIdx] = true;
                existing.set(line.startMs, {
                    startMs: line.startMs,
                    durationMs: line.durationMs,
                    glyphs: [{ text: transArr[bestIdx].text, offsetMs: 0, durationMs: line.durationMs }],
                    raw: transArr[bestIdx].text
                });
                if (bestIdx > startIdx) startIdx = bestIdx;
            }
        }

        return [...existing.values()].sort((a, b) => a.startMs - b.startMs);
    }

    return result.sort((a, b) => a.startMs - b.startMs);
}

function resolveCurrentLyric(lines, progressMs) {
    if (!lines || !lines.length) {
        return { line: null, nextLine: null, wordIndex: -1, lineIndex: -1 };
    }

    const time = Math.max(0, Math.floor(progressMs || 0));
    let currentIndex = lines.findIndex((line) => time >= line.startMs && time < line.startMs + line.durationMs);
    if (currentIndex === -1) {
        if (time < lines[0].startMs) {
            return { line: null, nextLine: lines[0] || null, wordIndex: -1, lineIndex: -1 };
        }

        const nextIndex = lines.findIndex((line) => line.startMs > time);
        if (nextIndex !== -1) {
            currentIndex = Math.max(0, nextIndex - 1);
        } else {
            currentIndex = lines.length - 1;
        }
    }

    const line = lines[currentIndex];
    const relative = Math.max(0, time - line.startMs);
    let wordIndex = -1;

    for (let index = 0; index < line.glyphs.length; index += 1) {
        const glyph = line.glyphs[index];
        if (relative >= glyph.offsetMs && relative < glyph.offsetMs + glyph.durationMs) {
            wordIndex = index;
            break;
        }
    }

    if (wordIndex === -1 && relative >= 0) {
        wordIndex = line.glyphs.findIndex((glyph) => glyph.offsetMs + glyph.durationMs > relative);
        if (wordIndex === -1) wordIndex = line.glyphs.length - 1;
    }

    return {
        line,
        nextLine: lines[currentIndex + 1] || null,
        wordIndex,
        lineIndex: currentIndex
    };
}

class QQLyricsService {
    constructor(logger) {
        this.logger = logger;
        this.cache = new Map();
    }

    async getLyricsForTrack(track) {
        if (!track?.name || !track?.artists?.length) return null;

        const artist = track.artists.map((item) => item.name).join(', ');
        const album = track.album?.name || '';
        const cacheKey = `${track.id || track.name}::${artist}::${album}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            const lyrics = await this.fetchAndParse(track.name, artist, album);
            this.cache.set(cacheKey, lyrics);
            return lyrics;
        } catch (err) {
            this.logger.error(`[QQLyrics] Failed to load lyrics: ${err.message}`);
            try {
                const fallbackLyrics = await this.fetchFromLrclib(track.name, artist, album);
                this.cache.set(cacheKey, fallbackLyrics);
                return fallbackLyrics;
            } catch (fallbackErr) {
                this.logger.error(`[LRCLIB] Fallback failed: ${fallbackErr.message}`);
                this.cache.set(cacheKey, null);
                return null;
            }
        }
    }

    async fetchAndParse(song, artist, album) {
        const { songSimp, artistSimp, query } = buildPrimaryQuery(song, artist);
        this.logger.info(`[QQLyrics] Search query: ${query}`);
        const candidates = await this.fetchSongList(query, 1, 10);
        if (!candidates.length) {
            this.logger.warn(`[QQLyrics] No candidates found for "${song}" / "${artist}"`);
            return null;
        }

        this.logger.info(`[QQLyrics] Found ${candidates.length} candidate(s) for "${song}" / "${artist}"`);

        const targetTitleTokens = tokenSet(normalizeForScore(songSimp));
        const targetArtistTokens = tokenSet(normalizeForMatch(artistSimp));
        const targetAlbumTokens = tokenSet(normalizeForScore(toSimplifiedChinese(album)));

        const ranked = candidates.map((candidate) => {
            const title = candidate.songname || '';
            const titleTokens = tokenSet(normalizeForScore(title));
            const singerNames = Array.isArray(candidate.singer)
                ? candidate.singer.map((item) => item.name).join(' ')
                : '';
            const artistTokens = tokenSet(normalizeForMatch(toSimplifiedChinese(singerNames)));
            const albumTokens = tokenSet(normalizeForScore(candidate.albumname || ''));

            const titleSim = jaccardSimilarity(titleTokens, targetTitleTokens);
            const artistSim = targetArtistTokens.size ? jaccardSimilarity(artistTokens, targetArtistTokens) : 0;
            const albumSim = targetAlbumTokens.size ? jaccardSimilarity(albumTokens, targetAlbumTokens) : 0;

            let bonus = 0;
            if (normalizeForScore(title) === normalizeForScore(songSimp)) bonus += 0.2;
            if (targetArtistTokens.size && artistTokens.size) {
                const exactArtist = artistTokens.size === targetArtistTokens.size && [...targetArtistTokens].every((item) => artistTokens.has(item));
                const artistSuperset = [...targetArtistTokens].every((item) => artistTokens.has(item));
                if (exactArtist) bonus += 0.35;
                else if (artistSuperset) bonus += 0.15;
                else if (artistSim === 0) bonus -= 0.35;
            }
            if (titleSim === 0) bonus -= 0.25;

            const lowerTitle = title.toLowerCase();
            if (/(bootleg|remix|8-bit|8bit|instrumental|karaoke|伴奏|纯音乐)/.test(lowerTitle)) {
                bonus -= 0.3;
            } else if (/(live|cover|mix|edit|版本)/.test(lowerTitle)) {
                bonus -= 0.15;
            }

            const score = Math.max(0, Math.min(1, 0.5 * titleSim + 0.25 * artistSim + 0.25 * albumSim + bonus));
            return { candidate, score };
        }).sort((a, b) => b.score - a.score);

        for (const { candidate, score } of ranked.slice(0, 3)) {
            const singerNames = Array.isArray(candidate.singer)
                ? candidate.singer.map((item) => item.name).join(', ')
                : '';
            this.logger.info(
                `[QQLyrics] Candidate score=${score.toFixed(3)} title="${candidate.songname || ''}" singer="${singerNames}" album="${candidate.albumname || ''}" songid="${candidate.songid || ''}" songmid="${candidate.songmid || ''}"`
            );
        }

        for (const { candidate } of ranked.slice(0, 3)) {
            const songId = candidate.songid ? String(candidate.songid) : '';
            const songMid = candidate.songmid || '';
            this.logger.info(`[QQLyrics] Trying candidate songid="${songId}" songmid="${songMid}"`);
            const response = songId && songId !== '0'
                ? await this.getLyricsById(songId)
                : await this.getLyricsByMid(songMid);
            if (!response?.lyrics) {
                this.logger.warn(`[QQLyrics] Candidate returned no decodable original lyrics`);
                continue;
            }

            const originalLines = parseQrc(response.lyrics);
            const translationMap = parseTranslationLrc(response.trans);
            const translationLines = buildTranslationLines(originalLines, translationMap);
            const romanizationLines = response.roma ? parseQrc(response.roma) : [];
            this.logger.info(
                `[QQLyrics] Parsed lines original=${originalLines.length} translation=${translationLines.length} translationMap=${translationMap.size} roma=${romanizationLines.length}`
            );

            if (!originalLines.length) {
                const lyricContent = extractLyricContent(response.lyrics);
                this.logger.warn(
                    `[QQLyrics] LyricContent present=${!!lyricContent} preview="${(lyricContent || response.lyrics || '').slice(0, 240).replace(/\n/g, '\\n')}"`
                );
                this.logger.warn('[QQLyrics] Original lyrics decrypted but parsed to 0 lines');
                continue;
            }

            return {
                source: 'qq',
                wordSynced: true,
                originalXml: response.lyrics,
                translationXml: response.trans || null,
                romanizationXml: response.roma || null,
                lines: originalLines,
                translationLines,
                romanizationLines,
                songId,
                songMid
            };
        }

        this.logger.warn(`[QQLyrics] QQ lyrics unavailable for "${song}" / "${artist}", trying LRCLIB fallback`);
        return this.fetchFromLrclib(song, artist, album);
    }

    async fetchFromLrclib(song, artist, album) {
        const exact = await this.getLrclibExact(song, artist, album);
        const candidate = exact || await this.searchLrclib(song, artist, album);
        if (!candidate) {
            this.logger.warn(`[LRCLIB] No lyrics found for "${song}" / "${artist}"`);
            return null;
        }

        const syncedLyrics = candidate.syncedLyrics || candidate.synced_lyrics || '';
        const plainLyrics = candidate.plainLyrics || candidate.plain_lyrics || candidate.lyrics || '';
        const lines = parseLrcLines(syncedLyrics);
        const translationLines = [];

        this.logger.info(
            `[LRCLIB] Matched id="${candidate.id || ''}" track="${candidate.trackName || candidate.name || song}" artist="${candidate.artistName || artist}" synced=${!!syncedLyrics} plain=${!!plainLyrics} lines=${lines.length}`
        );

        if (!lines.length && plainLyrics) {
            this.logger.warn('[LRCLIB] Candidate has no synced LRC lines, skipping fallback candidate');
            return null;
        }

        return {
            source: 'lrclib',
            wordSynced: false,
            originalXml: syncedLyrics || plainLyrics || '',
            translationXml: null,
            romanizationXml: null,
            lines,
            translationLines: buildTranslationLinesFromLrc(lines, new Map()),
            romanizationLines: [],
            songId: String(candidate.id || ''),
            songMid: ''
        };
    }

    async getLrclibExact(song, artist, album) {
        try {
            const response = await axios.get(`${LRCLIB_BASE_URL}/get`, {
                params: {
                    track_name: song,
                    artist_name: artist,
                    album_name: album || undefined
                },
                headers: {
                    'User-Agent': QQ_USER_AGENT
                },
                validateStatus: () => true
            });

            if (response.status >= 200 && response.status < 300 && response.data && !response.data.error) {
                return response.data;
            }
        } catch (err) {
            this.logger.warn(`[LRCLIB] Exact lookup failed: ${err.message}`);
        }

        return null;
    }

    async searchLrclib(song, artist, album) {
        try {
            const response = await axios.get(`${LRCLIB_BASE_URL}/search`, {
                params: {
                    track_name: song,
                    artist_name: artist,
                    album_name: album || undefined
                },
                headers: {
                    'User-Agent': QQ_USER_AGENT
                }
            });

            const rows = Array.isArray(response.data) ? response.data : [];
            if (!rows.length) return null;

            const targetTitleTokens = tokenSet(normalizeForScore(toSimplifiedChinese(song)));
            const targetArtistTokens = tokenSet(normalizeForMatch(toSimplifiedChinese(artist)));
            const targetAlbumTokens = tokenSet(normalizeForScore(toSimplifiedChinese(album)));

            const ranked = rows.map((candidate) => {
                const title = candidate.trackName || candidate.name || '';
                const artistName = candidate.artistName || candidate.artist || '';
                const albumName = candidate.albumName || candidate.album || '';
                const titleSim = jaccardSimilarity(tokenSet(normalizeForScore(title)), targetTitleTokens);
                const artistSim = targetArtistTokens.size
                    ? jaccardSimilarity(tokenSet(normalizeForMatch(artistName)), targetArtistTokens)
                    : 0;
                const albumSim = targetAlbumTokens.size
                    ? jaccardSimilarity(tokenSet(normalizeForScore(albumName)), targetAlbumTokens)
                    : 0;

                let bonus = 0;
                if (normalizeForScore(title) === normalizeForScore(song)) bonus += 0.2;
                if (artistSim === 0 && targetArtistTokens.size) bonus -= 0.25;

                const score = Math.max(0, Math.min(1, titleSim * 0.55 + artistSim * 0.3 + albumSim * 0.15 + bonus));
                return { candidate, score };
            }).sort((a, b) => b.score - a.score);

            for (const { candidate, score } of ranked.slice(0, 3)) {
                this.logger.info(
                    `[LRCLIB] Candidate score=${score.toFixed(3)} title="${candidate.trackName || candidate.name || ''}" artist="${candidate.artistName || candidate.artist || ''}" album="${candidate.albumName || candidate.album || ''}" id="${candidate.id || ''}"`
                );
            }

            return ranked[0]?.score > 0 ? ranked[0].candidate : null;
        } catch (err) {
            this.logger.warn(`[LRCLIB] Search failed: ${err.message}`);
            return null;
        }
    }

    async fetchSongList(query, pageCount = 1, pageSize = 10) {
        const results = [];
        const seen = new Set();

        for (let page = 1; page <= Math.max(1, pageCount); page += 1) {
            const payload = {
                req_1: {
                    method: 'DoSearchForQQMusicDesktop',
                    module: 'music.search.SearchCgiService',
                    param: {
                        num_per_page: String(Math.max(1, pageSize)),
                        page_num: String(page),
                        query,
                        search_type: 0
                    }
                }
            };

            const response = await axios.post('https://u.y.qq.com/cgi-bin/musicu.fcg', payload, {
                headers: {
                    Referer: 'https://c.y.qq.com/',
                    'User-Agent': QQ_USER_AGENT,
                    Cookie: QQ_COOKIE,
                    'Content-Type': 'application/json'
                }
            });

            const body = response.data?.req_1?.data?.body
                || response.data?.['music.search.SearchCgiService']?.data?.body
                || response.data?.data?.body
                || response.data?.body
                || {};
            const list = body.song?.list || body.item_song?.list || body.list || [];
            if (!list.length) break;

            for (const item of list) {
                const normalized = normalizeQqSearchSong(item);
                if (!normalized) continue;
                const key = normalized.songmid || String(normalized.songid || '');
                if (!key || seen.has(key)) continue;
                seen.add(key);
                results.push(normalized);
            }
        }

        return results;
    }

    async getLyricsByMid(mid) {
        if (!mid) return null;
        const songId = await this.fetchSongId(mid);
        return songId ? this.getLyricsById(songId) : null;
    }

    async fetchSongId(mid) {
        const callback = 'getOneSongInfoCallback';
        const response = await axios.post(
            'https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg',
            querystring.stringify({
                songmid: mid,
                tpl: 'yqq_song_detail',
                format: 'jsonp',
                callback,
                g_tk: 5381,
                jsonpCallback: callback,
                loginUin: 0,
                hostUin: 0,
                outCharset: 'utf8',
                notice: 0,
                platform: 'yqq',
                needNewCode: 0
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Referer: 'https://c.y.qq.com/',
                    'User-Agent': QQ_USER_AGENT
                }
            }
        );

        const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        const match = text.match(/"id"\s*:\s*(\d+)/);
        return match ? match[1] : null;
    }

    async getLyricsById(songId) {
        if (!songId) return null;

        const response = await axios.post(
            'https://c.y.qq.com/qqmusic/fcgi-bin/lyric_download.fcg',
            querystring.stringify({
                version: 15,
                miniversion: 82,
                lrctype: 4,
                musicid: songId
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Referer: 'https://c.y.qq.com/',
                    'User-Agent': QQ_USER_AGENT
                }
            }
        );

        const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        const cleaned = text.replace(/<!--|-->/g, '');
        const encryptedParts = extractEncryptedParts(cleaned);
        this.logger.info(
            `[QQLyrics] lyric_download songId=${songId} encrypted orig=${(encryptedParts.orig || '').length} ts=${(encryptedParts.ts || '').length} roma=${(encryptedParts.roma || '').length}`
        );
        const lyrics = decryptQrcHex(encryptedParts.orig || '');
        const trans = decryptQrcHex(encryptedParts.ts || '');
        const roma = decryptQrcHex(encryptedParts.roma || '');
        this.logger.info(
            `[QQLyrics] decrypted songId=${songId} origXml=${lyrics ? lyrics.length : 0} tsXml=${trans ? trans.length : 0} romaXml=${roma ? roma.length : 0}`
        );

        if (!lyrics && !trans) {
            return null;
        }

        return { lyrics: lyrics || '', trans: trans || null, roma: roma || null };
    }

    clearCache() {
        this.cache.clear();
    }
}

module.exports = {
    QQLyricsService,
    matchTranslationLine,
    resolveCurrentLyric,
    parseLrcLines
};
