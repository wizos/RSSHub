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
    path: '/user/:uid/:routeParams?',
    categories: ['social-media'],
    view: ViewType.SocialMedia,
    example: '/weibo2/user/1803822891',
    parameters: { uid: '用户 id, 博主主页打开控制台执行 `$CONFIG.oid` 获取', routeParams: '额外参数；请参阅上面的说明和表格；特别地，当 `routeParams=1` 时开启微博视频显示' },
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
    radar: [
        {
            source: ['m.weibo.cn/u/:uid', 'm.weibo.cn/profile/:uid'],
            target: '/user/:uid',
        },
        {
            source: ['weibo.com/u/:uid'],
            target: '/user/:uid',
        },
    ],
    name: '博主 (逆向 API)',
    maintainers: ['wiz-o'],
    handler,
    description: `::: warning
部分博主仅登录可见，未提供 Cookie 的情况下不支持订阅，可以通过打开 \`https://m.weibo.cn/u/:uid\` 验证
:::

与 \`/weibo/user/\` 的区别：直接拼接 containerid (\`107603{uid}\`)，无需两次请求获取用户信息。`,
};

async function handler(ctx) {
    const uid = ctx.req.param('uid');
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
            `weibo2:user:timeline:${uid}`,
            async () => {
                const _r = await weibo2Utils.fetchUserTimeline(uid, 1, cookies);
                verifier(_r);
                return _r.data?.ok === 1 && _r.data?.data?.cards ? _r.data.data.cards : [];
            },
            config.cache.routeExpire,
            false
        );
        return cached;
    });

    const profileData = await weibo2Utils.tryWithCookies((cookies, verifier) =>
        cache.tryGet(
            `weibo2:user:profile:${uid}`,
            async () => {
                const _r = await weibo2Utils.fetchUserProfile(uid, cookies);
                verifier(_r);
                return _r.data;
            },
            config.cache.routeExpire,
            false
        )
    );

    let name = '';
    let description = '';
    let profileImageUrl = '';
    if (profileData?.data?.userInfo) {
        name = profileData.data.userInfo.screen_name;
        description = profileData.data.userInfo.description;
        profileImageUrl = profileData.data.userInfo.profile_image_url;
    }

    const mblogCards = weibo2Utils.extractMblogsFromCards(allCards);

    let resultItems = await Promise.all(
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
                    const url = new URL(item.scheme);
                    bid = url.searchParams.get('mblogid');
                    item.mblog.bid = bid;
                }

                const key = `weibo2:user:${bid}`;
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

                const retweet = retweeted_status;
                if (retweet?.isLongText) {
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
                    isPinned: item.profile_type_id?.startsWith('proweibotop'),
                };
            })
    );

    const pinnedItems = resultItems.filter((item) => item.isPinned);
    const ordinaryItems = resultItems.filter((item) => !item.isPinned);
    if (pinnedItems.length > 0 && ordinaryItems.length > 0) {
        const earliestOrdinaryPostTime = Math.min(...ordinaryItems.map((i) => i.pubDate).filter(Boolean));
        resultItems = ordinaryItems;
        for (const item of pinnedItems) {
            if (item.pubDate > earliestOrdinaryPostTime) {
                resultItems.unshift(item);
            }
        }
    }

    if (!name) {
        name = mblogCards.find((c) => c.mblog?.user?.screen_name)?.mblog?.user?.screen_name || `微博用户${uid}`;
    }

    return weibo2Utils.sinaimgTvax({
        title: `${name}的微博`,
        link: `https://weibo.com/${uid}/`,
        description,
        image: profileImageUrl,
        item: resultItems,
        allowEmpty: true,
    });
}
