import type { Route } from '@/types';
import { parseDate } from '@/utils/parse-date';

import { apiGet, extractExcerpt, processImage } from './utils';

export const route: Route = {
    path: '/feed',
    categories: ['social-media'],
    example: '/zhihu2/feed',
    parameters: {},
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
    name: '首页推荐',
    maintainers: ['wiz-os'],
    handler,
};

async function handler() {
    const data = await apiGet('/topstory/recommend', { limit: 10 });
    const feedItems = (data.data || []).filter((item) => item.type !== 'feed_advert');

    const items = feedItems.map((item) => {
        const t = item.target || {};
        const type = t.type || '';
        let title = '';
        let description = '';
        let link = '';
        const author = t.author?.name || '';

        switch (type) {
            case 'answer':
                title = t.question?.title || '';
                description = processImage(t.content || t.excerpt || '');
                link = `https://www.zhihu.com/question/${t.question?.id}/answer/${t.id}`;
                break;
            case 'article':
                title = t.title || '';
                description = processImage(t.content || t.excerpt || '');
                link = t.url || `https://zhuanlan.zhihu.com/p/${t.id}`;
                break;
            case 'pin':
                title = t.excerpt_title || t.title || extractExcerpt(t.content || t.excerpt || '');
                description = processImage(t.content || t.excerpt || '');
                link = `https://www.zhihu.com/pin/${t.id}`;
                break;
            case 'question':
                title = t.title || '';
                description = processImage(t.detail || t.content || t.excerpt || '');
                link = `https://www.zhihu.com/question/${t.id}`;
                break;
            case 'zvideo':
                title = t.title || '';
                description = `${t.description || ''}<br>
                    <video controls poster="${t.video?.thumbnail || ''}" preload="metadata">
                        <source src="${t.video?.playlist?.fhd?.url ?? t.video?.playlist?.hd?.url ?? t.video?.playlist?.sd?.url ?? ''}" type="video/mp4">
                    </video>`;
                link = t.url || '';
                break;
            default:
                title = t.title || (t.question && t.question.title) || t.name || t.excerpt || type || '';
                description = processImage(t.content || t.excerpt || '');
                link = t.url || (t.question ? `https://www.zhihu.com/question/${t.question.id}` : '');
        }

        if (!title) {
            title = extractExcerpt(description, 80);
        }

        return {
            title,
            description,
            pubDate: parseDate((item.created_time || t.created_time || 0) * 1000),
            link,
            guid: String(item.id),
            author,
        };
    });

    return {
        title: '知乎首页推荐',
        link: 'https://www.zhihu.com',
        item: items,
    };
}
