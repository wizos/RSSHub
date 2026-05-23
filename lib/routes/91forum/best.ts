import { load } from 'cheerio';

import type { Route } from '@/types';
import cache from '@/utils/cache';
import decodeEmails from '@/utils/decode-utils';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';
import timezone from '@/utils/timezone';

export const route: Route = {
    path: '/best',
    name: '精华',
    maintainers: ['wizos'],
    handler,
    example: '/91forum/best',
    radar: [
        {
            source: ['forum.91porn.com/index.php', 'forum.91porn.com/'],
            target: '/best',
        },
    ],
};

async function handler(ctx) {
    const limit = ctx.req.query('limit') ? Number.parseInt(ctx.req.query('limit')) : 20;

    const rootUrl = 'https://forum.91porn.com';
    const indexUrl = `${rootUrl}/index.php`;

    const response = await got({
        method: 'get',
        url: indexUrl,
    });

    const $ = load(response.data);

    let items = $('div.forumlist > table > tbody > tr > td:nth-child(1) > table > tbody > tr > td > div > a')
        .toArray()
        .slice(0, limit)
        .map((item) => {
            const el = $(item);
            const path = el.attr('href');

            return {
                link: `${rootUrl}/${path}`,
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

                const title = $('#threadtitle > h1').text().trim();
                const author = $('div.authorinfo > a.posterlink').first().text().trim();

                const dateEm = $('.authorinfo > em[id^=authorposton]').first();
                const dateSpan = dateEm.find('span').first();
                const dateText = (dateSpan.length ? dateSpan.attr('title') : dateEm.text().replace('发表于', '').trim()) ?? '';

                const content = $('#postlist > div:nth-child(1) td[id^=postmessage_], #postlist > div:nth-child(1) .attachimg, #postlist > div:nth-child(1) div.locked, #wrap div.postbox > div.alert_error')
                    .toArray()
                    .map((el) => $(el).html())
                    .join('')
                    .trim();

                $ = load(content);
                $('img[file]').each((i, e) => {
                    $(e).attr({
                        src: e.attribs.file,
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

                item.title = title;
                item.author = author;
                item.pubDate = timezone(parseDate(dateText), +8);
                item.description = decodeEmails($('body').html());

                return item;
            })
        )
    );

    return {
        title: '91论坛-精华',
        link: indexUrl,
        item: items,
    };
}
