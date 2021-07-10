const querystring = require('querystring');
const got = require('@/utils/got');
const config = require('@/config').value;
const { fallback, queryToInteger } = require('@/utils/readable-social');

module.exports = async (ctx) => {
    const fid = ctx.params.fid;
    const timestamp = Math.floor(Date.now() / 1000);
    let cookieString = `guestJs=${timestamp};`;
    if (config.nga.uid && config.nga.cid) {
        cookieString = `ngaPassportUid=${config.nga.uid}; ngaPassportCid=${config.nga.cid};`;
    }

    let recommend = 0;
    let orderBy = "postdatedesc"; // lastpostdesc
    const routeParams = ctx.params.routeParams;
    if (routeParams === 'recommend') {
	    recommend = 1;
    } else if (routeParams === 'postdatedesc' || routeParams === 'lastpostdesc') {
        orderBy = routeParams;
    } else {
        const parsed = querystring.parse(routeParams);
        recommend = fallback(undefined, queryToInteger(parsed.recommend), 0);
        orderBy = parsed.orderBy ? 'lastpostdesc' : 'postdatedesc';
    }

    const formatContent = (content) =>
        content
            .replace(/\[img\](.+?)\[\/img\]/g, (match, p1) => {
                const src = p1.replace(/\?.*/g, '');
                return `<img src="${src}" />`;
            })
            .replace(/\[url=(.+?)\](.+?)\[\/url\]/g, `<a href="$1">$2</a>`)
            .replace(/\[url\](.+?)\[\/url\]/g, `<a href="$1">$1</a>`)
            .replace(/\[@(.+?)\]/g, `<a href="https://nga.178.com/nuke.php?func=ucp&__inchst=UTF-8&username=$1">$1</a>`)
            .replace(/\[s:(.*?):(.*?)\]/g, '[$2]')
            .replace(/\[quote\](.*?)\[\/quote\]/g, '<blockquote>$1</blockquote>');
    const homePage = await got({
        method: 'post',
        url: 'https://ngabbs.com/app_api.php?__lib=subject&__act=list',
        headers: {
            'X-User-Agent': 'NGA_skull/6.0.5(iPhone10,3;iOS 12.0.1)',
            Cookie: cookieString,
        },
        form: {
            fid,
            recommend: recommend,
            order_by: orderBy,
        },
    });

    const forumname = homePage.data.forumname;

    const list = homePage.data.result.data.filter(({ tid }) => tid);

    const resultItem = await Promise.all(
        list.map(async ({ subject, postdate, author, tid }) => {
            const link = `https://nga.178.com/read.php?tid=${tid}`;
            const item = {
                title: subject,
                description: '',
                author: author,
                link: link,
                pubDate: new Date(postdate * 1000).toUTCString(),
            };

            const description = await ctx.cache.tryGet(`nga-forum: ${link}`, async () => {
                const response = await got({
                    method: 'post',
                    url: 'https://ngabbs.com/app_api.php?__lib=post&__act=list',
                    headers: {
                        'X-User-Agent': 'NGA_skull/6.0.5(iPhone10,3;iOS 12.0.1)',
                        Cookie: cookieString,
                    },
                    form: {
                        tid,
                    },
                });

                return response.data.code === 0 ? formatContent(response.data.result[0].content) : response.data.msg;
            });

            item.description = description;
            return Promise.resolve(item);
        })
    );

    ctx.state.data = {
        title: `NGA-${forumname}${recommend ? '-精华' : ''}`,
        link: `https://nga.178.com/thread.php?fid=${fid}`,
        description: 'NGA是国内专业的游戏玩家社区',
        item: resultItem,
    };
};
