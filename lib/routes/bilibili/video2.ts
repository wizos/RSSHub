import type { Context } from 'hono';

import { config } from '@/config';
import type { Route } from '@/types';
import { ViewType } from '@/types';
import got from '@/utils/got';
import md5 from '@/utils/md5';
import { parseDuration } from '@/utils/helpers';
import logger from '@/utils/logger';

import { getVideoUrl, renderUGCDescription } from './utils';

const bvidTime = 1_589_990_400;

export const route: Route = {
    path: '/user/video2/:uid/:embed?',
    categories: ['social-media'],
    view: ViewType.Videos,
    example: '/bilibili/user/video2/2267573',
    parameters: { uid: '用户 id, 可在 UP 主主页中找到', embed: '默认为开启内嵌视频, 任意值为关闭' },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['space.bilibili.com/:uid'],
            target: '/user/video2/:uid',
        },
    ],
    name: 'UP 主投稿 (备用)',
    maintainers: ['DIYgod', 'Konano', 'pseudoyu'],
    handler,
};

// 旧版接口返回的视频条目
interface ArcListItem {
    aid: number;
    bvid: string;
    title: string;
    pic: string;
    duration: number;
    pubdate: number;
    author: { mid: number; name: string; face: string };
    stat: { view: number; danmaku: number; reply: number; favorite: number; coin: number; like: number; share: number };
    rights: Record<string, number>;
}

// 旧版接口响应
interface ArcListResponse {
    code: number;
    message: string;
    data: {
        archives: ArcListItem[];
        page: { pn: number; ps: number; count: number };
    };
}

// WBI 签名接口返回的视频条目（与原 video.ts 一致）
interface VideoItem {
    aid: number;
    author?: string;
    bvid?: string;
    comment?: number;
    created: number;
    description: string;
    length: string;
    pic: string;
    title: string;
}

interface VideoListData {
    list?: {
        vlist?: VideoItem[];
    };
}

interface VideoListResponse {
    code?: number;
    data?: VideoListData;
    message?: string;
}

const videoListApiPath = '/x/space/wbi/arc/search';
const arcListApiPath = '/x/space/arc/list';

// ========== 自包含 WBI 签名（不依赖 cache.getCookie / cache.getWbiVerifyString，避免触发 Playwright） ==========
const MIXIN_KEY_ENC_TAB = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 63, 27, 36, 40, 5, 39, 9, 59, 16, 21, 43, 4, 33, 55, 35, 48, 25, 12, 28];

function getMixinKey(orig: string): string {
    return MIXIN_KEY_ENC_TAB.reduce((s, i) => s + orig[i], '');
}

function signWbi(params: Record<string, string | number>, imgKey: string, subKey: string): Record<string, string | number> {
    const mixinKey = getMixinKey(imgKey + subKey);
    const filtered = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''));
    filtered.wts = Math.floor(Date.now() / 1000);
    const query = Object.entries(filtered)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
    filtered.w_rid = md5(query + mixinKey);
    return filtered;
}

async function getWbiKeys(): Promise<[string, string]> {
    const { data: navResponse } = await got('https://api.bilibili.com/x/web-interface/nav', {
        headers: {
            Referer: 'https://www.bilibili.com/',
        },
    });
    const imgUrl = navResponse.data.wbi_img.img_url as string;
    const subUrl = navResponse.data.wbi_img.sub_url as string;
    return [imgUrl.split('/').pop()!.split('.')[0], subUrl.split('/').pop()!.split('.')[0]];
}

/**
 * 使用旧版接口 /x/space/arc/list 获取投稿列表
 * 该接口无需 WBI 签名，无需 Cookie，参数简单，反爬压力小
 */
async function fetchVideoListFromArcList(uid: string): Promise<ArcListResponse> {
    const params = new URLSearchParams({
        mid: uid,
        pn: '1',
        ps: '30',
        order: 'pubdate',
    });
    const response = await got(`https://api.bilibili.com${arcListApiPath}?${params}`, {
        headers: {
            Referer: `https://space.bilibili.com/${uid}/upload/video`,
        },
    });
    const data = response.data as ArcListResponse;
    if (data.code !== 0) {
        throw new Error(`Got error code ${data.code} from arc/list: ${data.message}`);
    }
    return data;
}

/**
 * 使用 WBI 签名接口 /x/space/wbi/arc/search 获取投稿列表（回退方案）
 * 使用自包含的 WBI 签名逻辑，不依赖 cache 中会触发 Playwright 的方法
 */
