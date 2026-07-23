import type { Route } from '@/types';
import { parseDate } from '@/utils/parse-date';

import { apiGet, processImage } from './utils';

export const route: Route = {
    path: '/collection/:id',
    categories: ['social-media'],
    example: '/zhihu2/collection/26444956',
    parameters: { id: '收藏夹 id，可在收藏夹页面 URL 中找到' },
    features: {
        requireConfig: [
            {
                name: 'ZHIHU_ACCESS_TOKEN',
                description: '知乎 Android 客户端 access_token',
                optional: true,
            },
            {
                name: 'ZHIHU_REFRESH_TOKEN',
                description: '知乎 Android 客户端 refresh_token',
                optional: true,
            },
        ],
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['www.zhihu.com/collection/:id'],
            target: '/collection/:id',
        },
    ],
    name: '收藏夹',
    maintainers: ['wiz-os'],
    handler,
};

async function handler(ctx) {
    const id = ctx.req.param('id');

    let cTitle = `收藏夹${id}`;
    try {
        const c = await apiGet(`/collections/${id}`);
        cTitle = c.title || cTitle;
    } catch {
        // fallback to default title
    }

    const data = await apiGet(`/collections/${id}/contents`, { limit: 10, offset: 0 });
    const feedItems = data.data || [];

    const items = feedItems.map((item) => {
        const c = item.content || item;
        const type = c.type || '';
        let title = '';
        let description = '';
        let link = c.url || '';
        const author = c.author?.name || '';

        switch (type) {
            case 'answer':
                title = c.question?.title || '';
                description = processImage(c.content || c.excerpt || '');
                link = c.url || `https://www.zhihu.com/question/${c.question?.id}/answer/${c.id}`;
                break;
            case 'article':
                title = c.title || '';
                description = processImage(c.content || c.excerpt || '');
                link = c.url || `https://zhuanlan.zhihu.com/p/${c.id}`;
                break;
            case 'zvideo':
                title = c.title || '';
                description = `${c.description || ''}<br>
                    <video controls poster="${c.video?.thumbnail || ''}" preload="metadata">
                        <source src="${c.video?.playlist?.fhd?.url ?? c.video?.playlist?.hd?.url ?? c.video?.playlist?.sd?.url ?? ''}" type="video/mp4">
                    </video>`;
                link = c.url || '';
                break;
            case 'pin':
                title = c.excerpt_title || c.title || '';
                description = processImage(c.content || c.excerpt || '');
                link = `https://www.zhihu.com/pin/${c.id}`;
                break;
            default:
                title = c.title || (c.question && c.question.title) || c.excerpt || type || '';
                description = processImage(c.content || c.excerpt || '');
        }

        return {
            title,
            description,
            pubDate: parseDate((c.updated || c.updated_time || c.created || 0) * 1000),
            link,
            guid: String(c.id || item.id),
            author,
        };
    });

    return {
        title: `知乎收藏夹 - ${cTitle}`,
        link: `https://www.zhihu.com/collection/${id}`,
        item: items,
    };
}
