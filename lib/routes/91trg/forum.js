const got = require('@/utils/got');
const cheerio = require('cheerio');
const dateUtil = require('@/utils/date');
const config = require('@/config').value;

const got_ins = got.extend({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36',
        Cookie: String(config.trg91.cookie),
    },
});

module.exports = async (ctx) => {
    const fid = ctx.params.fid;
    //let order = ctx.params.order;
    //if (!order) {
    //	  order = 'dateline';
    //}

    const base = 'https://www.91trg.com';
    const url = `${base}/forum/${fid}?sortby=start_date&sortdirection=desc`;
    
    const list_response = await got_ins.get(url);
    const $ = cheerio.load(list_response.data);

    const forum_name = $('#ipsLayout_mainArea > div.ipsPageHeader > header > h1').text();
    
    const forum_description = $('#ipsLayout_mainArea > div.ipsPageHeader> header > div.ipsType_normal').text();

    const list = $('.ipsDataList > li.ipsDataItem[data-rowid]').toArray();
    
    const parseContent = async (htmlString) => {
        let $ = cheerio.load(htmlString);

        const content = $('div.cPost_contentWrap > div.ipsContained').first().html();

        $ = cheerio.load(content);
        $('video > source').each((i, e) => {
            $(e).attr({
                src: base + e.attribs.src,
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
            description: $('body').html(),
        };

        // console.log("内容：" + htmlString + "\n");
        return result;
    };

    const out = await Promise.all(
        list.slice(0, 20).map(async (item) => {
            const $ = cheerio.load(item);

            const title = $('h4.ipsDataItem_title').text().trim();
            const author = $('.ipsDataItem_lastPoster > li:nth-child(1) > a').text().trim();
            const link = $('h4.ipsDataItem_title > .ipsContained > a').attr('href');
            const pubDate = $('.ipsDataItem_lastPoster > li:nth-child(3) time').attr('datetime'); // dateUtil(time, 8),

            
            const key = link;

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
                rssitem.pubDate = result.pubDate;
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
