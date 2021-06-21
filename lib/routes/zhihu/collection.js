const got = require('@/utils/got');
const cheerio = require('cheerio');
const utils = require('./utils');

module.exports = async (ctx) => {
    const id = ctx.params.id;

    const response = await got({
        method: 'get',
        url: `https://www.zhihu.com/api/v4/collections/${id}/items?offset=0&limit=20`,
        headers: {
            ...utils.header,
            Referer: `https://www.zhihu.com/collection/${id}`,
        },
    });

    const list = response.data.data;

    const response2 = await got({
        method: 'get',
        url: `https://www.zhihu.com/collection/${id}`,
        headers: {
            ...utils.header,
            Referer: `https://www.zhihu.com/collection/${id}`,
        },
    });

    const meta = response2.data;
    const $ = cheerio.load(meta);
    const collection_title = $('.CollectionDetailPageHeader-title').text() + ' - 知乎收藏夹';
    const collection_description = $('.CollectionDetailPageHeader-description').text();


    const optimizeContent = (htmlString) => {
        htmlString = htmlString.replace(/<noscript>(<img.*?)<\/noscript><img src="data:.*?>/s, '$1',);
        htmlString = htmlString.replace(/<noscript>.*?<\/noscript>/s, '');
        const $ = cheerio.load(htmlString);
        $('img[data-original]').each((i, e) => {
            $(e).attr({
                src: e.attribs['data-original'],
                width: null,
                height: null,
                });
        });

        $('img[src^=data]').remove();
        $('[data-original]').removeAttr('data-original');
        $('[data-size]').removeAttr('data-size');
        $('[data-caption]').removeAttr('data-caption');
        $('[data-rawwidth]').removeAttr('data-rawwidth');
        $('[data-rawheight]').removeAttr('data-rawheight');
        $('[class]').removeAttr('class');
        return $('body').html();
    };
    const selectResolution = (video) => {
        if (video.playlist.fhd) {
            return video.playlist.fhd;
        }
        if (video.playlist.hd) {
            return video.playlist.hd;
        }
        if (video.playlist.ld) {
            return video.playlist.ld;
        }
        if (video.playlist.sd) {
            return video.playlist.sd;
        }
    };

    const out = await Promise.all(
        list.map(async (item) => {
        	  const rssitem = {
                pubDate: `${item.created}`,
                link: `${item.content.url}`,
                author: `${item.content.author.name}`,
            };
            switch (item.content.type) {
                case 'answer':
                    rssitem.title = `${item.content.question.title}`;
                    rssitem.description = optimizeContent(item.content.content);
                    break;
                case 'article':
                    rssitem.title = item.content.title;
                    rssitem.description = optimizeContent(item.content.content);
                    break;
                case 'zvideo':
                    rssitem.title = item.content.title;
                    const video = item.content.video;
                    const meta = selectResolution(video);
                    rssitem.description = `${item.content.description}<video
                controls="controls"
                width="${meta.width}"
                height="${meta.height}"
                poster="${video.thumbnail}"
                src="${meta.play_url}">`;
                    break;
                default:
                    rssitem.title = `未知类型${item.content.type}`;
                    rssitem.description = `请点击<a href="https://github.com/DIYgod/RSSHub/issues">链接</a>提交issue`;
            }
            return Promise.resolve(rssitem);
        })
    );

    ctx.state.data = {
        title: `${collection_title}`,
        link: `https://www.zhihu.com/collection/${id}`,
        description: `${collection_description}`,
        item: out.filter((item) => item !== ''),
    };
};
