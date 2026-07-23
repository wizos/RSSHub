import got from '@/utils/got';

import weiboUtils from '../weibo/utils';

const CONTAINER_USER_TIMELINE = (uid: string) => `107603${uid}`;
const CONTAINER_USER_PROFILE = (uid: string) => `100505${uid}`;

const weibo2Utils = {
    CONTAINER_USER_TIMELINE,
    CONTAINER_USER_PROFILE,

    apiHeaders: weiboUtils.apiHeaders,

    getCookies: weiboUtils.getCookies,
    tryWithCookies: weiboUtils.tryWithCookies,

    getShowData: weiboUtils.getShowData,
    formatExtended: weiboUtils.formatExtended,
    formatVideo: weiboUtils.formatVideo,
    formatArticle: weiboUtils.formatArticle,
    formatComments: weiboUtils.formatComments,
    formatTitle: weiboUtils.formatTitle,
    sinaimgTvax: weiboUtils.sinaimgTvax,

    extractMblogsFromCards(cards: any[]): any[] {
        const mblogs: any[] = [];
        for (const card of cards) {
            if (card.mblog) {
                mblogs.push(card);
            }
            if (card.card_group) {
                for (const cg of card.card_group) {
                    if (cg.mblog) {
                        mblogs.push(cg);
                    }
                }
            }
        }
        return mblogs;
    },

    async fetchContainerPage(containerid: string, page: number, cookies: string) {
        const url = `https://m.weibo.cn/api/container/getIndex?containerid=${containerid}&page=${page}`;
        const _r = await got({
            method: 'get',
            url,
            headers: {
                Referer: 'https://m.weibo.cn/',
                Cookie: cookies,
                ...weibo2Utils.apiHeaders,
            },
        });
        return _r.data;
    },

    fetchUserTimeline(uid: string, page: number, cookies: string) {
        return weibo2Utils.fetchContainerPage(CONTAINER_USER_TIMELINE(uid), page, cookies);
    },

    async fetchUserProfile(uid: string, cookies: string) {
        const url = `https://m.weibo.cn/api/container/getIndex?type=uid&value=${uid}`;
        const _r = await got({
            method: 'get',
            url,
            headers: {
                Referer: `https://m.weibo.cn/u/${uid}`,
                Cookie: cookies,
                ...weibo2Utils.apiHeaders,
            },
        });
        return _r.data;
    },
};

export default weibo2Utils;
