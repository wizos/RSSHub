import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';

import { parseContent } from './routes/t66y/utils';

describe('t66y content parser', () => {
    it('converts wrapped Sendvid embeds to iframes', () => {
        const html = '<div class="tpc_content"><a href="https://2023.redircdn.com/?https://sendvid______com/embed/hgwxh2nz&amp;z">[點擊這里打開新視窗]</a></div>';
        const $ = load(parseContent(html) ?? '');

        expect($('iframe').attr('src')).toBe('https://sendvid.com/embed/hgwxh2nz');
        expect($('iframe').attr('allowfullscreen')).toBe('');
        expect($('a')).toHaveLength(0);
    });
});
