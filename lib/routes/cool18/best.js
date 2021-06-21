const got = require('@/utils/got');
const cheerio = require('cheerio');

module.exports = async (ctx) => {
    const base = 'https://www.cool18.com/bbs6';

    const url = `${base}/index.php?app=forum&act=gold`;

    const list_response = await got.get(url);
    const $ = cheerio.load(list_response.data);

    const list = $('#thread_list > li').toArray();

    const parseContent = async (htmlString) => {
        const $ = cheerio.load(htmlString);

        const author = htmlString.match(/https:\/\/home\.6park\.com\/index\.php\?app=home.+?>(.*?)</i)[1];
        const time = htmlString.match(/于 (\d{4}-\d{1,2}-\d{1,2} \d{1,2}:\d{1,2}) /i)[1];
        if (time === undefined) {
	        time = htmlString.match(/(\d{4}-\d{1,2}-\d{1,2} \d{1,2}:\d{1,2}:\d{1,2})/i)[1];
        }

        const content = $('td.show_content > pre').html();
        content = content.replace(/<!--bodyend-->/g, '');
        content = content.replace(/<font color=#E6E6DD>cool18\.com<\/font>/g, '');
        content = content.replace(/<img(.*?) width=".*?"(.*?)>/g, '<img$1$2>');


        $('img[mydatasrc]').each((i, e) => {
            $(e).attr({
                src: e.attribs.mydatasrc,
                width: null,
                height: null,
                });
        });

        const result = {
	        author: author,
            description: content.html(),
            pubDate: time ? new Date(time) : new Date(),
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
                title: $('a').text().trim(),
                link: link,
                guid: key,
            };

            try {
                const response = await got.get(link);
                const result = await parseContent(response.data);

                rssitem.description = result.description;
                rssitem.pubDate = result.pubDate;
                rssitem.title = result.title;
                rssitem.author = result.author;
            } catch (err) {
                return Promise.resolve('');
            }
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
