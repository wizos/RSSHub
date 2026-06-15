import type { Namespace } from '@/types';

export const namespace: Namespace = {
    name: '知乎 (Android API)',
    url: 'www.zhihu.com',
    description: `::: tip
使用知乎 Android 客户端 OAuth API，无需 \`x-zse-96\` 签名。需要设置环境变量 \`ZHIHU_ACCESS_TOKEN\` 或 \`ZHIHU_REFRESH_TOKEN\`。

- 优先使用 \`ZHIHU_ACCESS_TOKEN\`（可直接使用）
- 若只配置 \`ZHIHU_REFRESH_TOKEN\`，将自动刷新获取 access\\_token
- 获取方式：从已登录的知乎 Android 客户端中提取（需 root 设备）

:::`,
    lang: 'zh-CN',
};
