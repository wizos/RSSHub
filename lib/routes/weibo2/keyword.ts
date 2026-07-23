import querystring from 'node:querystring';

import { config } from '@/config';
import type { Route } from '@/types';
import { ViewType } from '@/types';
import cache from '@/utils/cache';
import { fallback, queryToBoolean } from '@/utils/readable-social';
import timezone from '@/utils/timezone';

import weibo2Utils from './utils';

export const route: Route = {
    path: '/keyword/:keyword/:routeParams?',
    categories: ['social-media'],
    view: ViewType.SocialMedia,
    example: '/weibo2/keyword/RSSHub',
    parameters: { keyword: '你想订阅的微博关键词', routeParams: '额外参数；请参阅上面的说明和表格' },
    features: {
        requireConfig: [
            {
                name: 'WEIBO_COOKIES',
                optional: true,
                description: 'SUB/SUBP Cookie，从 m.weibo.cn 浏览器登录后获取',
            },
        ],
        requirePuppeteer: true,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: '关键词 (逆向 API)',
    maintainers: ['wiz-o'],
    handler,
    description: `::: warning
需要 Cookie 才能获取搜索结果
:::

使用 \`m.weibo.cn/api/container/getIndex\` 接口搜索关键词微博。`,
};

async function handler(ctx) {
    const keyword = ctx.req.param('keyword');
    const limit = ctx.req.query('limit') ? Number.parseInt(ctx.req.query('limit')) : 10;

    const containerid = `100103type%3D61%26q%3D${encodeURIComponent(keyword)}%26t%3D0`;

    const allCards = await weibo2Utils.tryWithCookies(async (cookies, verifier) => {
        const cached = await cache.tryGet(
            `weibo2:keyword:${keyword}`,
            async () => {
                const _r = await weibo2Utils.fetchContainerPage(containerid, 1, cookies);
                verifier(_r);
                return _r.data?.ok === 1 && _r.data?.data?.cards ? _r.data.data.cards : [];
            },
            config.cache.routeExpire,
            false
        );
        return cached;
    });

    const routeParams = querystring.parse(ctx.req.param('routeParams'));

    return weibo2Utils.sinaimgTvax({
        title: `又有人在微博提到${keyword}了`,
        link: `http://s.weibo.com/weibo/${encodeURIComponent(keyword)}&b=1&nodup=1`,
        description: `又有人在微博提到${keyword}了`,
        item: allCards
            .filter((i) => i.mblog)
            .slice(0, limit)
            .map((item) => {
                item.mblog.created_at = timezone(item.mblog.created_at, +8);
                if (item.mblog.retweeted_status?.created_at) {
                    item.mblog.retweeted_status.created_at = timezone(item.mblog.retweeted_status.created_at, +8);
                }
                return weibo2Utils.formatExtended(ctx, item.mblog, undefined, {
                    showAuthorInTitle: fallback(undefined, queryToBoolean(routeParams.showAuthorInTitle), true),
                    showAuthorInDesc: fallback(undefined, queryToBoolean(routeParams.showAuthorInDesc), true),
                });
            }),
    });
}
