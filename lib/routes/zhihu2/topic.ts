import type { Route } from '@/types';
import { parseDate } from '@/utils/parse-date';

import { apiGet, processImage } from './utils';

export const route: Route = {
    path: '/topic/:topicId',
    categories: ['social-media'],
    example: '/zhihu2/topic/19828946',
    parameters: { topicId: '话题 id' },
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
            source: ['www.zhihu.com/topic/:topicId'],
            target: '/topic/:topicId',
        },
    ],
    description: `::: warning
知乎已封禁 \`api.zhihu.com/topics/\` 系列 API（返回 code:10003），此路由当前不可用。建议使用原 zhihu 命名空间下的话题路由。
:::`,
    name: '话题（暂不可用）',
    maintainers: ['wiz-os'],
    handler,
};

async function handler(ctx) {
    const { topicId } = ctx.req.param();

    let tName = `话题${topicId}`;
    try {
        const t = await apiGet(`/topics/${topicId}`);
        tName = t.name || tName;
    } catch {
        // fallback to default name
    }

    let data;
    try {
        data = await apiGet(`/topics/${topicId}/feeds/top`, { limit: 10, offset: 0 });
    } catch {
        data = await apiGet(`/topics/${topicId}/feeds/essence`, { limit: 10, offset: 0 });
    }

    const feedItems = data.data || [];

    const items = feedItems.map((item) => {
        const t = item.target || {};
        const type = t.type || '';
        let title = t.title || (t.question && t.question.title) || t.name || '';
        let description = '';
        let link = t.url || (t.question ? `https://www.zhihu.com/question/${t.question.id}` : '');
        const author = t.author?.name || '';

        switch (type) {
            case 'answer':
                title = `${t.question?.title || ''} - ${author}的回答`;
                description = `<strong>${t.question?.title || ''}</strong><br>${author}的回答<br/>${processImage(t.content || '')}`;
                link = `https://www.zhihu.com/question/${t.question?.id}/answer/${t.id}`;
                break;
            case 'article':
                description = processImage(t.content || '');
                link = t.url || `https://zhuanlan.zhihu.com/p/${t.id}`;
                break;
            case 'question':
                description = t.detail || t.title || '';
                link = `https://www.zhihu.com/question/${t.id}`;
                break;
            case 'zvideo':
                description = `${t.description || ''}<br>
                    <video controls poster="${t.video?.thumbnail || ''}" preload="metadata">
                        <source src="${t.video?.playlist?.fhd?.url ?? t.video?.playlist?.hd?.url ?? t.video?.playlist?.sd?.url ?? ''}" type="video/mp4">
                    </video>`;
                link = t.url || '';
                break;
            case 'pin':
                title = t.excerpt_title || t.title || title;
                description = processImage(t.content || t.excerpt || '');
                link = `https://www.zhihu.com/pin/${t.id}`;
                break;
            default:
                description = t.content || t.excerpt || '';
                if (!title) {
                    title = t.excerpt || type || '';
                }
        }

        return {
            title,
            description,
            pubDate: parseDate((t.updated_time || t.created_time || 0) * 1000),
            link,
            guid: String(t.id || item.id),
            author,
        };
    });

    return {
        title: `知乎话题 - ${tName}`,
        link: `https://www.zhihu.com/topic/${topicId}`,
        item: items,
    };
}
