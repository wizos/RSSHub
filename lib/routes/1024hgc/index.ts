import { load } from 'cheerio';

import type { Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';
import timezone from '@/utils/timezone';

export const route: Route = {
    path: '/:fid/:type?',
    name: '板块',
    maintainers: ['wizos'],
    handler,
    example: '/1024hgc/2',
    parameters: { fid: '板块', type: '分类，可选' },
    features: {
        nsfw: true,
    },
};

async function handler(ctx) {
    const fid = ctx.req.param('fid');
    const type = ctx.req.param('type') ?? '';
    const limit = ctx.req.query('limit') ? Number.parseInt(ctx.req.query('limit')) : 20;

    const rootUrl = 'https://9k1024.com';
    const typeFilter = type ? `&type=${type}` : '';
    const currentUrl = `${rootUrl}/pw/thread.php?fid=${fid}${typeFilter}`;

    const response = await got({
        method: 'get',
        url: currentUrl,
    });

    const $ = load(response.data);

    const title = (type ? `[${$('#t_typedb > .current').text()}]` : '') + $('title').text();

    // Filter out specific ad/sticky threads
    const list = $('#ajaxtable > tbody:last-child .tr3')
        .not('.tr2')
        .not('[align=middle]')
        .filter((_, el) => $(el).find('#td_846891, #td_3940867, #td_5031743, #td_5089707').length === 0)
        .toArray()
        .slice(0, limit);

    let items = list.map((item) => {
        const el = $(item);
        const a = el.find('h3 > a');
        const path = a.attr('href');
        const author = el.find('td > a.bl').text();

        return {
            title: a.text().trim(),
            link: `${rootUrl}/pw/${path}`,
            author,
        };
    });

    items = await Promise.all(
        items.map((item) =>
            cache.tryGet(item.link, async () => {
                const detailResponse = await got({
                    method: 'get',
                    url: item.link,
                });

                let $ = load(detailResponse.data);

                // Parse date from tiptop
                const timeText = $('#td_tpc > div.tiptop > span.fl.gray').text();
                const timeMatch = timeText.match(/\d{4}-\d{1,2}-\d{1,2} \d{1,2}:\d{1,2}/);
                const dateText = timeMatch ? timeMatch[0] : '';

                const content = $('#read_tpc').html() ?? '';

                $ = load(content);
                $("div.box.message > form,img[src$='images/green/attachimg.gif'],img[src$='images/attachicons/image.gif']").remove();
                $('div[style*="display: none"]').remove();
                $('span[style*="display: none"]').remove();

                item.pubDate = dateText ? timezone(parseDate(dateText), +8) : undefined;
                item.description = $('body').html();

                return item;
            })
        )
    );

    return {
        title,
        link: currentUrl,
        item: items,
    };
}
