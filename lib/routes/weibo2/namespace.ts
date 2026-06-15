import type { Namespace } from '@/types';

export const namespace: Namespace = {
    name: '微博 (逆向 API)',
    url: 'weibo.com',
    description: `::: warning
本路由基于微博 APK 逆向分析所得的 API 接口，使用 \`m.weibo.cn\` 端点 + SUB/SUBP Cookie 认证。

大部分路由均需要 Cookies 才能获取。请设置 \`WEIBO_COOKIES\` 环境变量，值为 SUB/SUBP/ALF 等 Cookie 字符串。

获取方法：

1. 浏览器打开 <https://m.weibo.cn> 并登录
2. F12 → Application → Cookies → <https://m.weibo.cn>
3. 复制 SUB、SUBP、ALF 等值，拼接为 \`SUB=xxx; SUBP=xxx; ALF=xxx\`

:::

本路由与 \`/weibo/\` 的区别：

- 直接拼接 containerid，无需两次请求获取用户信息
- 支持分页参数，可获取更多微博
- containerid 规则来自 APK 逆向分析：\`107603{uid}\` = 用户微博时间线

对于微博内容，在 \`routeParams\` 参数中以 query string 格式指定选项，可以控制输出的样式

| 键                         | 含义                              | 接受的值       | 默认值 |
| -------------------------- | --------------------------------- | -------------- | ------ |
| readable                   | 是否开启细节排版可读性优化        | 0/1/true/false | false  |
| authorNameBold             | 是否加粗作者名字                  | 0/1/true/false | false  |
| showAuthorInTitle          | 是否在标题处显示作者              | 0/1/true/false | false  |
| showAuthorInDesc           | 是否在正文处显示作者              | 0/1/true/false | false  |
| showAuthorAvatarInDesc     | 是否在正文处显示作者头像          | 0/1/true/false | false  |
| showEmojiForRetweet        | 显示 "🔁" 取代 "转发" 两个字      | 0/1/true/false | false  |
| showRetweetTextInTitle     | 在标题出显示转发评论              | 0/1/true/false | true   |
| addLinkForPics             | 为图片添加可点击的链接            | 0/1/true/false | false  |
| showTimestampInDescription | 在正文处显示被转发微博的时间戳    | 0/1/true/false | false  |
| widthOfPics                | 微博配图宽                        | 不指定 / 数字  | 不指定 |
| heightOfPics               | 微博配图高                        | 不指定 / 数字  | 不指定 |
| sizeOfAuthorAvatar         | 作者头像大小                      | 数字           | 48     |
| displayVideo               | 是否直接显示微博视频和 Live Photo | 0/1/true/false | true   |
| displayArticle             | 是否直接显示微博文章              | 0/1/true/false | false  |
| displayComments            | 是否直接显示热门评论              | 0/1/true/false | false  |
| showEmojiInDescription     | 是否展示正文和评论中的微博表情    | 0/1/true/false | true   |
| showLinkIconInDescription  | 是否展示正文和评论中的链接图标    | 0/1/true/false | true   |
| preferMobileLink           | 是否使用移动版链接                | 0/1/true/false | false  |
| showRetweeted              | 是否显示转发的微博                | 0/1/true/false | true   |
| showBloggerIcons           | 是否显示评论中博主的标志          | 0/1/true/false | false  |`,
    lang: 'zh-CN',
};
