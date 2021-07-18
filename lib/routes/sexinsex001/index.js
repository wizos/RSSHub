const cheerio = require('cheerio');
const got = require('@/utils/got');
const iconv = require('iconv-lite');
const url = require('url');
const config = require('@/config').value;

const base = 'http://www.sis001.com';
const section = '/bbs/forumdisplay.php?fid=';
const got_ins = got.extend({
    headers: {
        Referer: base,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36',
        Cookie: String(config.sexinsex001.cookie),
    },
    //responseType: 'buffer',
});

const sourceTimezoneOffset = -8;
module.exports = async (ctx) => {
    const typefilter = ctx.params.type ? `&filter=type&typeid=${ctx.params.type}&orderby=dateline&ascdesc=DESC` : '&orderby=dateline&ascdesc=DESC';
    const location = `${section}${ctx.params.fid}${typefilter}`;
    
    let title = '';

    let out = [];
    const parseContent = (htmlString) => {
        let $ = cheerio.load(htmlString, { decodeEntities: false });
        const author = $('#wrapper > div:nth-child(1) > form > div:nth-child(2) > table > tbody > tr:nth-child(1) > td.postauthor > cite > a').text();
        let time = $('.postinfo').text();
        const regex = /\d{4}-\d{1,2}-\d{1,2} \d{1,2}:\d{1,2}/;
        const regRes = regex.exec(time);
        time = regRes.length === 0 ? new Date() : new Date(regRes[0]);
        time.setTime(time.getTime() + (sourceTimezoneOffset - time.getTimezoneOffset() / 60) * 60 * 60 * 1000);

        const content = $('.postmessage').first().html();
        $ = cheerio.load(content, { decodeEntities: false });
        $('.postratings').remove();
        $('div.quote').remove();
        const title = $('h2').first().text();
        $('h2').first().remove();
        $("div.box.message > form,img[src$='images/green/attachimg.gif'],img[src$='images/attachicons/image.gif']").remove();
        $('div[style*="display: none"]').remove();
        $('span[style*="display: none"]').remove();

        return {
            title: title,
            author: author,
            description: $('body').html(),
            pubDate: time.toUTCString(),
        };
    };
    const fetch = async (pageindex) => {
        const pageUrl = url.resolve(base, `${location}&page=${pageindex}`);
        const res = await got_ins.get(pageUrl);
        const $ = cheerio.load(res.data);
        title = (ctx.params.type ? `[${$('#headfilter > ul > li.current').text()}]` : '') + $('title').text();
        const list = $('tbody[id^=stickthread_] > tr, tbody[id^=normalthread_] > tr').get();

        const result = await Promise.all(
            list.slice(0, 20).map(async (item) => {
                const $ = cheerio.load(item);
                const guid = $('span[id^=thread]').attr('id'); // thread_7836473
                const link = url.resolve(base, `/bbs/${guid.replace('_', '-')}-1-1.html`);

                // Check cache
                const cache = await ctx.cache.get(link);
                if (cache) {
                    return Promise.resolve(JSON.parse(cache));
                }

                const single = {
                    link: link,
                    guid: guid,
                };

                try {
                    const response = await got_ins.get(link, {
                        headers: {
                            Referer: pageUrl,
                        },
                    });
                    const result = parseContent(response.data);

                    single.title = result.title;
                    single.author = result.author;
                    single.description = result.description;
                    single.pubDate = result.pubDate;
                } catch (err) {
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
        link: url.resolve(base, `${section}${ctx.params.fid}${typefilter}`),
        item: out,
    };
};
