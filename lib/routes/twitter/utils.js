const querystring = require('querystring');
const URL = require('url');
const config = require('@/config').value;
const Twit = require('twit');
const { fallback, queryToBoolean, queryToInteger } = require('@/utils/readable-social');

const ProcessFeed = (ctx, { data = [] }, params = {}) => {
    // undefined and strings like "exclude_rts_replies" is also safely parsed, so no if branch is needed
    const routeParams = querystring.parse(ctx.params.routeParams);

    const mergedParams = {
        readable: fallback(params.readable, queryToBoolean(routeParams.readable), true),
        authorNameBold: fallback(params.authorNameBold, queryToBoolean(routeParams.authorNameBold), false),
        showAuthorInTitle: fallback(params.showAuthorInTitle, queryToBoolean(routeParams.showAuthorInTitle), false),
        showAuthorInDesc: fallback(params.showAuthorInDesc, queryToBoolean(routeParams.showAuthorInDesc), false),
        showQuotedAuthorAvatarInDesc: fallback(params.showQuotedAuthorAvatarInDesc, queryToBoolean(routeParams.showQuotedAuthorAvatarInDesc), false),
        showAuthorAvatarInDesc: fallback(params.showAuthorAvatarInDesc, queryToBoolean(routeParams.showAuthorAvatarInDesc), false),
        showEmojiForRetweetAndReply: fallback(params.showEmojiForRetweetAndReply, queryToBoolean(routeParams.showEmojiForRetweetAndReply), false),
        showRetweetTextInTitle: fallback(params.showRetweetTextInTitle, queryToBoolean(routeParams.showRetweetTextInTitle), true),
        addLinkForPics: fallback(params.addLinkForPics, queryToBoolean(routeParams.addLinkForPics), false),
        showTimestampInDescription: fallback(params.showTimestampInDescription, queryToBoolean(routeParams.showTimestampInDescription), false),
        showQuotedInTitle: fallback(params.showQuotedInTitle, queryToBoolean(routeParams.showQuotedInTitle), false),

        widthOfPics: fallback(params.widthOfPics, queryToInteger(routeParams.widthOfPics), -1),
        heightOfPics: fallback(params.heightOfPics, queryToInteger(routeParams.heightOfPics), -1),
        sizeOfAuthorAvatar: fallback(params.sizeOfAuthorAvatar, queryToInteger(routeParams.sizeOfAuthorAvatar), 48),
        sizeOfQuotedAuthorAvatar: fallback(params.sizeOfQuotedAuthorAvatar, queryToInteger(routeParams.sizeOfQuotedAuthorAvatar), 24),
    };

    params = mergedParams;

    const {
        readable,
        authorNameBold,
        showAuthorInTitle,
        showAuthorInDesc,
        showQuotedAuthorAvatarInDesc,
        showAuthorAvatarInDesc,
        showEmojiForRetweetAndReply,
        showRetweetTextInTitle,
        addLinkForPics,
        showTimestampInDescription,
        showQuotedInTitle,

        widthOfPics,
        heightOfPics,
        sizeOfAuthorAvatar,
        sizeOfQuotedAuthorAvatar,
    } = params;

    const getQueryParams = (url) => URL.parse(url, true).query;
    const getOriginalImg = (url) => {
        // https://greasyfork.org/zh-CN/scripts/2312-resize-image-on-open-image-in-new-tab/code#n150
        let m = null;
        if ((m = url.match(/^(https?:\/\/\w+\.twimg\.com\/media\/[^/:]+)\.(jpg|jpeg|gif|png|bmp|webp)(:\w+)?$/i))) {
            let format = m[2];
            if (m[2] === 'jpeg') {
                format = 'jpg';
            }
            return `${m[1]}?format=${format}&name=orig`;
        } else if ((m = url.match(/^(https?:\/\/\w+\.twimg\.com\/.+)(\?.+)$/i))) {
            const pars = getQueryParams(url);
            if (!pars.format || !pars.name) {
                return url;
            }
            if (pars.name === 'orig') {
                return url;
            }
            return m[1] + '?format=' + pars.format + '&name=orig';
        } else {
            return url;
        }
    };

    const replaceBreak = (text) => text.replace(/<br><br>|<br>/g, ' ');
    const formatText = (text) =>
        text
            .replace(/https:\/\/t\.co(.*)/g, '')
            .trim()
            .replace(/\n/g, '<br>');
    const formatTextToPlain = (text) => text.replace(/https:\/\/t\.co(.*)/g, '').trim();
    const formatVideo = (media, extraAttrs = '') => {
        let content = '';
        const video = media.video_info.variants.reduce((video, item) => {
            if ((item.bitrate || 0) > (video.bitrate || -Infinity)) {
                video = item;
            }
            return video;
        }, {});

        if (video.url) {
            const gifAutoPlayAttr = media.type === 'animated_gif' ? `autoplay loop muted webkit-playsinline playsinline` : '';
            if (!readable) {
                content += '<br>';
            }
            content += `<video src="${video.url}" ${gifAutoPlayAttr} controls="controls" poster="${getOriginalImg(media.media_url_https)}" ${extraAttrs}></video>`;
        }

        return content;
    };

    const formatMedia = (item) => {
        let img = '';
        item.extended_entities &&
            item.extended_entities.media.forEach((item) => {
                // https://developer.twitter.com/en/docs/tweets/data-dictionary/overview/extended-entities-object
                let content = '';
                let style = '';
                let originalImg;
                switch (item.type) {
                    case 'animated_gif':
                    case 'video':
                        content = formatVideo(item);
                        break;

                    case 'photo':
                    default:
                        originalImg = getOriginalImg(item.media_url_https);
                        if (!readable) {
                            content += `<br>`;
                        }
                        if (addLinkForPics) {
                            content += `<a href="${originalImg}" target="_blank" rel="noopener noreferrer">`;
                        }
                        content += `<img `;
                        if (widthOfPics >= 0) {
                            content += ` width="${widthOfPics}"`;
                            style += `width: ${widthOfPics}px;`;
                        }
                        if (heightOfPics > 0) {
                            content += `height="${heightOfPics}" `;
                            style += `height: ${heightOfPics}px;`;
                        }
                        content += ` style="${style}" ` + `${readable ? 'hspace="4" vspace="8"' : ''} src="${originalImg}">`;
                        if (addLinkForPics) {
                            content += `</a>`;
                        }
                        break;
                }

                img += content;
            });

        if (readable && img) {
            img = `<br>` + img;
        }
        return img;
    };
    const generatePicsPrefix = (item) => {
        // When author avatar is shown, generate invisible <img> for inner images at the beginning of HTML
        // to please some RSS readers
        let picsPrefix = '';
        item.extended_entities &&
            item.extended_entities.media.forEach((item) => {
                let content;
                let originalImg;
                switch (item.type) {
                    case 'video':
                        content = formatVideo(item, `width="0" height="0"`);
                        break;

                    case 'photo':
                    default:
                        originalImg = getOriginalImg(item.media_url_https);
                        content = `<img width="0" height="0" hidden="true" src="${originalImg}">`;
                        break;
                }

                picsPrefix += content;
            });
        return picsPrefix;
    };
    const formatUrl = (item) => {
        let url = '';
        item.entities.urls.forEach((u) => {
            if (readable) {
                url += '<br>';
            } else {
                url += '&ensp;';
            }
            url += `<a href="${u.expanded_url}" target="_blank" rel="noopener noreferrer">${u.expanded_url}</a>`;
        });

        return url;
    };

    return data.map((item) => {
        const originalItem = item;
        item = item.retweeted_status || item;
        item.full_text = formatText(item.full_text);
        const img = formatMedia(item);
        let picsPrefix = generatePicsPrefix(item);
        let url = '';
        let quote = '';
        let quoteInTitle = '';

        // Make quote in description
        if (item.is_quote_status) {
            const quoteData = item.quoted_status;

            if (quoteData) {
                const author = quoteData.user;
                if (readable) {
                    quote += `<br>`;
                    quote += `<blockquote>`;
                } else {
                    quote += `<br>`;
                }

                if (readable) {
                    quote += `<a href="https://twitter.com/${author.screen_name}" target="_blank" rel="noopener noreferrer">`;
                }

                if (showQuotedAuthorAvatarInDesc) {
                    quote += `<img width="${sizeOfQuotedAuthorAvatar}" height="${sizeOfQuotedAuthorAvatar}" src="${author.profile_image_url_https}" ${readable ? 'hspace="8" vspace="8" align="left"' : ''}>`;
                }

                if (authorNameBold) {
                    quote += `<strong>`;
                }

                quote += author.name;

                if (authorNameBold) {
                    quote += `</strong>`;
                }

                if (readable) {
                    quote += `</a>`;
                }

                quote += `:&ensp;`;
                quote += formatText(quoteData.full_text);

                if (!readable) {
                    quote += '<br>';
                }
                quote += formatMedia(quoteData);
                picsPrefix += generatePicsPrefix(quoteData);
                quote += formatUrl(quoteData);
                quoteInTitle += showEmojiForRetweetAndReply ? ' � ' : ' 转 ';
                quoteInTitle += `${author.name}: ${formatTextToPlain(quoteData.full_text)}`;

                if (readable) {
                    quote += `<br><small>Link: <a href="https://twitter.com/${author.screen_name}/status/${quoteData.id_str}" target="_blank" rel="noopener noreferrer">https://twitter.com/${author.screen_name}/status/${quoteData.id_str}</a></small>`;
                }
                if (showTimestampInDescription) {
                    quote += '<br><small>' + new Date(quoteData.created_at).toLocaleString();
                    quote += `</small>`;
                    if (readable) {
                        quote += `<br>`;
                    }
                }

                if (readable) {
                    quote += `</blockquote>`;
                }
            } else {
                url = formatUrl(item);
            }
        } else {
            url = formatUrl(item);
        }

        // Make title
        let title = '';
        if (showAuthorInTitle) {
            title += originalItem.user.name + ': ';
        }
        const isRetweet = originalItem !== item;
        const isQuote = item.is_quote_status;
        if (!isRetweet && (!isQuote || showRetweetTextInTitle)) {
            if (item.in_reply_to_screen_name) {
                title += showEmojiForRetweetAndReply ? '↩️ ' : '回复 ';
            }
            title += replaceBreak(originalItem.full_text);
        }
        if (isRetweet) {
            title += showEmojiForRetweetAndReply ? '� ' : '转 ';
            title += item.user.name + ': ';
            if (item.in_reply_to_screen_name) {
                title += showEmojiForRetweetAndReply ? ' ↩️ ' : ' 回复 ';
            }
            title += replaceBreak(item.full_text);
        }

        if (showQuotedInTitle) {
            title += quoteInTitle;
        }

        // Make description
        let description = '';
        if (showAuthorInDesc && showAuthorAvatarInDesc) {
            description += picsPrefix;
        }
        if (isRetweet) {
            description += `<blockquote>`;
            if (showAuthorInDesc) {
                if (readable) {
                    description += '<small>';
                    description += `<a href="https://twitter.com/${originalItem.user.screen_name}" target="_blank" rel="noopener noreferrer">`;
                }
                if (authorNameBold) {
                    description += `<strong>`;
                }
                description += originalItem.user.name;
                if (authorNameBold) {
                    description += `</strong>`;
                }
                if (readable) {
                    description += '</a>';
                }
                description += '&ensp;';
            }
            // description += showEmojiForRetweetAndReply ? '�' : '转';;
            if (!showAuthorInDesc) {
                description += '&ensp;';
                if (readable) {
                    description += `<a href="https://twitter.com/${item.user.screen_name}" target="_blank" rel="noopener noreferrer">`;
                }
                if (authorNameBold) {
                    description += `<strong>`;
                }
                description += item.user.name;
                if (authorNameBold) {
                    description += `</strong>`;
                }
                if (readable) {
                    description += '</a>';
                }
            }
            if (readable) {
                description += '</small>';
            }
            description += '<br>';
        }
        if (showAuthorInDesc) {
            if (readable) {
                description += `<a href="https://twitter.com/${item.user.screen_name}" target="_blank" rel="noopener noreferrer">`;
            }

            if (showAuthorAvatarInDesc) {
                description += `<img width="${sizeOfAuthorAvatar}" height="${sizeOfAuthorAvatar}" src="${item.user.profile_image_url_https}" ${readable ? 'hspace="8" vspace="8" align="left"' : ''}>`;
            }
            if (authorNameBold) {
                description += `<strong>`;
            }
            description += item.user.name;
            if (authorNameBold) {
                description += `</strong>`;
            }
            if (readable) {
                description += `</a>`;
            }
            description += `:&ensp;`;
        }
//         if (item.in_reply_to_screen_name) {
//             description += showEmojiForRetweetAndReply ? '↩️ ' : '回复 ';
//         }

        description += item.full_text;
        description += url;
        description += img;
        description += quote;
        
        if (isRetweet) {
            description += `</blockquote>`;
        }
        

        if (readable) {
            description += `<br><hr>`;
        }

        if (showTimestampInDescription) {
            description += `<small>${new Date(item.created_at).toLocaleString()}</small>`;
        }

        const authorName = originalItem.user.name;
        return {
            title: title,
            author: authorName,
            description: description,
            pubDate: new Date(item.created_at).toUTCString(),
            link: `https://twitter.com/${item.user.screen_name}/status/${item.id_str}`,
        };
    });
};

let getTwit = () => null;
if (config.twitter.consumer_key && config.twitter.consumer_secret) {
    const consumer_keys = config.twitter.consumer_key.split(',');
    const consumer_secrets = config.twitter.consumer_secret.split(',');
    const T = {};
    let count = 0;
    let index = -1;

    consumer_keys.forEach((consumer_key, index) => {
        const consumer_secret = consumer_secrets[index];
        if (consumer_key && consumer_secret) {
            T[index] = new Twit({
                consumer_key,
                consumer_secret,
                app_only_auth: true,
            });
            count = index + 1;
        }
    });

    getTwit = () => {
        index++;
        return T[index % count];
    };
}

module.exports = {
    ProcessFeed,
    getTwit,
};
