const got = require('@/utils/got');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');
const dateUtil = require('@/utils/date');
const urlUtil = require('url');

module.exports = async (ctx) => {
    const fid = ctx.params.fid;

    const base = 'https://www.yamiboard.com';

    const url = `${base}/${fid}/bbs.php`;
    
    const res = await got.get(url);
    
    //iconv.skipDecodeWarning = true;
    let data = iconv.decode(Buffer.from(res.rawBody), "shift_jis");

    const $ = cheerio.load(data);

    const list = $('body > center > form > center > a > table[cellpadding="10"] > tbody > tr > td').toArray();
    const forum_name = $('head > title').text();
    const forum_desc = $('meta[name="description"]').attr('content');

    const out = await Promise.all(
        list.slice(0, 20).map(async (item) => {
            const $ = cheerio.load(item);

            const key =  $('table:nth-child(1) > tbody > tr > td:nth-child(1) > font:nth-child(4) > small').text();
            
            const cache = await ctx.cache.get(key);
            if (cache) {
                return Promise.resolve(JSON.parse(cache));
            }

            $('div[align="right"]').remove();
            $('hr.line02').removeAttr('class');
            $('td > br').remove();
            $('td:empty').remove();
            
            const titleObj = $('table:nth-child(1) > tbody > tr > td:nth-child(1) > font:nth-child(1)');
            const title = titleObj.text();
            titleObj.remove();
            const author = $('table:nth-child(1) > tbody > tr > td:nth-child(1) > b').text();
            let pubDate = $('table:nth-child(1) > tbody > tr > td:nth-child(1) > small').text();
            pubDate = pubDate.replace(/^.*?(\d{4}\/\d{2}\/\d{2})\W+[()\w]+?\W+(\d{2}:\d{2}).*?$/g, '$1 $2:00');
            
            const threadInfoList = $('table[cellpadding="1"]');  // table[cellpadding]:nth-child(odd)
            const firstThreadInfo = threadInfoList.first();
            firstThreadInfo.find('td:nth-child(2), td:nth-child(3), td:nth-child(4)').remove();

            //firstThreadInfo.find('td').unwrap().find('tr').unwrap().find('tbody').unwrap().tagName("div");
            threadInfoList.slice(1, threadInfoList.length).each((i, e) => {
                $(e).find('td:nth-child(1), td:nth-child(2) > font:nth-child(1)').remove(); 
                //.find('td').unwrap().find('tr').unwrap().find('tbody').unwrap().tagName("div");
            });
            //$('table, tbody, tr, td').each((i, item) => (item.tagName = 'div'))

            let linkEls = $('table[cellpadding="2"] a[href^="./img"]');
            linkEls.each((i, e) => {
	            e.tagName = 'img'
	            let el = $(e);
	            el.attr('src', urlUtil.resolve(base, `/${fid}/${el.attr('href')}`));
                //$(e).find('td').unwrap().find('tr').unwrap().find('tbody').unwrap().tagName("div");
            });
            linkEls.removeAttr('target');
            linkEls.removeAttr('href');
            linkEls.children().remove();

            const rssitem = {
                title: title?title:"无题",
                link: `${url}#${key}`,
                author: author,
                description: $.html(),
                pubDate: pubDate,
                guid: key,
            };

            ctx.cache.set(key, JSON.stringify(rssitem));
            return Promise.resolve(rssitem);
        })
    );

    ctx.state.data = {
        title: forum_name,
        description: forum_desc,
        link: url,
        item: out.filter((item) => item !== ''),
    };
};
