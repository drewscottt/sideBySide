chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.url && tab.url.includes("google.com/search") && changeInfo.status == "complete") {
        const queryParameters = tab.url.split("?")[1];
        const urlParameters = new URLSearchParams(queryParameters);
        const regex = /side by side/i;

        if (urlParameters.get("q").match(regex)) {
            let queryTokens = urlParameters.get("q").replace(regex, "");
            queryTokens = queryTokens.split(" ").filter(i => i);
            
            chrome.tabs.sendMessage(tabId, {
                type: "NEW",
                queryTokens: queryTokens,
            });
        }
    }
});