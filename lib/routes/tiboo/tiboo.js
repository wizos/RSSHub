const got = require('@/utils/got');
const cheerio = require('cheerio');
const dateUtil = require('@/utils/date');

const base = 'http://www.tiboo.cn';
const got_net = got.extend({
    headers: {
        Referer: base,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36',
        Host: new URL(base).host,
    },
});

module.exports = async (ctx) => {
    const fid = ctx.params.fid;

    const url = `${base}/${fid}`;
    
    const list_response = await got_net.get(url);
    
    const $ = cheerio.load(list_response.data);
    
    const forum_name = "地宝网：" + $('head > title').text().replace(/^(.*?)_.*?$/, "$1");
    
    const list = $('#main_body > div.bbsList > div.z > ul > li > div').toArray();

    const parseContent = async (htmlString) => {
        let $ = cheerio.load(htmlString);
        const time = $('#readfloor_tpc > div.read_hd > span').attr('title');
        const author = $('[id^=card_sf_tpc_] > span').text();
        
        const content = $('#read_tpc, #read_Att_tpc').map(function(i, el) {
            return $(this).html();
        }).get().join('');
        
        $ = cheerio.load(content);
        $('img[file]').each((i, e) => {
            $(e).attr({
                src: e.attribs['file'],
                width: null,
                height: null,
                });
        });
        
        $('dl.newrate, div.useraction, script').remove();
        $('div[style*="display: none"]').remove();
        $('span[style*="display: none"]').remove();
        $('[onmouseover]').removeAttr('onmouseover');
        $('[face]').removeAttr('face');
        $('[file]').removeAttr('file');
        $('[lazyloaded]').removeAttr('lazyloaded');
        $('[initialized]').removeAttr('initialized');
        $('[id]').removeAttr('id');
        $('[class]').removeAttr('class');
        
        const result = {
        	  author: author,
            description: $('body').html(),
            pubDate: dateUtil(time, 8),
        };

        return result;
    };

    const out = await Promise.all(
        list.slice(0, 20).map(async (item) => {
            const $ = cheerio.load(item);

            const title = $('h3 > a.theme-title');
            const path = title.attr('href');
            const key = `${path}`;
            const link = `${base}${path}`;

            const cache = await ctx.cache.get(key);
            if (cache) {
                return Promise.resolve(JSON.parse(cache));
            }

            const rssitem = {
                title: title.text().trim(),
                link: link,
                guid: key,
            };
            
            //try {
                const response = await got_net.get(link);
                const result = await parseContent(response.data);

                rssitem.author = result.author;
                rssitem.description = result.description;
                rssitem.pubDate = result.pubDate;
            //} catch (err) {
            //    return Promise.resolve('');
            //}
            ctx.cache.set(key, JSON.stringify(rssitem));
            return Promise.resolve(rssitem);
        })
    );

    ctx.state.data = {
        title: forum_name,
        link: url,
        item: out.filter((item) => item !== ''),
    };
};