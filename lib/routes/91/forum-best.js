const got = require('@/utils/got');
const cheerio = require('cheerio');
const dateUtil = require('@/utils/date');

module.exports = async (ctx) => {
    const base = 'https://pic.workgreat14.live';

    const url = `${base}/index.php`;

    const list_response = await got.get(url);
    const $ = cheerio.load(list_response.data);

    const list = $('a[title^=最新精华]').toArray();


    const parseContent = async (htmlString) => {
        let $ = cheerio.load(htmlString);

        const title = $('#threadtitle > h1').text();
        const author = $('div.authorinfo > a.posterlink').first().text();
        const time = $('.authorinfo > [id^=authorposton] > span').first().attr('title');
        const content = $('#postlist > div:nth-child(1) td[id^=postmessage_], #postlist > div:nth-child(1) div.postattachlist, #postlist > div:nth-child(1) div.locked, #wrap div.postbox > div.alert_error').map(function(i, el) {
            return $(this).html();
        }).get().join('');

        $ = cheerio.load(content);
        $('img[file]').each((i, e) => {
            $(e).attr({
                src: e.attribs.file,
                width: null,
                height: null,
                });
        });


        $('img[src="images/default/attachimg.gif"]').remove();
        $('dl.newrate, div.useraction, script').remove();
        $('div[style*="display: none"]').remove();
        $('span[style*="display: none"]').remove();
        $('[onmouseover]').removeAttr('onmouseover');
        $('[face]').removeAttr('face');
        $('[file]').removeAttr('file');
        $('[id]').removeAttr('id');
        $('[class]').removeAttr('class');


        const result = {
            title: title,
            author: author,
            description: $('body').html(),
            pubDate: dateUtil(time, 8),
        };

        return result;
    };

    const out = await Promise.all(
        list.slice(0, 10).map(async (item) => {
            const $ = cheerio.load(item);

            const path = $('a').attr('href');

            const key = `${path}`;
            const link = `${base}/${path}`;

            const cache = await ctx.cache.get(key);
            if (cache) {
                return Promise.resolve(JSON.parse(cache));
            }

            const rssitem = {
                link: link,
                guid: key,
            };

            // try {
                const response = await got.get(link);
                const result = await parseContent(response.data);

                rssitem.title = result.title;
                rssitem.author = result.author;
                rssitem.description = result.description;
                rssitem.pubDate = result.pubDate;
            // } catch (err) {
            //    return Promise.resolve('');
            // }
            ctx.cache.set(key, JSON.stringify(rssitem));
            return Promise.resolve(rssitem);
        })
    );

    ctx.state.data = {
        title: '91论坛-精华',
        link: url,
        item: out.filter((item) => item !== ''),
    };
};