import type { Route } from '@/types';
import got from '@/utils/got';

export const route: Route = {
    path: '/today',
    name: '今日最佳',
    maintainers: ['wizos'],
    handler,
    example: '/xinquji/today',
};

async function handler() {
    const response = await got({
        method: 'get',
        url: 'https://xinquji.com/frontend/post/groups?cursor=0',
    });

    return {
        title: '新趣集今日最佳',
        link: 'https://xinquji.com',
        item: response.data.data.map((item) => ({
            title: item.name,
            description: `${item.name} ${item.description}`,
            link: 'https://xinquji.com/posts/' + item.id,
        })),
    };
}
