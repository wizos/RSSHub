import type { Route } from '@/types';
import got from '@/utils/got';

export const route: Route = {
    path: '/internal',
    name: '今日国内最佳',
    maintainers: ['wizos'],
    handler,
    example: '/xinquji/internal',
};

async function handler() {
    const response = await got({
        method: 'get',
        url: 'https://xinquji.com/frontend/post/groups?cursor=0&only_internal=1',
    });

    return {
        title: '新趣集今日国内最佳',
        link: 'https://xinquji.com',
        item: response.data.data.map((item) => ({
            title: item.name,
            description: `${item.name} ${item.description}`,
            link: 'https://xinquji.com/posts/' + item.id,
        })),
    };
}
