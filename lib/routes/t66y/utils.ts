import { load } from 'cheerio';

export const baseUrl = 'https://www.t66y.com';

const decodeRedirectUrl = (originUrl: string) =>
    originUrl
        .replaceAll(/.*\?http/g, 'http')
        .replaceAll('______', '.')
        .replace(/&amp;z/, '')
        .replace(/&z/, '')
        .replace('return false', '');

export const parseContent = (htmlString) => {
    const $ = load(htmlString);

    const content = $('div.tpc_content').eq(0);
    content.find('.t_like').remove();

    // Handle img tag
    content.find('img').each((_, ele) => {
        const $ele = $(ele);
        const essData = $ele.attr('ess-data');
        if (essData) {
            $ele.attr('src', essData);
        }
        $ele.removeAttr('ess-data');
        $ele.removeAttr('iyl-data');
    });

    // Handle input tag (convert to img)
    content.find('input').each((_, ele) => {
        const $ele = $(ele);
        const essData = $ele.attr('ess-data');
        if (essData) {
            $ele.replaceWith(`<img src="${essData}" />`);
        }
    });

    // Handle links
    content.find('a').each((_, ele) => {
        const $ele = $(ele);
        const href = $ele.attr('href');
        if (href?.includes('viidii') || href?.includes('redircdn')) {
            const decodedUrl = decodeRedirectUrl(href);
            if (decodedUrl.startsWith('https://sendvid.com/embed/')) {
                $ele.replaceWith($('<iframe></iframe>').attr({ src: decodedUrl, frameborder: '0', allowfullscreen: '' }));
            } else {
                $ele.attr('href', decodedUrl);
            }
        }
    });

    return content.html();
};
