import querystring from 'node:querystring';

import cheerio from 'cheerio';

import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';
import { fallback, queryToInteger } from '@/utils/readable-social';
import timezone from '@/utils/timezone';
// import logger from '@/utils/logger';

const parseContent = async (htmlString) => {
    const $ = cheerio.load(htmlString);

    const pubDate = timezone(parseDate($('.tiptop.cc > .fl.gray').first().attr('title')), +8);

    const content = $('.tpc_content').remove('div[id^=att]');

    $('div[style*="display: none"]').remove();
    // $('span[style*="display: none"]').remove();
    $('[onmouseover]').removeAttr('onmouseover');
    $('[face]').removeAttr('face');
    $('[file]').removeAttr('file');
    $('[id]').removeAttr('id');
    $('[aid]').removeAttr('aid');
    $('[class]').removeAttr('class');
    $('span[style]').removeAttr('style');

    const result = {
        description: content.html(),
        pubDate,
    };

    const test_external_torrent = content.find('a').filter((_, el) =>
        $(el)
            .attr('href')
            .match(/\/list\.php\?name=\w{32}/)
    );

    if (test_external_torrent.length !== 0) {
        const torrent_url = test_external_torrent[0].attribs.href;
        const response = await got.get(torrent_url);
        const magnet_url = response.data.match(/"(magnet:\?.*?)"/);
        if (magnet_url) {
            result.enclosure_url = magnet_url[1];
            result.enclosure_type = 'application/x-bittorrent';
        }
    }

    return result;
};

export default async function handler(ctx) {
    const fid = ctx.params.fid;

    let page = 1,
        search = '',
        size = 30;
    const routeParams = ctx.params.routeParams;
    if (routeParams) {
        const parsed = querystring.parse(routeParams);
        page = fallback(undefined, queryToInteger(parsed.page), page);
        size = fallback(undefined, queryToInteger(parsed.size), size);
        search = fallback(undefined, parsed.search, '');
    }

    const headers = {
        form: {
            type: '0',
            special: '0',
            search,
        }, // 自动编码为 application/x-www-form-urlencoded
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    };
    const rootUrl = 'https://hjd2048.com';

    // https://hjd2048.com/2048/thread.php?fid=135&page=1
    const currentUrl = `${rootUrl}/2048/thread.php?fid=${fid}&page=${page}`;
    const list_response = await got.post(currentUrl, headers);
    const $ = cheerio.load(list_response.data);

    const list = $('.tr3.t_one').toArray().slice(0, size);

    $('#breadCrumb span.fr').remove();
    // $('#shortcut').remove();
    // $('tr[onmouseover="this.className=\'tr3 t_two\'"]').remove();

    const forum_name = $('#breadCrumb').text().replaceAll('»', '-');
    let type_name = '';
    if (ctx.params.type) {
        type_name = $('#t_typedb > .current').text();
        type_name = `[${type_name}]`;
    }

    const out = await Promise.all(
        list.map(async (item) => {
            const $ = cheerio.load(item);

            if (!$('td > a').first().attr('title')) {
                return '';
            }

            if ($("img[title='置顶帖标志']").length !== 0) {
                return '';
            }

            const title = $('a.subject');
            const author = $('a.bl');
            const path = title.attr('href');

            const key = `/2048/${path}`;
            const link = `${rootUrl}/2048/${path}`;

            const cache = await ctx.cache.get(key);
            if (cache) {
                return JSON.parse(cache);
            }

            const rssitem = {
                title: title.text().trim(),
                author: author.text().trim(),
                link,
                guid: key,
            };

            try {
                const response = await got.get(link);
                const result = await parseContent(response.data);

                rssitem.description = result.description;
                rssitem.pubDate = result.pubDate;
                rssitem.enclosure_url = result.enclosure_url;
                rssitem.enclosure_type = result.enclosure_type;
            } catch {
                return '';
            }
            ctx.cache.set(key, JSON.stringify(rssitem));
            return rssitem;
        })
    );

    ctx.state.data = {
        allowEmpty: true,
        title: forum_name + type_name,
        link: currentUrl,
        item: out.filter((item) => item !== ''),
    };
}
