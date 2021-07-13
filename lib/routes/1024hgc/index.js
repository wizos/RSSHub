const cheerio = require('cheerio');
const got = require('@/utils/got');
const url = require('url');
const config = require('@/config').value;
const querystring = require('querystring');
const { fallback, queryToInteger } = require('@/utils/readable-social');

const base = 'https://k6.colin1994.net';
const section = '/pw/thread.php?fid=';
const got_ins = got.extend({
    headers: {
        Referer: base,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36',
    },
});

const sourceTimezoneOffset = -8;
module.exports = async (ctx) => {
    let size = 20;
    let typefilter = '';
    const routeParams = ctx.params.routeParams;
    if (routeParams) {
        const parsed = querystring.parse(routeParams);
        size = fallback(undefined, queryToInteger(parsed.size), 20);
        typefilter = parsed.type ? `&type=${parsed.type}` : '';
    }
    
    const location = `${section}${ctx.params.fid}${typefilter}`;
    let title = '';

    let out = [];
    const parseContent = (htmlString) => {
        let $ = cheerio.load(htmlString, { decodeEntities: false });
        let time = $('#td_tpc > div.tiptop > span.fl.gray').text();
        const regex = /\d{4}-\d{1,2}-\d{1,2} \d{1,2}:\d{1,2}/;
        const regRes = regex.exec(time);
        time = (regRes !== undefined && regRes !== null || regRes.length === 0) ? new Date() : new Date(regRes[0]);
        time.setTime(time.getTime() + (sourceTimezoneOffset - time.getTimezoneOffset() / 60) * 60 * 60 * 1000);

        const content = $('#read_tpc').html();
        $ = cheerio.load(content, { decodeEntities: false });
        
        $("div.box.message > form,img[src$='images/green/attachimg.gif'],img[src$='images/attachicons/image.gif']").remove();
        $('div[style*="display: none"]').remove();
        $('span[style*="display: none"]').remove();

        return {
            description: $('body').html(),
            pubDate: time.toUTCString(),
        };
    };
    const fetch = async (pageindex) => {
        const pageUrl = url.resolve(base, `${location}&page=${pageindex}`);
        const res = await got_ins.get(pageUrl);

        const $ = cheerio.load(res.data);
        title = (ctx.params.type ? `[${$('#t_typedb > .current').text()}]` : '') + $('title').text();

        let list = $('#ajaxtable > tbody:last-child');
        list = $('.tr3', list).not('.tr2').not('[align=middle]'); // .nextAll()
        //list = list.filter(() => $(this).find('#td_846891, #td_3940867, #td_5031743, #td_5089707').length == 0).slice(0, size).get();

        list = list.filter(function () {
	        const els = $(this).find('#td_846891, #td_3940867, #td_5031743, #td_5089707');
            return els !== undefined && els !== null && els.length == 0;
        }).slice(0, size).get();

        const result = await Promise.all(
            list.map(async (item) => {
                const $ = cheerio.load(item);
                const path = $('h3 > a').attr('href');
                const link = url.resolve(base, `/pw/${path}`);

                // Check cache
                const cache = await ctx.cache.get(link);
                if (cache) {
                    return Promise.resolve(JSON.parse(cache));
                }

                const single = {
	                title: $('h3 > a').text(),
                    link: link,
                    guid: path,
                    author: $('td > a.bl').text(),
                };

                try {
                    const response = await got_ins.get(link, {
                        headers: {
                            Referer: pageUrl,
                        },
                    });
                    const result = parseContent(response.data);

                    single.description = result.description;
                    single.pubDate = result.pubDate;
                } catch (err) {
	                console.log("报错：" + err);
                    return Promise.resolve('');
                }
                ctx.cache.set(link, JSON.stringify(single));
                return Promise.resolve(single);
            })
        );
        out = out.concat(result);
    };

    // 一次读取两页的内容
    await Promise.all([1].map(async (value) => await fetch(value)));

    ctx.state.data = {
        title: title,
        link: url.resolve(base, `${section}${ctx.params.id}${typefilter}`),
        item: out,
    };
};