async function fetchVideoListFromWbi(uid: string): Promise<VideoListData> {
    const cache = await import('./cache');
    const cookie = cache.default.getConfiguredCookie() || '';
    const [imgKey, subKey] = await getWbiKeys();
    const signedParams = signWbi({ mid: uid, pn: 1, ps: 30, order: 'pubdate', keyword: '', tid: 0 }, imgKey, subKey);
    const query = new URLSearchParams(Object.entries(signedParams).map(([k, v]) => [k, String(v)])).toString();
    const response = await got(`https://api.bilibili.com${videoListApiPath}?${query}`, {
        headers: {
            Referer: `https://space.bilibili.com/${uid}`,
            Cookie: cookie,
        },
    });
    const data = response.data as VideoListResponse;
    if (data.code) {
        logger.error(JSON.stringify(data.data));
        throw new Error(`Got error code ${data.code} while fetching: ${data.message}`);
    }

    return data.data;
}

async function handler(ctx: Context) {
    const isJsonFeed = ctx.req.query('format') === 'json';

    const uid = ctx.req.param('uid');
    const embed = !ctx.req.param('embed');

    let name = uid;
    let face: string | undefined;

    // 优先使用旧版接口，失败则回退到 WBI 签名接口
    let items: {
        title: string;
        description: string;
        pubDate: string;
        link: string;
        author: string;
        comments?: number;
        attachments?: { url: string; mime_type: string; duration_in_seconds?: number }[];
    }[];

    try {
        const arcListData = await fetchVideoListFromArcList(uid);
        const archives = arcListData.data.archives;

        // 旧版接口返回的数据中包含作者信息，直接使用，无需额外请求
        if (archives.length > 0 && archives[0].author.name) {
            name = archives[0].author.name;
        }
        if (archives.length > 0 && archives[0].author.face) {
            face = archives[0].author.face.replace('http://', 'https://');
        }

        items = await Promise.all(
            archives.map(async (v) => {
                const pic = v.pic.replace('http://', 'https://');
                const subtitles = isJsonFeed && !config.bilibili.excludeSubtitles && v.bvid ? (await import('./cache')).default.getVideoSubtitleAttachment(v.bvid) : [];
                return {
                    title: v.title,
                    description: renderUGCDescription(embed, pic, '', String(v.aid), undefined, v.bvid),
                    pubDate: new Date(v.pubdate * 1000).toUTCString(),
                    link: `https://www.bilibili.com/video/${v.bvid}`,
                    author: name,
                    comments: v.stat.reply,
                    attachments: v.bvid
                        ? [
                              {
                                  url: getVideoUrl(v.bvid),
                                  mime_type: 'text/html',
                                  duration_in_seconds: v.duration,
                              },
                              ...subtitles,
                          ]
                        : undefined,
                };
            })
        );
    } catch (arcListError) {
        logger.warn(`[bilibili/video2] arc/list failed, falling back to wbi/arc/search: ${arcListError}`);

        const data = await fetchVideoListFromWbi(uid);
        const videos = data.list?.vlist ?? [];

        if (videos.length > 0 && videos[0].author) {
            name = videos[0].author;
        }

        items = await Promise.all(
            videos.map(async (item) => {
                const subtitles = isJsonFeed && !config.bilibili.excludeSubtitles && item.bvid ? (await import('./cache')).default.getVideoSubtitleAttachment(item.bvid) : [];
                return {
                    title: item.title,
                    description: renderUGCDescription(embed, item.pic, item.description, String(item.aid), undefined, item.bvid),
                    pubDate: new Date(item.created * 1000).toUTCString(),
                    link: item.created > bvidTime && item.bvid ? `https://www.bilibili.com/video/${item.bvid}` : `https://www.bilibili.com/video/av${item.aid}`,
                    author: name,
                    comments: item.comment,
                    attachments: item.bvid
                        ? [
                              {
                                  url: getVideoUrl(item.bvid),
                                  mime_type: 'text/html',
                                  duration_in_seconds: parseDuration(item.length),
                              },
                              ...subtitles,
                          ]
                        : undefined,
                };
            })
        );
    }

    return {
        title: `${name} 的 bilibili 空间`,
        link: `https://space.bilibili.com/${uid}`,
        description: `${name} 的 bilibili 空间`,
        image: face ?? undefined,
        logo: face ?? undefined,
        icon: face ?? undefined,
        item: items,
    };
}
