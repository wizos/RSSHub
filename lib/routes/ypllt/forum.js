const got = require('@/utils/got');
const cheerio = require('cheerio');
const dateUtil = require('@/utils/date');
const config = require('@/config').value;

const got_ins = got.extend({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36',
        //Cookie: String(config.trg91.cookie),
    },
});

module.exports = async (ctx) => {
    const fid = ctx.params.fid;
    const tid = ctx.params.tid;

    const base = 'https://www.ypllt.com';

    let url;
    if(tid){
	    url = `${base}/forum-${fid}-1.htm?orderby=tid&tagids=${tid}___`;
    }else{
	    url = `${base}/forum-${fid}-1.htm?orderby=tid`;
    }
    
    const list_response = await got_ins.get(url);
    const $ = cheerio.load(list_response.data);

    const forum_name = $('head > title').text();
    
    const forum_description = $('head > meta[name=description]').text();

    const list = $('div.card-body > ul > li div.media-body').toArray();
    
    const parseContent = async (htmlString) => {
        let $ = cheerio.load(htmlString);

        const content = $('div.card.card-thread div.message').html();

        $ = cheerio.load(content);
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
            description: $('body').html(),
        };

        // console.log("内容：" + htmlString + "\n");
        return result;
    };

    const out = await Promise.all(
        list.slice(0, 1).map(async (item) => {
            const $ = cheerio.load(item);

            const title = $('div.subject > a:nth-child(1)').text().trim();
            const path = $('div.subject > a:nth-child(1)').attr('href');
            const author = $('div > span.username').text().trim();
            const pubDate = dateUtil($('div > span.date').text(), 8);

            const key = `${path}`;
            const link = `${base}/${path}`;

            const cache = await ctx.cache.get(key);
            if (cache) {
                return Promise.resolve(JSON.parse(cache));
            }

            const rssitem = {
                title: title,
                author: author,
                pubDate: pubDate,
                link: link,
                guid: key,
            };

            // try {
                const response = await got_ins.get(link);
                const result = await parseContent(response.data);

                rssitem.description = result.description;
            // } catch (err) {
            //    return Promise.resolve('');
            // }
            ctx.cache.set(key, JSON.stringify(rssitem));
            return Promise.resolve(rssitem);
        })
    );

    ctx.state.data = {
        title: forum_name,
        link: url,
        item: out.filter((item) => item !== ''),
    };
    if(forum_description){
	    ctx.state.data.description = forum_description;
    }
};
