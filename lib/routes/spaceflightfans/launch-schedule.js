const got = require('@/utils/got');

module.exports = async (ctx) => {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36',
        Referer: `http://www.spaceflightfans.cn`,
    };

    const response = await got({
        method: 'get',
        url: `http://www.spaceflightfans.cn/global-space-flight-schedule/action~agenda/request_format~json?request_type=json&ai1ec_doing_ajax=true`,
        headers: headers,
    });

    const dates = response.data.html.dates;
    
    const items = [];
    for(var name in dates){
       dates[name].events.allday.map( (li) => {
       	    const day = li.enddate_info.month + li.enddate_info.day;
        		const item = {
        			title: li.filtered_title,
        			link: li.permalink,
        			description: "<p>" + day + "</p>" + li.filtered_content,
        			author: `航天爱好者网`,
        		};
        		items.push(item);
        	});
        	
       dates[name].events.notallday.map( (li) => {
       	    const day = li.enddate_info.month + li.enddate_info.day + " " + li.short_start_time;
        		const item = {
        			title: li.filtered_title,
        			link: li.permalink,
        			description: "<p>" + day + "</p>" + li.filtered_content,
        			author: `航天爱好者网`,
        		};
        		items.push(item);
        	});
    }
    
    ctx.state.data = {
        title: `航天发射时刻表`,
        link: `http://www.spaceflightfans.cn/global-space-flight-schedule/action~agenda/request_format~json`,
        description: '航天发射记录及航天事件预报',
        item: items,
    };
};
