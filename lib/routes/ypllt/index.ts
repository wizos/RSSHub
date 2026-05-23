import { load } from 'cheerio';

import type { Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';

export const route: Route = {
    path: '/:fid/:tid?',
    name: '板块',
    maintainers: ['wizos'],
    handler,
    example: '/ypllt/2',
    parameters: { fid: '板块', tid: '分类，可选' },
};

async function handler(ctx) {
    const fid = ctx.req.param('fid');
    const tid = ctx.req.param('tid') ?? '';

    const limit = ctx.req.query('limit') ? Number.parseInt(ctx.req.query('limit')) : 5;

    const rootUrl = 'https://thlbbs.cc';
    const currentUrl = tid ? `${rootUrl}/forum-${fid}-1.htm?orderby=tid&tagids=${tid}___` : `${rootUrl}/forum-${fid}-1.htm?orderby=tid`;

    const response = await got({
        method: 'get',
        url: currentUrl,
    });

    const $ = load(response.data);

    const forumName = $('head > title').text();
    const forumDescription = $('head > meta[name=description]').attr('content') ?? '';

    let items = $('div.card-body > ul > li div.media-body')
        .toArray()
        .slice(0, limit)
        .map((item) => {
            const el = $(item);
            const title = el.find('div.subject > a:nth-child(1)');
            const path = title.attr('href');

            return {
                title: title.text().trim(),
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

                const content = $('div.card.card-thread div.message').html() ?? '';

                $ = load(content);
                $('img[src="images/default/attachimg.gif"]').remove();
                $('dl.newrate, div.useraction, script').remove();
                $('div[style*="display: none"]').remove();
                $('span[style*="display: none"]').remove();
                $('[onmouseover]').removeAttr('onmouseover');
                $('[face]').removeAttr('face');
                $('[file]').removeAttr('file');
                $('[id]').removeAttr('id');
                $('[class]').removeAttr('class');

                item.description = $('body').html();

                return item;
            })
        )
    );

    return {
        title: forumName,
        link: currentUrl,
        description: forumDescription || undefined,
        item: items,
    };
}
