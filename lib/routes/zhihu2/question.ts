import type { Route } from '@/types';
import { parseDate } from '@/utils/parse-date';

import { apiGet, processImage } from './utils';

export const route: Route = {
    path: '/question/:questionId',
    categories: ['social-media'],
    example: '/zhihu2/question/59895982',
    parameters: { questionId: '问题 id' },
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
            source: ['www.zhihu.com/question/:questionId'],
            target: '/question/:questionId',
        },
    ],
    name: '问题',
    maintainers: ['wiz-os'],
    handler,
};

async function handler(ctx) {
    const { questionId } = ctx.req.param();

    let qTitle = `问题${questionId}`;
    try {
        const q = await apiGet(`/v4/questions/${questionId}`);
        qTitle = q.title || qTitle;
    } catch {
        // fallback to default title
    }

    const data = await apiGet(`/v4/questions/${questionId}/answers`, {
        limit: 10,
        offset: 0,
        include: 'content,excerpt,voteup_count,comment_count,author',
    });
    const feedItems = data.data || [];

    const items = feedItems.map((item) => {
        const author = item.author?.name || '匿名';
        const excerpt = item.excerpt ? item.excerpt.slice(0, 40) : '';
        return {
            title: `${author}的回答${excerpt ? '：' + excerpt : ''}`,
            description: `${author}的回答<br/><br/>${processImage(item.content || item.excerpt || '')}`,
            pubDate: parseDate((item.updated_time || item.created_time || 0) * 1000),
            link: item.url || `https://www.zhihu.com/question/${questionId}/answer/${item.id}`,
            guid: String(item.id),
            author,
        };
    });

    return {
        title: `知乎问答 - ${qTitle}`,
        link: `https://www.zhihu.com/question/${questionId}`,
        item: items,
    };
}
