import querystring from 'node:querystring';

import { config } from '@/config';
import ConfigNotFoundError from '@/errors/types/config-not-found';
import type { Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { fallback, queryToBoolean } from '@/utils/readable-social';

import weibo2Utils from './utils';

export const route: Route = {
    path: '/friends/:routeParams?',
    categories: ['social-media'],
    example: '/weibo2/friends',
    parameters: { routeParams: '额外参数；请参阅上面的说明和表格' },
    features: {
        requireConfig: [
            {
                name: 'WEIBO_COOKIES',
                optional: false,
                description: 'SUB/SUBP Cookie，从 m.weibo.cn 浏览器登录后获取',
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
            source: ['weibo.com/'],
            target: '/friends',
        },
    ],
    name: '最新关注时间线 (逆向 API)',
    maintainers: ['wiz-o'],
    handler,
    url: 'weibo.com/',
    description: `::: warning
此方案必须使用用户\`Cookie\`进行抓取，只可以获取登录用户的关注时间线
:::`,
};

async function handler(ctx) {
    if (!config.weibo.cookies) {
        throw new ConfigNotFoundError('Weibo Friends Timeline is not available due to the absense of [Weibo Cookies]. Check <a href="https://docs.rsshub.app/deploy/config#route-specific-configurations">relevant config tutorial</a>');
    }

    let displayVideo = '1';
    let displayArticle = '0';
    let displayComments = '0';
    if (ctx.req.param('routeParams')) {
        if (ctx.req.param('routeParams') === '1' || ctx.req.param('routeParams') === '0') {
            displayVideo = ctx.req.param('routeParams');
        } else {
            const routeParams = querystring.parse(ctx.req.param('routeParams'));
            displayVideo = fallback(undefined, queryToBoolean(routeParams.displayVideo), true) ? '1' : '0';
            displayArticle = fallback(undefined, queryToBoolean(routeParams.displayArticle), false) ? '1' : '0';
            displayComments = fallback(undefined, queryToBoolean(routeParams.displayComments), false) ? '1' : '0';
        }
    }

    const uid = await cache.tryGet(
        'weibo2:friends:login-user',
        async () => {
            const _r = await got({
                method: 'get',
                url: 'https://m.weibo.cn/api/config',
                headers: {
                    Referer: 'https://m.weibo.cn/',
                    Cookie: config.weibo.cookies,
                    ...weibo2Utils.apiHeaders,
                },
            });
            return _r.data.data.uid;
        },
        config.cache.routeExpire,
        false
    );

    const profileData = await cache.tryGet(
        `weibo2:friends:profile:${uid}`,
        async () => {
            const _r = await weibo2Utils.fetchUserProfile(uid, config.weibo.cookies);
            return _r.data;
        },
        config.cache.routeExpire,
        false
    );

    const name = profileData?.data?.userInfo?.screen_name || `微博用户${uid}`;

    const responseData = await cache.tryGet(
        `weibo2:friends:index:${uid}`,
        async () => {
            const _r = await got({
                method: 'get',
                url: 'https://m.weibo.cn/feed/friends',
                headers: {
                    Referer: 'https://m.weibo.cn/',
                    Cookie: config.weibo.cookies,
                    ...weibo2Utils.apiHeaders,
                },
            });
            return _r.data.data;
        },
        config.cache.routeExpire,
        false
    );

    const resultItems = await Promise.all(
        responseData.statuses.map(async (item) => {
            const retweet = item.retweeted_status;
            if (retweet?.isLongText) {
                const retweetData = await cache.tryGet(`weibo2:retweeted:${retweet.user.id}:${retweet.bid}`, () => weibo2Utils.getShowData(retweet.user.id, retweet.bid));
                if (retweetData?.text) {
                    item.retweeted_status.text = retweetData.text;
                }
            }

            const formatExtended = weibo2Utils.formatExtended(ctx, item);
            let description = formatExtended.description;

            if (displayVideo === '1') {
                description = item.retweeted_status ? weibo2Utils.formatVideo(description, item.retweeted_status) : weibo2Utils.formatVideo(description, item);
            }

            if (displayComments === '1') {
                description = await weibo2Utils.formatComments(ctx, description, item, '0');
            }

            if (displayArticle === '1') {
                description = await (item.retweeted_status ? weibo2Utils.formatArticle(ctx, description, item.retweeted_status) : weibo2Utils.formatArticle(ctx, description, item));
            }

            return {
                ...formatExtended,
                description,
            };
        })
    );

    return weibo2Utils.sinaimgTvax({
        title: `${name} 的 最新关注时间线`,
        link: 'https://weibo.com',
        item: resultItems,
    });
}
