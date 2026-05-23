import { load } from 'cheerio';

import type { Route } from '@/types';
import cache from '@/utils/cache';
import decodeEmails from '@/utils/decode-utils';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';
import timezone from '@/utils/timezone';

export const route: Route = {
    path: '/:id?/:filter?/:orderby?',
    name: '板块',
    maintainers: ['wizos'],
    handler,
    example: '/91forum/4',
    parameters: { id: '板块', filter: '过滤，可选值为 digest(精华)、86400(一天)、604800(周)、2592000(月)，默认为空', orderby: '排序，可选值为 dateline(发帖时间)、replies(回复时间)、lastpost(回帖时间)，默认为 dateline' },
    radar: [
        {
            source: ['forum.91porn.com/forumdisplay.php?fid=:id', 'forum.91porn.com/'],
            target: '/:id?',
        },
    ],
};

async function handler(ctx) {
    const id = ctx.req.param('id') ?? '4';
    const filter = ctx.req.param('filter') ?? '';
    const orderby = ctx.req.param('orderby') ?? 'dateline';

    const limit = ctx.req.query('limit') ? Number.parseInt(ctx.req.query('limit')) : 20;

    const rootUrl = 'https://forum.91porn.com';
    const indexUrl = `${rootUrl}/forumdisplay.php?fid=${id}`;
    const currentUrl = `${indexUrl}${filter === '' ? '' : `&filter=${filter}`}${orderby === '' ? '' : `&orderby=${orderby}`}`;

    const response = await got({
        method: 'get',
        url: currentUrl,
    });

    const $ = load(response.data);

    let items = $('[id^=normalthread]')
        .toArray()
        .slice(0, limit)
        .map((item) => {
            item = $(item);

            const a = item.find('[id^=thread_] > a').first();
            const path = a.attr('href').replace('&extra=page%3D1%26amp%3Borderby%3Ddateline', '').replace('&extra=page%3D1%26amp%3Borderby%3Dlastpost', '').replace('&extra=page%3D1%26amp%3Borderby%3Dhearts', '');

            const author = item.find('.author > cite > a').first();

            return {
                title: a.text().trim(),
                link: `${rootUrl}/${path}`,
                author: author.text().trim()
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

                const dateEm = $('.authorinfo > em[id^=authorposton]').first();
                const dateSpan = dateEm.find('span').first();
                const dateText = (dateSpan.length ? dateSpan.attr('title') : dateEm.text().replace('发表于', '').trim()) ?? '';
                item.pubDate = timezone(parseDate(dateText), +8);

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

                item.description = decodeEmails($('body').html());

                return item;
            })
        )
    );

    return {
        title: $('#forumheader > h1').text(),
        link: currentUrl,
        item: items,
    };
}
