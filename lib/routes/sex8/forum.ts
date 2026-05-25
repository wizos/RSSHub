import { load } from 'cheerio';

import { config } from '@/config';
import type { Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';
import timezone from '@/utils/timezone';

const host = config.sex8.baseUrl;

// Helper: resolve real image src from Discuz lazy-load attributes
const resolveImgSrc = (el) => {
    const dataImgUrl = el.attr('data-imgurl')?.trim();
    const dataOldFile = el.attr('data-oldfile')?.trim();
    const file = el.attr('file')?.trim();
    const currentSrc = el.attr('src')?.trim();
    return dataImgUrl || dataOldFile || file || currentSrc || '';
};

// Helper: check if src is a placeholder (no real image)
const isPlaceholderSrc = (src: string) => !src || src === 'undefined' || src.includes('/static/image/common/none.gif') || src.includes('/static/image/common/') || src.startsWith('/static/');

// Decode obfuscated image from media-server.baihu368.today
// The server adds 16 bytes of padding at both ends of the real image data.
// We fetch the file, strip the padding, and return a base64 data URL.
const decodeObfuscatedImg = async (url: string): Promise<string | null> => {
    try {
        const response = await got({
            method: 'get',
            url,
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'X-Bundle-Info': '1, com.a.test',
            },
        });
        const buffer = Buffer.from(response.data as ArrayBuffer);
        if (buffer.length < 33) {
            return null;
        }
        // Strip first 16 and last 16 bytes
        const sliced = buffer.subarray(16, -16);

        // Detect MIME type from magic bytes
        let mime = 'image/webp';
        if (sliced[0] === 0xff && sliced[1] === 0xd8) {
            mime = 'image/jpeg';
        } else if (sliced[0] === 0x89 && sliced[1] === 0x50 && sliced[2] === 0x4e && sliced[3] === 0x47) {
            mime = 'image/png';
        } else if (sliced[0] === 0x47 && sliced[1] === 0x49 && sliced[2] === 0x46) {
            mime = 'image/gif';
        } else if (sliced[0] === 0x52 && sliced[1] === 0x49 && sliced[2] === 0x46 && sliced[3] === 0x46) {
            mime = 'image/webp';
        }

        return `data:${mime};base64,${sliced.toString('base64')}`;
    } catch {
        return null;
    }
};

// Process a list of img elements: decode obfuscated images, resolve lazy-load, remove placeholders
const processImages = async ($, imgElements: cheerio.Element[]) => {
    const decodePromises: Array<Promise<{ el: cheerio.Cheerio<cheerio.Element>; src: string | null }>> = [];

    for (const image of imgElements) {
        const el = $(image);
        const dataImgUrl = el.attr('data-imgurl')?.trim();
        const realSrc = resolveImgSrc(el);

        if (isPlaceholderSrc(realSrc)) {
            el.remove();
            continue;
        }

        if (dataImgUrl && dataImgUrl.includes('media-server.baihu368.today')) {
            // Collect decode promises for parallel execution
            decodePromises.push(decodeObfuscatedImg(dataImgUrl).then((src) => ({ el, src })));
        } else {
            el.attr('src', realSrc);
            el.removeAttr('file zoomfile data-imgurl data-oldfile aid inpost onmouseover onclick referrerpolicy id class width height border');
        }
    }

    // Decode all obfuscated images in parallel
    const results = await Promise.all(decodePromises);
    for (const { el, src } of results) {
        if (src) {
            el.attr('src', src);
            el.removeAttr('file zoomfile data-imgurl data-oldfile aid inpost onmouseover onclick referrerpolicy id class width height border');
        } else {
            el.remove();
        }
    }
};

export const route: Route = {
    path: '/forum/:fid?/:filter?/:digest?',
    name: '板块',
    maintainers: ['wizos'],
    handler,
    example: '/sex8/forum/282',
    parameters: {
        fid: '板块 id，默认为 282',
        filter: '过滤，可选值为 digest(精华)、86400(一天)、604800(周)、2592000(月)，默认为空',
        digest: '当 filter 为 digest 时，digest 值为 1，默认为空',
    },
    radar: [
        {
            source: ['www.sex8.cc/forum.php?mod=forumdisplay&fid=:fid', 'www.sex8.cc/'],
            target: '/:fid?',
        },
    ],
    features: {
        nsfw: true,
    },
};

