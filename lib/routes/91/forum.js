const got = require('@/utils/got');
const cheerio = require('cheerio');
const dateUtil = require('@/utils/date');

module.exports = async (ctx) => {
    const fid = ctx.params.fid;
    let order = ctx.params.order;
    if (!order){
    	  order = 'dateline';
    }

    const base = 'https://pic.workgreat14.live';

    const url = `${base}/forumdisplay.php?fid=${fid}&page=1&orderby=${order}`;

    const list_response = await got.get(url);
    const $ = cheerio.load(list_response.data);

    const list = $('[id^=normalthread]').toArray();
    const forum_name = $('#forumheader > h1').text();

    const parseContent = async (htmlString) => {
        let $ = cheerio.load(htmlString);

        const time = $('.authorinfo > em[id^=authorposton] > span').first().text();
        const content = $('#postlist > div:nth-child(1) td[id^=postmessage_], #postlist > div:nth-child(1) div.postattachlist, #postlist > div:nth-child(1) div.locked, #wrap div.postbox > div.alert_error').map(function(i, el) {
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
            pubDate: dateUtil(time, 8),
        };

        //console.log("时间：" + time + " = " + result.pubDate + "\n");
        //console.log("内容：" + htmlString + "\n");
        
        return result;
    };

    const out = await Promise.all(
        list.slice(0, 20).map(async (item) => {
            const $ = cheerio.load(item);

            const title = $('[id^=thread_] > a');
            const author = $('.author > cite > a');
            const path = title.attr('href')replace('&extra=page%3D1%26amp%3Borderby%3Ddateline','').replace('&extra=page%3D1%26amp%3Borderby%3Dlastpost','').replace('&extra=page%3D1%26amp%3Borderby%3Dhearts','');

            const key = `${path}`;
            const link = `${base}/${key}`;

            const cache = await ctx.cache.get(key);
            if (cache) {
                return Promise.resolve(JSON.parse(cache));
            }

            const rssitem = {
                title: title.text().trim(),
                author: author.text().trim(),
                link: link,
                guid: key,
            };

            //try {
                const response = await got.get(link);
                const result = await parseContent(response.data);

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
