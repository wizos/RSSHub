import crypto from 'node:crypto';

import { load } from 'cheerio';

import { config } from '@/config';
import cache from '@/utils/cache';
import md5 from '@/utils/md5';
import ofetch from '@/utils/ofetch';

import g_encrypt from '../zhihu/execlib/x-zse-96-v3';

const API_BASE = 'https://api.zhihu.com';
const APP_VERSION = '10.95.0';
const API_VERSION = '3.0.1';

const OAUTH = {
    clientId: '8d5227e0aaaa4797a763ac64e0c3b8',
    clientSecret: 'ecbefbf6b17e47ecb9035107866380',
    appId: '1355',
};

function buildHeaders(accessToken: string, extraHeaders?: Record<string, string>): Record<string, string> {
    return {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': `ZhihuHybrid ${APP_VERSION} (Android 14;Google Pixel 6) zhihu`,
        'x-app-version': APP_VERSION,
        'x-api-version': API_VERSION,
        'x-network-type': 'wifi',
        'x-os-version': '14',
        'x-app-id': OAUTH.appId,
        Accept: 'application/json',
        ...extraHeaders,
    };
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
    const timestamp = Date.now().toString();
    const source = 'com.zhihu.android';
    const message = 'refresh_token' + OAUTH.clientId + source + timestamp;
    const signature = crypto.createHmac('sha1', OAUTH.clientSecret).update(message).digest('hex');

    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: OAUTH.clientId,
        source,
        timestamp,
        signature,
    }).toString();

    const data = await ofetch(API_BASE + '/api/account/prod/sign_in', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': `ZhihuHybrid ${APP_VERSION} (Android 14) zhihu`,
            'x-app-version': APP_VERSION,
            'x-api-version': API_VERSION,
            'x-app-id': OAUTH.appId,
            'x-os-version': '14',
            'x-network-type': 'wifi',
        },
        body,
    });

    const tokenData = data.data || data;
    if (tokenData.access_token) {
        await cache.set('zhihu2:access_token', tokenData.access_token, tokenData.expires_in ?? 7200);
        if (tokenData.refresh_token) {
            await cache.set('zhihu2:refresh_token', tokenData.refresh_token, 86400 * 30);
        }
        if (tokenData.cookie) {
            if (tokenData.cookie.z_c0) {
                await cache.set('zhihu2:z_c0', tokenData.cookie.z_c0, 86400 * 30);
            }
            if (tokenData.cookie.q_c0) {
                await cache.set('zhihu2:q_c0', tokenData.cookie.q_c0, 86400 * 30);
            }
        }
        return tokenData.access_token;
    }
    throw new Error('Failed to refresh access_token');
}

export async function getAccessToken(): Promise<string> {
    if (config.zhihu2?.accessToken) {
        return config.zhihu2.accessToken;
    }

    const cached = await cache.get('zhihu2:access_token');
    if (cached) {
        return cached;
    }

    const refreshToken = config.zhihu2?.refreshToken || (await cache.get('zhihu2:refresh_token'));
    if (refreshToken) {
        return await refreshAccessToken(refreshToken);
    }

    throw new Error('ZHIHU_ACCESS_TOKEN or ZHIHU_REFRESH_TOKEN is required. Please set one of these environment variables.');
}

async function getSignedHeaders(accessToken: string, apiPath: string): Promise<Record<string, string>> {
    // Get d_c0 from cookie (z_c0 token contains session info that works as d_c0 equivalent)
    const z_c0 = (await cache.get('zhihu2:z_c0')) || config.zhihu?.cookies || '';

    // Extract d_c0 from cookies if available
    const dc0 =
        z_c0
            ?.split(';')
            .map((e: string) => e.trim())
            .find((e: string) => e.startsWith('d_c0='))
            ?.slice('d_c0='.length) ||
        z_c0 ||
        '';

    const xzse93 = '101_3_3';
    const f = `${xzse93}+${apiPath}+${dc0}`;
    const xzse96 = '2.0_' + g_encrypt(md5(f));

    const extraHeaders: Record<string, string> = {
        'x-zse-93': xzse93,
        'x-zse-96': xzse96,
    };

    if (z_c0) {
        extraHeaders.Cookie = z_c0.includes('z_c0=') ? z_c0 : `z_c0=${z_c0}`;
    }

    return buildHeaders(accessToken, extraHeaders);
}

// API paths that require x-zse-96 signature
const SIGNED_PATHS = ['/questions/', '/answers/', '/topics/', '/people/', '/moments/', '/collections/'];

function needsSignature(apiPath: string): boolean {
    return SIGNED_PATHS.some((p) => apiPath.startsWith(p));
}

export async function apiGet<T = any>(apiPath: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const accessToken = await getAccessToken();
    const url = new URL(apiPath, API_BASE + '/');
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
            url.searchParams.set(k, String(v));
        }
    }

    const headers = needsSignature(apiPath) ? await getSignedHeaders(accessToken, apiPath) : buildHeaders(accessToken);

    const data = await ofetch(url.toString(), {
        headers,
    });

    return data;
}

const fixImageUrl = (url: string) => url.split('?', 1)[0].replace('_b.jpg', '.jpg').replace('_r.jpg', '.jpg').replace('_720w.jpg', '.jpg');

export const processImage = (content: string) => {
    const $ = load(content, null, false);

    $('noscript, a[data-draft-type="mcn-link-card"]').remove();

    $('a').each((_, elem) => {
        const href = $(elem).attr('href');
        if (href?.startsWith('http://link.zhihu.com/?target=') || href?.startsWith('https://link.zhihu.com/?target=')) {
            const url = new URL(href);
            const target = url.searchParams.get('target') || '';
            try {
                $(elem).attr('href', decodeURIComponent(target));
            } catch {
                // sometimes the target is not a valid url
            }
        }
    });

    $('img.content_image, img.origin_image, img.content-image, img.data-actualsrc, figure>img').each((i, e) => {
        if (e.attribs['data-actualsrc']) {
            $(e).attr({
                src: fixImageUrl(e.attribs['data-actualsrc']),
                width: null,
                height: null,
            });
            $(e).removeAttr('data-actualsrc');
        } else if (e.attribs['data-original']) {
            $(e).attr({
                src: fixImageUrl(e.attribs['data-original']),
                width: null,
                height: null,
            });
            $(e).removeAttr('data-original');
        } else {
            $(e).attr({
                src: fixImageUrl(e.attribs.src),
                width: null,
                height: null,
            });
        }
    });

    return $.html();
};

export function extractExcerpt(html: string, maxLen = 300): string {
    if (!html || typeof html !== 'string') {
        return '';
    }
    const text = html
        .replaceAll(/<[^>]+>/g, '')
        .replaceAll(/&[^;]+;/g, ' ')
        .trim();
    return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}