async function handler(ctx) {
    const fid = ctx.req.param('fid') ?? '282';
    const filter = ctx.req.param('filter') ?? '';
    const digest = ctx.req.param('digest') ?? '';

    const limit = ctx.req.query('limit') ? Number.parseInt(ctx.req.query('limit')) : 20;

    const filterParams = filter ? `&filter=${filter}` : '';
    const digestParams = digest ? `&digest=${digest}` : '';
    const currentUrl = `${host}/forum.php?mod=forumdisplay&fid=${fid}${filterParams}${digestParams}`;

    const headers: Record<string, string> = {};
    if (config.sex8.cookie) {
        headers.Cookie = config.sex8.cookie;
    }

    const response = await ofetch(currentUrl, {
        headers,
    });
    const $ = load(response);

    let items = $('tbody[id^=normalthread]')
        .toArray()
        .slice(0, limit)
        .map((item) => {
            item = $(item);

            const a = item.find('a.s.xst').first();
            const href = a.attr('href');
            const hasCategory = item.find('th em a').length;
            const category = hasCategory ? `[${item.find('th em a').text()}] ` : '';

            const author = item.find('td.by cite a').first();

            // Date: try em span with title attr first, then em text
            const dateEm = item.find('td.by em').first();
            const dateSpan = dateEm.find('span').first();
            const dateText = dateSpan.length ? (dateSpan.attr('title') ?? dateSpan.text()) : dateEm.text();

            return {
                title: `${category}${a.text().trim()}`,
                link: new URL(href, host).href,
                author: author.text().trim(),
                pubDate: timezone(parseDate(dateText), +8),
            };
        });

    items = await Promise.all(
        items.map((item) =>
            cache.tryGet(item.link, async () => {
                const detailResponse = await ofetch(item.link, {
                    headers,
                });

                const $ = load(detailResponse);

                // Parse date from detail page
                const dateEm = $('em[id^=authorposton]').first();
                const dateSpan = dateEm.find('span').first();
                const dateText = (dateSpan.length ? dateEm.attr('title') : dateEm.text().replace('发表于', '').trim()) ?? '';
                item.pubDate = timezone(parseDate(dateText), +8);

                // Parse post content
                const postMessage = $('td[id^=postmessage_]').first();

                // Remove known ad / promo / login / edit elements by class/id
                postMessage.find('div.b_pr').remove();
                postMessage.find('div.attach_nopermission').remove();
                postMessage.find('i.pstatus').remove();

                // Remove promo links and their containing div
                const promoLinkPatterns = ['a[href*="dasp.php"]', 'a[href*="plugin.php?id=activities"]', 'a[href*="address.zip"]', 'a[href*="bxkfw458.com"]'];
                for (const pattern of promoLinkPatterns) {
                    postMessage.find(pattern).each((index, el) => {
                        const ancestor = $(el).closest('div');
                        if (ancestor.length && postMessage.find(ancestor).length) {
                            ancestor.remove();
                        } else {
                            $(el).remove();
                        }
                    });
                }

                // Process images in post content (decode obfuscated, resolve lazy-load, remove placeholders)
                await processImages($, postMessage.find('img').toArray());

                // Also process images from .pattl (attachment list)
                const pattl = $('.pattl');
                await processImages($, pattl.find('img').toArray());
                // Only append pattl if it has remaining img elements
                if (pattl.find('img').length) {
                    postMessage.append(pattl.find('img'));
                }

                // Clean up: remove hidden elements, scripts, etc.
                postMessage.find('div[style*="display: none"]').remove();
                postMessage.find('span[style*="display: none"]').remove();
                postMessage.find('script').remove();
                postMessage.find('meta').remove();
                postMessage.find('em[onclick]').remove();
                // Remove empty divs (only comments/whitespace inside)
                const allDivs = postMessage.find('div').toArray();
                for (let i = allDivs.length - 1; i >= 0; i--) {
                    const div = $(allDivs[i]);
                    if (div.find('img').length > 0 || div.find('a').length > 0 || div.text().trim()) {
                        continue;
                    }
                    div.remove();
                }
                // Unwrap font tags (replace with their children)
                postMessage.find('font').each((index, el) => {
                    $(el).replaceWith($(el).contents());
                });

                // Final output: strip HTML comments, clean empty divs, replace ignore_js_op
                let description = postMessage.html() || '';
                description = description.replaceAll(/<!--[\s\S]*?-->/g, '');
                description = description.replaceAll(/<div>\s*<\/div>/gi, '');
                description = description.replaceAll('ignore_js_op', 'div');
                item.description = description || '抓取原帖失败';

                // Check for magnet link or torrent
                const magnet = postMessage.find('div.blockcode li').first().text();
                const isMag = magnet.startsWith('magnet');
                const torrent = postMessage.find('p.attnm a').attr('href');

                if (isMag || torrent !== undefined) {
                    item.enclosure_url = isMag ? magnet : new URL(torrent, host).href;
                    item.enclosure_type = isMag ? 'application/x-bittorrent' : 'application/octet-stream';
                }

                return item;
            })
        )
    );

    return {
        title: `杏吧 - ${$('#pt a:last-child').text() || $('h1 a').first().text()}`,
        link: currentUrl,
        item: items,
    };
}
