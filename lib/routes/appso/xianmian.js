const got = require('@/utils/got');

module.exports = async (ctx) => {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36',
        Referer: `http://app.so/xianmian/`,
    };

    const response = await got({
        method: 'get',
        url: `http://app.so/api/v5/appso/discount/?platform=web&limit=10&offset=0`,
        headers: headers,
    });

    const objects = response.data.objects.filter((el) => !el.discount_info[0].expired);
    
    const items = await Promise.all(
        objects.map(async (item) => {
            let original_price = parseFloat(Number(item.discount_info[0].original_price).toFixed(2));
            let discointed_price = parseFloat(Number(item.discount_info[0].discounted_price).toFixed(2));
            return {
                title: item.app.name + ` [¥${original_price}→${discointed_price}]`,
                description: item.content + `<br><img src="${item.app.icon.image}"><br><img src="${item.app.cover_image.image}">`,
                pubDate: new Date(item.published_at * 1000).toUTCString(),
                author: `App 限免`,
                link: item.app.download_link[0].link,
            };
        })
    );

    ctx.state.data = {
        title: `每日精品限免`,
        link: `http://app.so/xianmian`,
        description: '每日精品限免/促销应用 | APPSO',
        item: items,
    };
};
