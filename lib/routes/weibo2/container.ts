import querystring from 'node:querystring';

import { config } from '@/config';
import type { Route } from '@/types';
import { ViewType } from '@/types';
import cache from '@/utils/cache';
import { parseDate } from '@/utils/parse-date';
import { fallback, queryToBoolean } from '@/utils/readable-social';
import timezone from '@/utils/timezone';

import weibo2Utils from './utils';

export const route: Route = {
    path: '/container/:containerid/:routeParams?',
    categories: ['social-media'],
    view: ViewType.SocialMedia,
    example: '/weibo2/container/1076031803822891',
    parameters: { containerid: '容器 ID，如 107603{uid} 为用户微博时间线', routeParams: '额外参数；请参阅上面的说明和表格' },
    features: {
        requireConfig: [
            {
                name: 'WEIBO_COOKIES',
                optional: true,
                description: 'SUB/SUBP Cookie，从 m.weibo.cn 浏览器登录后获取',
            },
        ],
        requirePuppeteer: true,
        antiCrawler: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: '容器时间线 (逆向 API)',
    maintainers: ['wiz-o'],
    handler,
    description: `::: warning
需要 Cookie 才能获取数据
:::

通过 containerid 直接获取微博内容。

**containerid 规则**（来自 APK 逆向分析）：

| containerid                               | 含义                       |
| ----------------------------------------- | -------------------------- |
| \`107603{uid}\`                             | 用户微博时间线（所有微博） |
| \`100505{uid}\`                             | 用户主页信息               |
| \`100103type%3D61%26q%3D{keyword}%26t%3D0\` | 关键词搜索                 |

也可直接使用 \`/weibo2/user/:uid\` 路由自动拼接 containerid。`,
};

async function handler(ctx) {
    const containerid = ctx.req.param('containerid');
    const limit = ctx.req.query('limit') ? Number.parseInt(ctx.req.query('limit')) : 10;

    let displayVideo = '1';
    let displayArticle = '0';
    let displayComments = '0';
    let showRetweeted = '1';
    let showBloggerIcons = '0';
    if (ctx.req.param('routeParams')) {
        if (ctx.req.param('routeParams') === '1' || ctx.req.param('routeParams') === '0') {
            displayVideo = ctx.req.param('routeParams');
        } else {
            const routeParams = querystring.parse(ctx.req.param('routeParams'));
            displayVideo = fallback(undefined, queryToBoolean(routeParams.displayVideo), true) ? '1' : '0';
            displayArticle = fallback(undefined, queryToBoolean(routeParams.displayArticle), false) ? '1' : '0';
            displayComments = fallback(undefined, queryToBoolean(routeParams.displayComments), false) ? '1' : '0';
            showRetweeted = fallback(undefined, queryToBoolean(routeParams.showRetweeted), false) ? '1' : '0';
            showBloggerIcons = fallback(undefined, queryToBoolean(routeParams.showBloggerIcons), false) ? '1' : '0';
        }
    }

    const allCards = await weibo2Utils.tryWithCookies(async (cookies, verifier) => {
        const cached = await cache.tryGet(
            `weibo2:container:timeline:${containerid}`,
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

    const mblogCards = weibo2Utils.extractMblogsFromCards(allCards);

    const resultItems = await Promise.all(
        mblogCards
            .filter((item) => {
                if (!item.mblog) {
                    return false;
                }
                if (showRetweeted === '0' && item.mblog.retweeted_status) {
                    return false;
                }
                return true;
            })
            .slice(0, limit)
            .map(async (item) => {
                let { bid } = item.mblog;
                const { retweeted_status, created_at } = item.mblog;
                if (bid === '') {
                    try {
                        const url = new URL(item.scheme);
                        bid = url.searchParams.get('mblogid');
                        item.mblog.bid = bid;
                    } catch {
                        // ignore
                    }
                }

                const uid = item.mblog.user?.id;
                if (bid && uid) {
                    const key = `weibo2:container:${bid}`;
                    const data = await cache.tryGet(key, () => weibo2Utils.getShowData(uid, bid));

                    if (data && data.text) {
                        item.mblog.text = data.text;
                        item.mblog.created_at = parseDate(data.created_at);
                        item.mblog.pics = data.pics;
                        if (retweeted_status && data.retweeted_status) {
                            retweeted_status.created_at = data.retweeted_status.created_at;
                        }
                    } else {
                        item.mblog.created_at = timezone(created_at, +8);
                    }
                } else {
                    item.mblog.created_at = timezone(created_at, +8);
                }

                const retweet = retweeted_status;
                if (retweet?.isLongText && retweet.user?.id && retweet.bid) {
                    const retweetData = await cache.tryGet(`weibo2:retweeted:${retweet.user.id}:${retweet.bid}`, () => weibo2Utils.getShowData(retweet.user.id, retweet.bid));
                    if (retweetData?.text) {
                        retweeted_status.text = retweetData.text;
                    }
                }

                const formatExtended = weibo2Utils.formatExtended(ctx, item.mblog, uid);
                let desc = formatExtended.description;

                if (displayVideo === '1') {
                    desc = retweeted_status ? weibo2Utils.formatVideo(desc, retweeted_status) : weibo2Utils.formatVideo(desc, item.mblog);
                }

                if (displayComments === '1') {
                    desc = await weibo2Utils.formatComments(ctx, desc, item.mblog, showBloggerIcons);
                }

                if (displayArticle === '1') {
                    desc = await (retweeted_status ? weibo2Utils.formatArticle(ctx, desc, retweeted_status) : weibo2Utils.formatArticle(ctx, desc, item.mblog));
                }

                return {
                    ...formatExtended,
                    description: desc,
                };
            })
    );

    return weibo2Utils.sinaimgTvax({
        title: `微博容器 - ${containerid}`,
        link: `https://m.weibo.cn/p/index?containerid=${containerid}`,
        description: `微博容器时间线，containerid: ${containerid}`,
        item: resultItems,
        allowEmpty: true,
    });
}
