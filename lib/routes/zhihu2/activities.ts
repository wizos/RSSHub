import type { Route } from '@/types';
import { parseDate } from '@/utils/parse-date';

import { apiGet, extractExcerpt, processImage } from './utils';

export const route: Route = {
    path: '/people/activities/:id',
    categories: ['social-media'],
    example: '/zhihu2/people/activities/puti',
    parameters: { id: '作者 id，可在用户主页 URL 中找到' },
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
            source: ['www.zhihu.com/people/:id'],
        },
    ],
    name: '用户动态',
    maintainers: ['wiz-os'],
    handler,
};

async function handler(ctx) {
    const id = ctx.req.param('id');

    const data = await apiGet(`/people/${id}/profile/creations/feed`, { type: 'answer', limit: 10, offset: 0 });
    const feedItems = data.data || [];

    const items = feedItems.map((item) => {
        const content = item.content || item;
        const targetSource = content.target_source || content;
        const title = targetSource.text || content.title || '';
        const link = targetSource.target_link || content.url || '';
        const description = processImage(targetSource.full_text || targetSource.text || content.text || '');
        const createdTime = content.created || item.created || 0;
        const answerId = content.url_token || content.id || item.id;

        return {
            title: extractExcerpt(title, 100) || `动态 ${answerId}`,
            description,
            pubDate: parseDate(createdTime > 1e12 ? createdTime : createdTime * 1000),
            link,
            guid: String(answerId),
        };
    });

    return {
        title: `${id}的知乎动态`,
        link: `https://www.zhihu.com/people/${id}/activities`,
        item: items,
    };
}
