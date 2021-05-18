const got = require('@/utils/got');
const cheerio = require('cheerio');

module.exports = async (ctx) => {
    const base = 'https://www.egouz.com';

    const url = `${base}/top`;

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36',
        Referer: base,
        Cookie: 't=e115ae3c808219e3935bbed38e92f02e; r=6437',
    };
    
    const list_response = await got({
        method: 'get',
        url: url,
        headers: headers,
    });
    const $ = cheerio.load(list_response.data);

    const list = $('div.box-module.updatelist-module > table > tbody > tr').toArray();

    const out = await Promise.all(
        list.map(async (item) => {
            const $ = cheerio.load(item);
            
            const path = $('td.title > a').attr('href');

            const key = `${path}`;
            const link = `${base}/${path}`;

            const cache = await ctx.cache.get(key);
            if (cache) {
                return Promise.resolve(JSON.parse(cache));
            }

            const rssitem = {
	            title: $('td.title > a').text(),
                description: $('td.logo > a').html() + $('td.desc').text(),
	            author: 'eGouz',
                pubDate: new Date().toUTCString(),
                link: link,
                guid: key,
            };

            ctx.cache.set(key, JSON.stringify(rssitem));
            return Promise.resolve(rssitem);
        })
    );

    ctx.state.data = {
        title: 'eGouz-最新收录',
        link: url,
        item: out.filter((item) => item !== ''),
    };
};
